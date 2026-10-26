/**
 * 幂等执行工具（AGENTS.md 7.18）
 *
 * [P0-07 2026-10-23 修复] 原实现「先执行业务、后 INSERT 幂等键」存在竞态：
 *   两个并发同 key 请求都能通过 SELECT 空判，各自执行业务并落库，
 *   直到第二个 INSERT 撞主键才回滚到「读缓存」——此时**重复回款/重复合同已经产生**。
 *   此外 key 全局共享，不同用户/业务撞同名 key 会互相读走对方结果。
 *
 * 现协议（占位 → 执行 → 回填）：
 *   1) 无 key：直接执行 fn（渐进增强，未传 key 的调用方行为不变）。
 *   2) 以 `sha256(biz_type + user_id + key)` 作为存储键，实现业务/用户命名空间。
 *   3) 先 INSERT 占位行（result_json = NULL）：
 *        · 插入成功 ⇒ 本请求是唯一执行者；
 *        · 主键冲突 ⇒ 已有请求在执行或已完成：
 *            - 已完成：直接返回首次结果（fromCache=true）；
 *            - 执行中：短轮询等待（默认 5s），超时返回 409002「处理中」，
 *              绝不在占位未释放时重复执行业务。
 *   4) fn 成功 ⇒ UPDATE result_json；fn 失败 ⇒ 删除占位行，允许客户端安全重试。
 *   5) 进程崩溃残留的 pending 行超过 IDEMPOTENCY_STALE_SECONDS（默认 300s）后，
 *      允许后来者删除并重新占位，避免永久卡死。
 *
 * 注意：key 由调用方从请求头 Idempotency-Key 或 body.idempotency_key 取得；
 *       Joi stripUnknown 会剥离未声明字段，body 传入时必须在 schema 显式声明。
 */

const crypto = require('crypto');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

const DEFAULT_PENDING_WAIT_MS = 5000;
const DEFAULT_POLL_MS = 50;
const DEFAULT_STALE_SECONDS = 300;

function readPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const PENDING_WAIT_MS = readPositiveInt(process.env.IDEMPOTENCY_PENDING_WAIT_MS, DEFAULT_PENDING_WAIT_MS);
const POLL_MS = readPositiveInt(process.env.IDEMPOTENCY_POLL_MS, DEFAULT_POLL_MS);
const STALE_SECONDS = readPositiveInt(process.env.IDEMPOTENCY_STALE_SECONDS, DEFAULT_STALE_SECONDS);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 构造存储键：同一 raw key 在不同业务/用户下互不干扰，且固定为 64 字符。
 * @param {string} bizType
 * @param {number|string|null|undefined} userId
 * @param {string} key
 * @returns {string} sha256 hex
 */
function buildStorageKey(bizType, userId, key) {
  const scopeUser = userId === null || userId === undefined ? '0' : String(userId);
  return crypto.createHash('sha256')
    .update(`${bizType}\u0000${scopeUser}\u0000${key}`)
    .digest('hex');
}

function parseResult(resultJson) {
  try {
    return JSON.parse(resultJson);
  } catch (err) {
    const wrapped = new AppError(ErrorCodes.BUSINESS_VALIDATION, '幂等记录损坏，请勿重试并联系管理员');
    wrapped.cause = err;
    throw wrapped;
  }
}

/**
 * 读取占位行状态。
 * @returns {Promise<{status:'missing'|'pending'|'done', result?: any}>}
 */
async function readState(pool, storageKey) {
  const [rows] = await pool.query(
    'SELECT result_json FROM crm_idempotency WHERE idempotency_key = ?',
    [storageKey]
  );
  if (rows.length === 0) return { status: 'missing' };
  if (rows[0].result_json === null || rows[0].result_json === undefined) return { status: 'pending' };
  return { status: 'done', result: parseResult(rows[0].result_json) };
}

/**
 * 等待同 key 的并发请求完成。
 * @returns {Promise<{status:'missing'|'pending'|'done', result?: any}>}
 */
async function waitForState(pool, storageKey) {
  const deadline = Date.now() + PENDING_WAIT_MS;
  for (;;) {
    const state = await readState(pool, storageKey);
    if (state.status !== 'pending') return state;
    if (Date.now() >= deadline) return state;
    await delay(POLL_MS);
  }
}

async function insertPlaceholder(pool, storageKey, bizType) {
  await pool.query(
    'INSERT INTO crm_idempotency (idempotency_key, biz_type, result_json) VALUES (?, ?, NULL)',
    [storageKey, bizType]
  );
}

async function deleteStalePlaceholder(pool, storageKey) {
  const [result] = await pool.query(
    `DELETE FROM crm_idempotency
      WHERE idempotency_key = ?
        AND result_json IS NULL
        AND create_time < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [storageKey, STALE_SECONDS]
  );
  return result.affectedRows > 0;
}

async function deleteOwnPlaceholder(pool, storageKey) {
  try {
    await pool.query(
      'DELETE FROM crm_idempotency WHERE idempotency_key = ? AND result_json IS NULL',
      [storageKey]
    );
  } catch (_err) {
    // fn 已失败，清理占位失败不应掩盖原始业务异常；残留行将在 STALE_SECONDS 后可被接管
  }
}

/**
 * 以幂等方式执行业务函数
 * @param {import('mysql2/promise').Pool} pool
 * @param {string|null|undefined} key - 幂等键；空值退化为直接执行
 * @param {string} bizType - 业务类型标识（payment / contract / ...）
 * @param {() => Promise<any>} fn - 业务函数（内部自行管理事务）
 * @param {number|string} [userId] - 发起用户，用于幂等命名空间；缺省为匿名作用域
 * @returns {Promise<{result: any, fromCache: boolean}>}
 */
async function runIdempotent(pool, key, bizType, fn, userId) {
  if (!key) {
    return { result: await fn(), fromCache: false };
  }

  const storageKey = buildStorageKey(bizType, userId, key);

  let reserved = false;
  try {
    await insertPlaceholder(pool, storageKey, bizType);
    reserved = true;
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  }

  if (!reserved) {
    const state = await waitForState(pool, storageKey);
    if (state.status === 'done') {
      return { result: state.result, fromCache: true };
    }

    if (state.status === 'pending') {
      if (!(await deleteStalePlaceholder(pool, storageKey))) {
        throw new AppError(ErrorCodes.IDEMPOTENCY_IN_PROGRESS);
      }
    }

    // state.status === 'missing'：执行者失败后已释放占位，或刚接管了过期占位
    try {
      await insertPlaceholder(pool, storageKey, bizType);
      reserved = true;
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
      throw new AppError(ErrorCodes.IDEMPOTENCY_IN_PROGRESS);
    }
  }

  let result;
  try {
    result = await fn();
  } catch (err) {
    await deleteOwnPlaceholder(pool, storageKey);
    throw err;
  }

  try {
    await pool.query(
      'UPDATE crm_idempotency SET result_json = ? WHERE idempotency_key = ?',
      [JSON.stringify(result), storageKey]
    );
  } catch (err) {
    // 结果回填失败时保留占位（NULL），宁可后续返回“处理中”也不允许重复执行；
    // 超过 STALE_SECONDS 后由后来者接管。
    err.message = `幂等结果回填失败：${err.message}`;
    throw err;
  }

  return { result, fromCache: false };
}

module.exports = {
  runIdempotent,
  buildStorageKey,
  _internals: { PENDING_WAIT_MS, POLL_MS, STALE_SECONDS }
};

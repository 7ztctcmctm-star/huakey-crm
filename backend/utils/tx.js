/**
 * 事务助手（步骤 B2 · 2026-10-19）
 *
 * 背景：全仓多处「多步写」没有事务边界，或为了避免循环依赖而把子调用拆到池上，
 * 导致半条数据（例如：商机 stage 已更新但 stage_log 未写入）。
 *
 * 设计要点：
 *   1) **同一个入口，两种入参**。传 pool 时本助手「拥有」事务（取连接 → begin → commit/rollback → release）；
 *      传已进入事务的连接时，本助手「加入」调用方的事务（不 begin、不 commit、不 release）。
 *      判据来自 mysql2 的实例能力而非 instanceof —— 后者在测试 mock 上不成立：
 *        · Pool             : 有 getConnection()，无 release()
 *        · PoolConnection   : 有 release()，无 getConnection()   （实测确认）
 *      这样 opportunityService.advanceStage 既可被 controller 直接调用（自己开事务），
 *      也可被 quoteService.approveQuote 在自身事务内调用（复用同一连接）。
 *   2) **向后兼容**：既无 getConnection 也无 beginTransaction 的入参（单测裸 mock pool）
 *      降级为「直接执行 fn」，行为与改造前完全一致，不破坏既有单测。
 *   3) SAVEPOINT：用于「非关键子步骤失败不应毒化主事务」的场景。MySQL 的语句级报错
 *      不会自动回滚整个事务，若不设保存点，子步骤失败后继续 commit 会把它的半成品落库。
 */

/**
 * 该入参是否是连接池（从而能够自己开事务）
 * @param {object} db
 * @returns {boolean}
 */
function isPool(db) {
  return Boolean(db) && typeof db.getConnection === 'function';
}

/**
 * 在事务中执行 fn。
 *
 * @param {object} db - mysql2 Pool 或已进入事务的 PoolConnection（也接受无事务能力的 mock）
 * @param {(conn: object) => Promise<any>} fn - 业务逻辑，用入参 conn 执行 SQL
 * @returns {Promise<any>} fn 的返回值
 */
async function withTransaction(db, fn) {
  // 入参既不能取连接也不能开事务 ⇒ 裸 mock / 非事务对象，直接透传执行（行为不变）
  if (!isPool(db) && typeof db.beginTransaction !== 'function') {
    return fn(db);
  }

  const ownsTx = isPool(db);
  const conn = ownsTx ? await db.getConnection() : db;

  try {
    if (ownsTx) await conn.beginTransaction();
    const result = await fn(conn);
    if (ownsTx) await conn.commit();
    return result;
  } catch (error) {
    if (ownsTx) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        // 回滚失败不应掩盖原始错误，但要留痕
        // eslint-disable-next-line no-console
        console.error('[tx] rollback 失败:', rollbackErr.message);
      }
    }
    throw error;
  } finally {
    if (ownsTx) conn.release();
  }
}

/**
 * 在 SAVEPOINT 保护的范围内执行非关键子步骤。
 *
 * 语义：成功则合并进外层事务；失败则回滚到保存点（撤销该子步骤已做的部分写），
 * **不影响外层事务继续提交** —— 用于「主流程不受子步骤失败阻塞」的场景
 * （如报价审批通过后推进商机阶段，失败只记录日志）。
 *
 * ⚠️ 要求 db 必须是已进入事务的连接；若不是（例如裸 mock），退化为直接执行。
 *
 * @param {object} conn - 已进入事务的 PoolConnection
 * @param {string} name - 保存点名称（同一事务内唯一）
 * @param {() => Promise<any>} fn
 * @returns {Promise<{ ok: true, value: any } | { ok: false, error: Error }>}
 */
async function withSavepoint(conn, name, fn) {
  const canSavepoint = Boolean(conn) && typeof conn.query === 'function'
    && typeof conn.beginTransaction === 'function' && !isPool(conn);

  if (!canSavepoint) {
    try {
      return { ok: true, value: await fn() };
    } catch (error) {
      return { ok: false, error };
    }
  }

  await conn.query('SAVEPOINT ??', [name]);
  try {
    const value = await fn();
    await conn.query('RELEASE SAVEPOINT ??', [name]);
    return { ok: true, value };
  } catch (error) {
    await conn.query('ROLLBACK TO SAVEPOINT ??', [name]);
    await conn.query('RELEASE SAVEPOINT ??', [name]);
    return { ok: false, error };
  }
}

module.exports = { withTransaction, withSavepoint, isPool };

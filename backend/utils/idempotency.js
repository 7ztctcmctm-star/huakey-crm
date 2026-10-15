/**
 * 幂等执行工具（AGENTS.md 7.18）
 *
 * 背景（2026-10-15 交付前自检实测）：
 *   crm_payment 无唯一约束、recordPayment/createContract 无幂等校验，
 *   重复提交 / 双击 / 网络重试会产生重复回款（资金账目错误）与重复合同。
 *
 * 用法：
 *   const { result } = await runIdempotent(pool, key, 'payment', async () => {
 *     // …… 业务事务，返回该操作的结果对象
 *     return { id: result.insertId };
 *   });
 *
 * 语义：
 *   1) 无 key：直接执行业务 fn（渐进增强，未传 key 的调用方行为不变）。
 *   2) 有 key 且已存在：返回首次成功的结果（fromCache=true），不重复执行业务。
 *   3) 有 key 且不存在：执行业务 fn；仅【成功】才记 key —— fn 抛错则不插记录，
 *      客户端可安全重试（重试会重新执行业务）。
 *   4) 并发同 key：INSERT 撞主键（ER_DUP_ENTRY）时读取抢先请求的结果返回，
 *      保证两个并发请求拿到同一份结果。
 *
 * 注意：key 由调用方（controller）从请求头 Idempotency-Key 或 body.idempotency_key 取得；
 *       Joi stripUnknown 会剥离未声明字段，body 传入时必须在 schema 显式声明。
 */

/**
 * 以幂等方式执行业务函数
 * @param {import('mysql2/promise').Pool} pool
 * @param {string|null|undefined} key - 幂等键；空值退化为直接执行
 * @param {string} bizType - 业务类型标识（payment / contract）
 * @param {() => Promise<any>} fn - 业务函数（内部自行管理事务）
 * @returns {Promise<{result: any, fromCache: boolean}>}
 */
async function runIdempotent(pool, key, bizType, fn) {
  if (!key) {
    return { result: await fn(), fromCache: false };
  }

  const [rows] = await pool.query(
    'SELECT result_json FROM crm_idempotency WHERE idempotency_key = ?',
    [key]
  );
  if (rows.length > 0) {
    return { result: JSON.parse(rows[0].result_json), fromCache: true };
  }

  const result = await fn();

  try {
    await pool.query(
      'INSERT INTO crm_idempotency (idempotency_key, biz_type, result_json) VALUES (?, ?, ?)',
      [key, bizType, JSON.stringify(result)]
    );
  } catch (err) {
    // 并发同 key：另一请求已抢先记录 ⇒ 读回它的结果，保证双方结果一致
    if (err.code === 'ER_DUP_ENTRY') {
      const [again] = await pool.query(
        'SELECT result_json FROM crm_idempotency WHERE idempotency_key = ?',
        [key]
      );
      if (again.length > 0) {
        return { result: JSON.parse(again[0].result_json), fromCache: true };
      }
    }
    throw err;
  }

  return { result, fromCache: false };
}

module.exports = { runIdempotent };

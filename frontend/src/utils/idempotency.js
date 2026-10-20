/**
 * @file 幂等键工具（前端侧）
 *
 * ## 背景
 * 后端 5 类写接口已接入 `crm_idempotency`（`backend/utils/idempotency.js` 的 `runIdempotent`），
 * 幂等键取 **Idempotency-Key 请求头** 或 `body.idempotency_key`。
 * 在补本文件之前前端从未发送该键，服务端读到的 key 恒为 null ⇒ 直接透传执行，
 * 幂等能力形同虚设（网络重试 / 401 续期重放都会二次写库）。
 *
 * ## 粒度：每次「业务调用」一个 key，不是每次 HTTP 请求
 * 拦截器在 401 后会用 `request(originalConfig)` 重放原请求，此时 config.headers 已被写好，
 * 同一个 key 会随重放一起复用 ⇒ 恰好命中幂等表返回首次结果，不会产生第二条数据。
 *
 * ## 为什么不用 body 传
 * `/purchase/request/submit/:id` 没有 body schema（stripUnknown 会剥离未声明字段），
 * 幂等键只能走请求头。统一用请求头，一个机制覆盖全部端点。
 */

/** 后端 validate.js 中 idempotency_key 的 max(64) */
const MAX_KEY_LENGTH = 64;

/**
 * 生成随机串：优先 Web Crypto，退化到 Math.random
 * @returns {string}
 */
function randomPart() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID().replace(/-/g, '');
  }
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    g.crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 同毫秒内的自增序号，避免同一毫秒两次调用拿到同一个 key */
let seq = 0;

/**
 * 生成一个幂等键
 * @param {string} [prefix] - 业务前缀，便于后端排障时分辨来源（如 'claim' / 'transfer'）
 * @returns {string} 长度 ≤ 64
 */
export function newIdempotencyKey(prefix = 'fe') {
  seq = (seq + 1) % 100000;
  const key = `${prefix}-${Date.now().toString(36)}-${seq}-${randomPart()}`;
  return key.length > MAX_KEY_LENGTH ? key.slice(0, MAX_KEY_LENGTH) : key;
}

/**
 * 给 axios 请求配置附加 Idempotency-Key 请求头
 * @param {Object} [config] - 原 axios config（可含 responseType 等）
 * @param {string} [prefix] - 见 newIdempotencyKey
 * @returns {Object} 新 config（不修改入参）
 */
export function withIdempotencyKey(config = {}, prefix) {
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      'Idempotency-Key': newIdempotencyKey(prefix)
    }
  };
}

export default withIdempotencyKey;

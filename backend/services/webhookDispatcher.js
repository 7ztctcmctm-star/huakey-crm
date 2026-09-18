/**
 * Webhook 业务事件派发器（#16）
 *
 * 【背景】
 * `apiPlatformService` 已提供 Webhook 的 CRUD / 日志 / 触发计数，
 * 路由 `/platform/webhooks/:id/test` 也能手动发一条测试消息；
 * 但**业务事件发生时没有任何自动派发**——`insertWebhookLog` / `updateWebhookTrigger`
 * 仅在手动 test 路径被调用，导致「订阅了事件却永远收不到」。
 *
 * 【本模块职责】
 * 提供 `dispatch(pool, eventType, data)`：按事件类型找到订阅中的 Webhook，
 * 逐个 POST 并记录 crm_webhook_log / 更新 fail_count。
 *
 * 【设计约束】
 * 1. **绝不阻塞、绝不影响主业务**：内部 try/catch 吞掉一切异常，只记 logger.error；
 *    调用方无需 await（可 fire-and-forget），失败也不得让业务事务回滚。
 * 2. **SSRF 防护与 /test 保持一致**：仅 http/https，拒绝内网 / 保留地址。
 * 3. **超时 10s**，与 /test 一致。
 * 4. `events` 列为 JSON 文本，容错解析（非法 JSON 视为空订阅）。
 *
 * 【返回值语义】
 * `dispatched` = **HTTP 2xx 投递成功**的 Webhook 条数。
 * 网络错误 / 超时 / URL 被 SSRF 拒绝 / 对端返回非 2xx 都不计入
 * （它们仍会在 crm_webhook_log 留下 failed 记录）。
 */

// 注意：logger 是全局日志工具（含 error/warn/info），
// 不是 middleware/logger（那里只有 logAction/createRouteLogger 等，没有 error）。
const logger = require('../config/logger');
const defaultPool = require('../config/database');

const TIMEOUT_MS = 10000;

/** 内网 / 保留地址黑名单（与 routes/api-platform.js /test 保持一致） */
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal'];
const BLOCKED_HOST_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

/**
 * 校验 webhook URL 是否允许请求（防 SSRF）
 * @returns {{ ok: boolean, reason?: string }}
 */
function isUrlAllowed(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { ok: false, reason: 'URL 为空' };
  const { URL } = require('url');
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return { ok: false, reason: 'URL 格式无效' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, reason: '仅支持 http/https' };
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(hostname) || BLOCKED_HOST_RE.test(hostname)) {
    return { ok: false, reason: '不允许请求内网地址' };
  }
  return { ok: true };
}

/** 容错解析 events 列（JSON 数组文本） */
function parseEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * 向单个 webhook 发送事件。
 *
 * 本函数**不抛异常**：网络错误 / 超时 / 非 2xx 都会记录日志并返回 false，
 * 由调用方据此统计成功数（单条失败不应中断其它订阅者）。
 *
 * @returns {Promise<boolean>} 是否真正投递成功（HTTP 2xx）
 */
async function sendToWebhook(pool, webhook, eventType, payload) {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhook.secret || '', 'X-Webhook-Event': eventType },
      body,
      signal: controller.signal
    });
    clearTimeout(timer);
    const responseBody = await response.text().catch(() => '');
    const { insertWebhookLog, updateWebhookTrigger } = require('./apiPlatformService');
    await insertWebhookLog(pool, {
      webhook_id: webhook.id, event_type: eventType, payload: body,
      response_status: response.status, response_body: responseBody.slice(0, 1000),
      status: response.ok ? 'success' : 'failed'
    });
    await updateWebhookTrigger(pool, webhook.id, response.ok);
    return !!response.ok;
  } catch (err) {
    clearTimeout(timer);
    const { insertWebhookLog, updateWebhookTrigger } = require('./apiPlatformService');
    const status = err && err.name === 'AbortError' ? 'timeout' : 'failed';
    await insertWebhookLog(pool, {
      webhook_id: webhook.id, event_type: eventType, payload: body, status
    });
    await updateWebhookTrigger(pool, webhook.id, false);
    return false;
  }
}

/**
 * 派发业务事件到所有订阅它的启用中 Webhook。
 *
 * ⚠️ 调用方可以 `webhookDispatcher.dispatch(null, 'customer.created', {...})`
 * ——不传 pool 时使用全局连接池；本函数不会 throw。
 *
 * @param {object} [pool]    连接池；省略时使用全局 pool
 * @param {string} eventType 事件名（见前端 api-platform.vue 的 allEvents）
 * @param {object} data      事件负载
 */
async function dispatch(pool, eventType, data = {}) {
  const db = pool || defaultPool;
  try {
    if (!eventType) return { dispatched: 0 };
    const [rows] = await db.query(
      'SELECT id, name, url, events, secret FROM crm_webhook WHERE status = 1 AND deleted_at IS NULL'
    );
    const subscribers = (rows || []).filter(w => parseEvents(w.events).includes(eventType));
    if (subscribers.length === 0) return { dispatched: 0 };

    const payload = { event: eventType, timestamp: new Date().toISOString(), data };
    let dispatched = 0;
    for (const w of subscribers) {
      const check = isUrlAllowed(w.url);
      if (!check.ok) {
        // URL 不安全：不发送，但仍记一条 failed 日志便于排查
        try {
          const { insertWebhookLog } = require('./apiPlatformService');
          await insertWebhookLog(db, {
            webhook_id: w.id, event_type: eventType, payload: JSON.stringify(payload),
            status: 'failed', response_body: `URL 被拒绝: ${check.reason}`
          });
        } catch (e) { logger.error('[Webhook派发] 记录拒绝日志失败:', { error: e.message }); }
        continue;
      }
      // 单条失败不影响其它订阅者；sendToWebhook 不抛异常，返回是否投递成功
      try {
        const ok = await sendToWebhook(db, w, eventType, payload);
        if (ok) dispatched++;
      } catch (e) {
        logger.error('[Webhook派发] 单个发送异常:', { error: e.message, webhookId: w.id });
      }
    }
    return { dispatched };
  } catch (err) {
    // 派发器绝不影响主业务
    logger.error('[Webhook派发] 派发失败:', { error: err.stack || err.message, eventType });
    return { dispatched: 0, error: err.message };
  }
}

module.exports = { dispatch, isUrlAllowed, parseEvents };

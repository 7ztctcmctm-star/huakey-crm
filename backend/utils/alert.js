const { sendMarkdown, sendEmailAlert } = require('./notification');
const isAlertEnabled = process.env.ALERT_ENABLED === 'true';

// 防抖 Map: key -> 上次告警时间戳 (ms)
// key 格式: "level:source:message前80字符"
const debounceMap = new Map();
const DEBOUNCE_MS = 5 * 60 * 1000; // 5 分钟

// 500 错误滑动窗口统计
const ERROR_WINDOW_MS = 5 * 60 * 1000;
const ERROR_500_THRESHOLD = 10;
let error500Window = [];
let error500AlertSent = false;

/**
 * 清理过期的防抖条目（超过 DEBOUNCE_MS * 2 未触发的 key 删除，防止内存泄漏）。
 * 每次 alertError 调用时惰性清理。
 */
function cleanupDebounceMap() {
  const now = Date.now();
  for (const [key, lastTime] of debounceMap) {
    if (now - lastTime > DEBOUNCE_MS * 2) {
      debounceMap.delete(key);
    }
  }
}

/**
 * 记录 500 错误，触发阈值告警。
 * 由全局错误处理中间件调用。
 */
function record500Error() {
  const now = Date.now();
  error500Window.push(now);
  error500Window = error500Window.filter(t => now - t <= ERROR_WINDOW_MS);

  if (!error500AlertSent && error500Window.length >= ERROR_500_THRESHOLD) {
    error500AlertSent = true;
    alertError({
      level: 'critical',
      source: 'ErrorRate',
      message: `5 分钟内 500 错误达到 ${error500Window.length} 次，请立即检查服务状态`,
      timestamp: new Date(now).toISOString()
    });
  }
}

// 当 500 错误频率下降后，重置告警状态，允许再次触发
setInterval(() => {
  const now = Date.now();
  error500Window = error500Window.filter(t => now - t <= ERROR_WINDOW_MS);
  if (error500AlertSent && error500Window.length < ERROR_500_THRESHOLD) {
    error500AlertSent = false;
  }
}, ERROR_WINDOW_MS);

/**
 * 发送错误告警到企业微信和邮件。
 * - 内置 5 分钟防抖：同一类错误 5 分钟内只发一次
 * - 失败时静默降级，不抛异常也不影响调用方
 * - ALERT_ENABLED=false 时直接返回
 *
 * @param {object} context
 * @param {'error'|'critical'} context.level - 错误级别
 * @param {string} context.source - 错误来源，如 'ErrorHandler', 'Database', 'Redis', 'CronJob'
 * @param {string} context.message - 错误详情（取 stack 前 300 字符或 message）
 * @param {string} [context.traceId] - 请求追踪 ID
 * @param {string} [context.timestamp] - 时间戳，默认 now
 */
async function alertError(context) {
  if (!isAlertEnabled) return;

  const { level = 'error', source, message, traceId = 'N/A', timestamp } = context;

  // 防抖检查
  const messageKey = (message || '').slice(0, 80);
  const dedupKey = `${level}:${source}:${messageKey}`;

  cleanupDebounceMap();

  const lastTime = debounceMap.get(dedupKey);
  const now = Date.now();
  if (lastTime && now - lastTime < DEBOUNCE_MS) {
    return; // 5 分钟内已告警过，跳过
  }
  debounceMap.set(dedupKey, now);

  // 构造 Markdown 消息
  const time = timestamp || new Date().toISOString();
  const emoji = level === 'critical' ? '🚨' : '⚠️';
  const markdown = [
    `## ${emoji} CRM 系统告警`,
    `> 时间: ${time}`,
    `> 级别: <font color="${level === 'critical' ? 'warning' : 'comment'}">${level}</font>`,
    `> 来源: ${source}`,
    `> TraceID: \`${traceId}\``,
    `> 详情: ${(message || '未知错误').slice(0, 400)}`,
  ].join('\n');

  // 企业微信 + 邮件同时发送（静默降级）
  try {
    await sendMarkdown(markdown);
  } catch {
    // 通知发送失败不影响业务
  }
  try {
    await sendEmailAlert(context);
  } catch {
    // 邮件发送失败不影响业务
  }
}

module.exports = { alertError, record500Error };
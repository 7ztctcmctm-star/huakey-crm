/**
 * SSE 实时通知客户端
 * 自动携带 token，支持重连与心跳，支持多组件同时监听
 */

let eventSource = null
let reconnectTimer = null
let reconnectAttempts = 0
let stopped = false  // 标记是否被主动停止（登出时设为 true，禁止重连）
const MAX_RECONNECT_DELAY = 30000
const MAX_RECONNECT_ATTEMPTS = 10
const messageCallbacks = new Set()

/**
 * 建立 SSE 连接
 * @param {object} callbacks
 * @param {Function} callbacks.onMessage - 收到消息回调
 * @param {Function} [callbacks.onOpen] - 连接成功回调
 * @param {Function} [callbacks.onError] - 错误回调
 */
export function connectSSE(callbacks = {}) {
  if (callbacks.onMessage) messageCallbacks.add(callbacks.onMessage)
  if (eventSource) return

  stopped = false
  ensureVisibilitySelfHeal()
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const url = `${baseUrl}/sse/notifications`

  // SSE 通过 withCredentials 自动携带 httpOnly Cookie，不在 URL 中暴露 token
  eventSource = new EventSource(url, { withCredentials: true })

  eventSource.onopen = () => {
    reconnectAttempts = 0
    if (callbacks.onOpen) callbacks.onOpen()
  }

  eventSource.onmessage = (event) => {
    if (!event.data || event.data.startsWith(':')) return
    try {
      const payload = JSON.parse(event.data)
      messageCallbacks.forEach(cb => cb(payload))
    } catch (e) {
      console.error('[SSE] 消息解析失败:', e)
    }
  }

  eventSource.onerror = (err) => {
    if (callbacks.onError) callbacks.onError(err)
    // [fix] 仅关闭连接，不走 disconnectSSE（它会置 stopped=true，
    // 使下方 if (!stopped) 恒为 false，重连逻辑成为死代码——
    // 任何一次网络抖动后通知将静默失联直到刷新页面）。
    // stopped 专用于登出时的主动断开。
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    if (!stopped) {
      scheduleReconnect(callbacks)
    }
  }
}

/**
 * 移除消息监听回调
 * @param {Function} callback
 */
export function offMessage(callback) {
  if (callback) messageCallbacks.delete(callback)
}

function scheduleReconnect(callbacks) {
  if (reconnectTimer) return
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn('[SSE] 已达最大重连次数，停止重连')
    return
  }
  reconnectAttempts += 1
  const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectSSE(callbacks)
  }, delay)
}

/**
 * 断开 SSE 连接（主动停止，不触发重连）
 */
export function disconnectSSE() {
  stopped = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

/**
 * 重新建立 SSE 连接
 */
export function reconnectSSE(callbacks = {}) {
  disconnectSSE()
  stopped = false
  connectSSE(callbacks)
}

// [fix] 可见性自愈：用户回到页面（休眠唤醒/切换标签页回来）时，
// 若连接已断且非登出主动停止，立即重置退避计数并恢复连接。
// 同时兜底重连次数耗尽（MAX_RECONNECT_ATTEMPTS）后不再自愈的问题。
// 惰性注册：仅在首次 connectSSE（登录后布局挂载）时注册，
// 避免登录页未认证状态下对 401 空转重连。
let visibilitySelfHealRegistered = false

function ensureVisibilitySelfHeal() {
  if (visibilitySelfHealRegistered || typeof document === 'undefined') return
  visibilitySelfHealRegistered = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !eventSource && !stopped) {
      reconnectAttempts = 0
      connectSSE({})
    }
  })
}

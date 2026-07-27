/**
 * SSE 实时通知客户端
 * 自动携带 token，支持重连与心跳，支持多组件同时监听
 */

let eventSource = null
let reconnectTimer = null
let reconnectAttempts = 0
const MAX_RECONNECT_DELAY = 30000
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
    disconnectSSE()
    scheduleReconnect(callbacks)
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
  reconnectAttempts += 1
  const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectSSE(callbacks)
  }, delay)
}

/**
 * 断开 SSE 连接
 */
export function disconnectSSE() {
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
  connectSSE(callbacks)
}

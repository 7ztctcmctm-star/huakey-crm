import request from '@/utils/request'

/**
 * [P1-22] el-upload 统一上传实现（替代 `:action` 直传）。
 *
 * 背景：el-upload 的 `:action` 走内部原生 XHR，绕过 axios 拦截器，
 * 不会携带 X-CSRF-Token，后端 `middleware/csrf.js` 会对所有非 GET 请求
 * 返回 403，表现为回款导入 / 跟进附件 / 服务工单附件全部上传失败。
 *
 * 用法：模板保留 `:action`（提供目标 URL），另加 `:http-request="uploadByRequest"`。
 * Element Plus 对返回 Promise 的 http-request 会自动调用 onSuccess / onError，
 * 这里不要重复调用，否则成功回调会执行两次。
 *
 * @param {object} options Element Plus UploadRequestOptions
 * @returns {Promise<object>} 后端响应体（已被 axios 响应拦截器解包）
 */
export function uploadByRequest(options) {
  const formData = new FormData()
  const data = options.data || {}
  Object.keys(data).forEach((key) => {
    const value = data[key]
    if (value !== undefined && value !== null) formData.append(key, value)
  })
  formData.append(options.filename || 'file', options.file)

  return request.post(options.action, formData, {
    // options.action 已包含 /api/v1 前缀（或完整域名），禁用实例 baseURL 防止重复拼接
    baseURL: '',
    // 大文件上传不设超时（原生 el-upload 同样无超时）
    timeout: 0,
    onUploadProgress: (event) => {
      if (!event || !event.total || typeof options.onProgress !== 'function') return
      options.onProgress({ percent: Math.round((event.loaded / event.total) * 100) })
    }
  })
}

export default uploadByRequest

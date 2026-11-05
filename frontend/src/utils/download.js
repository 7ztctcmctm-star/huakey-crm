/**
 * [P1-24] 浏览器文件下载统一入口。
 *
 * 背景：后端导出接口在失败时返回 JSON（{code,message,data}），若 API 未声明
 * responseType:'blob'，axios 会把 xlsx 当文本解析，再被 `new Blob([res])` 包成损坏文件；
 * 即便声明了 blob，错误响应也会是 Blob（type=application/json），直接 createObjectURL
 * 会下载一个内容为 JSON 的“.xlsx”。本函数统一处理这两种情况。
 */

/** 从 Blob 中尝试解析后端 JSON 错误体 */
async function readJsonBlob(blob) {
  try {
    return JSON.parse(await blob.text())
  } catch {
    return null
  }
}

/**
 * 触发浏览器下载；若数据实际是后端 JSON 错误体，则抛出带 message 的 Error。
 * @param {Blob|ArrayBuffer|string} data 后端响应（通常为 Blob）
 * @param {string} filename 下载文件名
 * @param {string} [fallbackType] 非 Blob 数据时的 MIME 类型
 */
export async function downloadBlob(data, filename, fallbackType = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: fallbackType })

  if (blob.type && blob.type.includes('application/json')) {
    const payload = await readJsonBlob(blob)
    const error = new Error(payload?.message || '下载失败：服务器返回了错误信息')
    // 标记为业务错误，调用方据此展示后端 message，而不是笼统的“下载失败”
    error.isDownloadError = true
    throw error
  }

  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('当前环境不支持文件下载')
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default downloadBlob

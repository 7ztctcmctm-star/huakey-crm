import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

// token 续期状态：避免多个 401 请求同时触发续期
let isRefreshing = false
let refreshSubscribers = []

/**
 * 从 document.cookie 中读取指定名称的 cookie 值
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(name) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + encodeURIComponent(name).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

function onRefreshed() {
  refreshSubscribers.forEach(sub => sub.resolve())
  refreshSubscribers = []
}

function onRefreshFailed(error) {
  refreshSubscribers.forEach(sub => sub.reject(error))
  refreshSubscribers = []
}

function addSubscriber(resolve, reject) {
  refreshSubscribers.push({ resolve, reject })
}

// 创建axios实例
// 认证通过 httpOnly Cookie 由浏览器自动携带，前端不再存储 token
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 60000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // token 由 httpOnly Cookie 自动携带，无需手动设置 Authorization

    // 非 GET/HEAD/OPTIONS 请求需携带 CSRF Token（double-submit cookie）
    const method = (config.method || 'GET').toUpperCase()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = getCookie('csrf-token')
      if (csrfToken) {
        config.headers = config.headers || {}
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }

    return config
  },
  (error) => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    // 直接返回响应数据
    return response.data
  },
  async (error) => {
    console.error('响应错误:', error)

    if (error.response) {
      const { status, data } = error.response
      const originalConfig = error.config

      switch (status) {
        case 400:
          ElMessage.error(data.message || '请求参数错误')
          break
        case 401: {
          // 登录页的401是正常的未认证状态，不需要处理
          if (router.currentRoute?.value?.path === '/login') {
            break
          }

          // /auth/me 失败时交给路由守卫处理，避免和守卫 next('/login') 冲突导致无限重定向
          if (originalConfig.url === '/auth/me') {
            break;
          }

          // 避免对续期请求本身重试或排队
          if (originalConfig.url === '/auth/refresh') {
            ElMessage.error(data.message || '登录已过期，请重新登录')
            router.push('/login')
            break;
          }

          if (!isRefreshing) {
            isRefreshing = true
            try {
              // 调用后端 /auth/refresh 换取新 token（使用原生 axios 避免拦截器递归）
              // 旧 token 通过 Cookie 自动携带，刷新后后端会设置新 Cookie
              const refreshRes = await axios.post('/auth/refresh', {}, {
                baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
                timeout: 60000,
                withCredentials: true
              })
              if (refreshRes.data?.code === 200) {
                // 重试所有排队的请求
                onRefreshed()
                // 重试当前请求（finally 块会先于 return 执行，确保 isRefreshing 复位）
                return request(originalConfig)
              }
              // 续期返回非 200
              onRefreshFailed(new Error(refreshRes.data?.message || '令牌刷新失败'))
            } catch (refreshError) {
              // 续期失败，通知所有排队请求
              onRefreshFailed(refreshError)
            } finally {
              isRefreshing = false
            }
            ElMessage.error(data.message || '登录已过期，请重新登录')
            router.push('/login')
          } else {
            // 已在续期中，将请求排队等待续期完成后重试
            return new Promise((resolve, reject) => {
              addSubscriber(
                () => resolve(request(originalConfig)),
                (err) => reject(err)
              )
            })
          }
          break
        }
        case 403:
          ElMessage.error(data.message || '没有权限访问')
          break
        case 404:
          ElMessage.error(data.message || '请求的资源不存在')
          break
        case 500:
          ElMessage.error(data.message || '服务器内部错误')
          break
        default:
          ElMessage.error(data.message || '请求失败')
      }
    } else if (error.code === 'ECONNABORTED') {
      // 请求超时
      ElMessage.error('请求超时，请稍后重试')
    } else if (error.request) {
      // 请求已发送但没有收到响应
      ElMessage.error('网络错误，请检查网络连接')
    } else {
      // 请求配置出错
      ElMessage.error('请求配置错误')
    }

    return Promise.reject(error)
  }
)

// 封装GET请求
export const get = (url, params = {}) => {
  return request.get(url, { params })
}

// 封装POST请求
export const post = (url, data = {}) => {
  return request.post(url, data)
}

// 封装PUT请求
export const put = (url, data = {}) => {
  return request.put(url, data)
}

// 封装DELETE请求
export const del = (url, params = {}) => {
  return request.delete(url, { params })
}

// 导出axios实例
export default request

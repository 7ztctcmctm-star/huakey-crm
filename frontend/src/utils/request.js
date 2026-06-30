import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

// token 续期状态：避免多个 401 请求同时触发续期
let isRefreshing = false
let refreshSubscribers = []

function onRefreshed() {
  refreshSubscribers.forEach((cb) => cb())
  refreshSubscribers = []
}

function addSubscriber(cb) {
  refreshSubscribers.push(cb)
}

// 创建axios实例
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

          // 避免对续期请求本身重试
          if (originalConfig.url === '/auth/me') {
            ElMessage.error(data.message || '登录已过期，请重新登录')
            router.push('/login')
            break
          }

          if (!isRefreshing) {
            isRefreshing = true
            try {
              // 尝试通过 /auth/me 静默续期（后端会刷新 cookie）
              const res = await request.get('/auth/me')
              if (res.code === 200) {
                // 续期成功，重试所有排队的请求
                isRefreshing = false
                onRefreshed()
                return request(originalConfig)
              }
            } catch {
              // 续期失败，token 确实过期
              isRefreshing = false
              refreshSubscribers = []
            }
            ElMessage.error(data.message || '登录已过期，请重新登录')
            router.push('/login')
          } else {
            // 已在续期中，将请求排队等待续期完成后重试
            return new Promise((resolve) => {
              addSubscriber(() => {
                resolve(request(originalConfig))
              })
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

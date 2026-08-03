import { test as base } from '@playwright/test'

const API_BASE_URL = process.env.VITE_API_BASE_URL || '/api/v1'

/**
 * 读取 E2E 管理员账号（从环境变量，不硬编码）
 * 优先级：E2E_ADMIN_USER / E2E_ADMIN_PASSWORD（Demo 账号体系）
 * 回退：E2E_USERNAME / E2E_PASSWORD（兼容旧变量名 / CI 注入）
 * 均未设置时 fail-fast，提示配置 .env.test
 */
function getAdminCredentials() {
  const username = process.env.E2E_ADMIN_USER || process.env.E2E_USERNAME
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.E2E_PASSWORD
  if (!username || !password) {
    throw new Error(
      'E2E 测试账号未配置：缺少 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD。\n' +
      '请在仓库根目录创建 .env.test（可从 .env.test.example 复制），\n' +
      '或先执行 `cd backend && npm run seed:demo` 创建 Demo 账号。\n' +
      '详见 docs/DEMO_DATA_GUIDE.md'
    )
  }
  return { username, password }
}

/**
 * 从响应头 set-cookie 数组中解析出指定 name 的 cookie 对象
 * @param {string[]|undefined} setCookieHeaders
 * @param {string} name
 * @returns {{name:string,value:string,domain:string,path:string,httpOnly?:boolean,secure?:boolean,sameSite?:string}|null}
 */
function parseCookieFromHeaders(setCookieHeaders, name) {
  // set-cookie 头可能是字符串（单条）或数组（多条），统一归一化为数组
  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : typeof setCookieHeaders === 'string'
      ? [setCookieHeaders]
      : []
  if (headers.length === 0) return null
  const raw = headers.find((c) => c.startsWith(`${name}=`))
  if (!raw) return null

  const parts = raw.split(';').map((p) => p.trim())
  const [nameValue] = parts
  const value = nameValue.split('=').slice(1).join('=')

  return {
    name,
    value,
    domain: 'localhost',
    path: '/',
    httpOnly: parts.some((p) => p.toLowerCase() === 'httponly'),
    secure: parts.some((p) => p.toLowerCase() === 'secure'),
    sameSite: ['Strict', 'Lax', 'None'].includes(
      (parts.find((p) => p.toLowerCase().startsWith('samesite='))?.split('=')[1] || 'Lax')
    )
      ? (parts.find((p) => p.toLowerCase().startsWith('samesite='))?.split('=')[1] || 'Lax')
      : 'Lax'
  }
}

// 绕过验证码的登录 fixture
// 后端用 httpOnly Cookie 存 token，前端 withCredentials: true 自动携带
// 认证状态由 useUser.verifyAuth() 调用 /auth/me 实时校验
export const test = base.extend({
  authenticatedPage: async ({ page, request }, use) => {
    // 1. 获取验证码
    const captchaRes = await request.get(`${API_BASE_URL}/auth/captcha`)
    const captchaData = await captchaRes.json()

    // 2. 通过 API 登录；后端会在响应头 Set-Cookie 中写入 token（httpOnly）和 csrf-token
    const { username, password } = getAdminCredentials()
    const loginRes = await request.post(`${API_BASE_URL}/auth/login`, {
      data: {
        username,
        password,
        captcha: '0000',
        captchaKey: captchaData.data?.key
      }
    })

    const loginData = await loginRes.json()
    if (loginData.code !== 200) {
      throw new Error(`E2E 登录失败：${loginData.message || loginRes.statusText()}`)
    }

    // 3. 将后端设置的 httpOnly token cookie 与 CSRF cookie 同步到 page context
    //    使 page 在访问 /auth/me 时自动携带 token，并在后续非 GET 请求中附加 CSRF header
    //    注意：用 headersArray() 获取所有 Set-Cookie 头，避免 headers() 合并多条 cookie 头导致解析失败
    const headersArray = loginRes.headersArray()
    const setCookies = headersArray
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
    const tokenCookie = parseCookieFromHeaders(setCookies, 'token')
    const csrfCookie = parseCookieFromHeaders(setCookies, 'csrf-token')

    if (!tokenCookie) {
      throw new Error('E2E 登录响应未返回 httpOnly token cookie。请确认后端 auth 路由是否正确设置 token cookie。')
    }
    if (!csrfCookie) {
      throw new Error('E2E 登录响应未返回 csrf-token cookie。请确认 CSRF 中间件是否已挂载，以及 NODE_ENV 是否正确。')
    }

    await page.context().addCookies([tokenCookie, csrfCookie])

    await use(page)
  }
})

export { expect } from '@playwright/test'

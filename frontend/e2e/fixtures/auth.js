import { test as base } from '@playwright/test'

const API_BASE_URL = process.env.VITE_API_BASE_URL || '/api/v1'

// 默认测试账号（需与 seeds/init-complete.sql 中初始账号一致）
const DEFAULT_TEST_USER = {
  username: process.env.E2E_USERNAME || 'admin',
  password: process.env.E2E_PASSWORD || 'Admin@123'
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
    const loginRes = await request.post(`${API_BASE_URL}/auth/login`, {
      data: {
        username: DEFAULT_TEST_USER.username,
        password: DEFAULT_TEST_USER.password,
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
    const setCookies = loginRes.headers()['set-cookie'] || []
    const tokenCookie = parseCookieFromHeaders(setCookies, 'token')
    const csrfCookie = parseCookieFromHeaders(setCookies, 'csrf-token')
    const cookiesToAdd = [tokenCookie, csrfCookie].filter(Boolean)

    if (cookiesToAdd.length === 0) {
      throw new Error('E2E 登录响应未返回 token 或 csrf-token cookie')
    }

    await page.context().addCookies(cookiesToAdd)

    await use(page)
  }
})

export { expect } from '@playwright/test'

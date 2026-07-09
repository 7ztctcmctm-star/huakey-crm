import { test as base } from '@playwright/test'

const API_BASE_URL = process.env.VITE_API_BASE_URL || '/api/v1'

// 绕过验证码的登录 fixture
// 后端用 cookie 存 token（res.cookie），前端 withCredentials: true 自动携带
// userInfo 存在 localStorage，由 useUser composable 管理
export const test = base.extend({
  authenticatedPage: async ({ page, request }, use) => {
    // 通过 API 登录获取 token
    // 注意：如果后端有验证码，需要先获取 captcha
    const captchaRes = await request.get(`${API_BASE_URL}/auth/captcha`)
    const captchaData = await captchaRes.json()

    const loginRes = await request.post(`${API_BASE_URL}/auth/login`, {
      data: {
        username: 'admin',
        password: 'huakey123',
        captcha: '0000', // 可能需要真实验证码，后端设 SKIP_CAPTCHA=true 可跳过
        captchaKey: captchaData.data?.key
      }
    })

    const loginData = await loginRes.json()
    if (loginData.code === 200) {
      // 设置 cookie — 后端用 res.cookie('token', ...) 存 token
      await page.context().addCookies([{
        name: 'token',
        value: loginData.data.token,
        domain: 'localhost',
        path: '/'
      }])
      // 设置 localStorage — 前端 useUser composable 从 localStorage 读取 userInfo
      await page.evaluate((userInfo) => {
        localStorage.setItem('userInfo', JSON.stringify(userInfo))
        localStorage.setItem('token', userInfo.token || '')
      }, loginData.data.userInfo)
    }

    await use(page)
  }
})

export { expect } from '@playwright/test'

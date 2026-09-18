import { test, expect } from './fixtures/auth.js'
import {
  loginAsAdmin,
  createKnowledgeScript,
  deleteKnowledgeScript,
  createKnowledgeFaq,
  deleteKnowledgeFaq
} from './fixtures/api-helpers.js'

function uniqueName(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * R-16 回归护栏：销售资料库「话术 / FAQ」新增 → 列表可见 → 检索 全链路。
 *
 * 背景：前端 `api/knowledge.js` 曾调用**不存在的**端点（`/knowledge/scripts/add`、
 * `/scripts/update`、`/scripts/delete`，FAQ 同）⇒ 话术/FAQ 的增改删此前全部 404。
 * 本例通过真实后端 RESTful 端点建数据，再在 UI 上检索验证，锁死该缺陷不回归。
 */
test.describe('销售资料库（话术 / FAQ）CRUD 与检索', () => {
  let csrfToken = ''
  let scriptId = null
  let faqId = null
  let scriptTitle = ''
  let faqQuestion = ''

  const isMobileOrFirefox = (testInfo) =>
    testInfo.project.name.includes('iPhone') ||
    testInfo.project.name.includes('Mobile Chrome') ||
    testInfo.project.name === 'firefox'

  test.beforeAll(async ({ request }) => {
    const login = await loginAsAdmin(request)
    csrfToken = login.csrfToken

    scriptTitle = uniqueName('E2E话术')
    const scriptRes = await createKnowledgeScript(request, csrfToken, {
      title: scriptTitle,
      content: '这是 E2E 自动创建的话术内容',
      scene: ''
    })
    if (scriptRes.code !== 200) {
      throw new Error(`创建话术失败：${scriptRes.message || JSON.stringify(scriptRes)}`)
    }
    scriptId = scriptRes.data?.id || scriptRes.data?.insertId

    faqQuestion = uniqueName('E2E问题')
    const faqRes = await createKnowledgeFaq(request, csrfToken, {
      question: faqQuestion,
      answer: '这是 E2E 自动创建的 FAQ 答案',
      category: ''
    })
    if (faqRes.code !== 200) {
      throw new Error(`创建FAQ失败：${faqRes.message || JSON.stringify(faqRes)}`)
    }
    faqId = faqRes.data?.id || faqRes.data?.insertId
  })

  test.afterAll(async ({ request }) => {
    if (scriptId) await deleteKnowledgeScript(request, csrfToken, scriptId)
    if (faqId) await deleteKnowledgeFaq(request, csrfToken, faqId)
  })

  test('新建话术在「销售话术」页可检索到（RESTful 端点已修复）', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '资料库列表在桌面浏览器覆盖')

    await page.goto('/knowledge/scripts', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })

    await page.getByPlaceholder('搜索话术标题/内容').fill(scriptTitle)
    await page.getByRole('button', { name: '搜索' }).click()

    await expect(page.locator('.script-title', { hasText: scriptTitle })).toBeVisible({ timeout: 10000 })
  })

  test('新建 FAQ 在「常见问题」页可检索到', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '资料库列表在桌面浏览器覆盖')

    await page.goto('/knowledge/faqs', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })

    await page.getByPlaceholder('搜索问题/答案').fill(faqQuestion)
    await page.getByRole('button', { name: '搜索' }).click()

    await expect(page.locator('.faq-question', { hasText: faqQuestion })).toBeVisible({ timeout: 10000 })
  })

  test('「产品知识库」页可访问并渲染列表容器', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '资料库列表在桌面浏览器覆盖')

    await page.goto('/knowledge/products', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })
    await expect(page.locator('.el-table, .empty-state').first()).toBeVisible({ timeout: 10000 })
  })

  test('「文档模板」页可访问并渲染列表容器', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(isMobileOrFirefox(testInfo), '资料库列表在桌面浏览器覆盖')

    await page.goto('/knowledge/documents', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-container', { timeout: 30000 })
    await expect(page.locator('.el-table, .empty-state').first()).toBeVisible({ timeout: 10000 })
  })
})

/**
 * 客户转移（双方同意制）端到端走查
 *
 * 覆盖链路（docs/crm-customer-overview-design.md §八 L1「真实浏览器端到端走查」）：
 *   1. A 持有客户 → A 发起转移 → 记录为 pending，且归属「不变」（双方同意制）
 *   2. B 看到自己的待办（API 断言）
 *   3. B 在真实浏览器打开通知栏 → 看到「客户转移待处理」→ 点「同意」→ 归属变更为 B
 *   4. 拒绝路径：B 拒绝 → 归属仍为 A，记录状态 rejected
 *   5. 越权守卫：非接收人不得同意他人转移
 *
 * 关键设计：使用两个「各自独立登录」的真实请求上下文（A 与 B），
 * 而不是仅用 admin 一个身份走完全程 —— 否则无法验证「接收人视角」。
 *
 * 前置条件（由 frontend/scripts/start-e2e-server.mjs 自举）：
 *   - 测试库必须由 huakey_crm 克隆而来（含 sales / manager 真实角色）
 *   - 账号来自 database/seeds/demo_users.sql
 *
 * ⚠️ 已知缺陷（本用例存在的原因之一，见 docs 记录）：
 *   database/seeds/demo_roles.sql 自称「补齐测试库缺失的角色」，
 *   但其 INSERT IGNORE 列表【不含 manager / sales】；
 *   而 demo_users.sql:40 用 `(SELECT id FROM sys_role WHERE LOWER(code)='sales' LIMIT 1)`
 *   取 role_id —— 取不到即 NULL → demo_sales 无任何权限。
 *   因此若本用例因「A 无 customer:add 权限」失败，请先核对 demo_roles.sql。
 *
 * 真实接口约定（已核对 backend/routes/customers.js）：
 *   POST /api/v1/customers/add        需 customer:add，company_name + contacts(≥1) 必填
 *   GET  /api/v1/customers/detail/:id 需 customer:view + 数据范围
 *   POST /api/v1/pool/transfer        需 customer:transfer
 *   POST /api/v1/pool/transfer/accept 需 customer:transfer
 *   POST /api/v1/pool/transfer/reject 需 customer:transfer
 */
import { test, expect } from '@playwright/test'

const API = '/api/v1'
const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173'

/**
 * 登录指定账号，返回独立的 { ctx, csrfToken, userId }。
 * 每个账号一个 APIRequestContext → 各自独立 cookie jar，互不干扰。
 */
async function loginAs(playwright, username, password) {
  if (!username || !password) {
    throw new Error('缺少 E2E 账号配置（检查 .env.test 的 E2E_SALES_USER / E2E_PURCHASE_USER）')
  }
  const ctx = await playwright.request.newContext({ baseURL: BASE })
  const captchaRes = await ctx.get(`${API}/auth/captcha`)
  const captchaData = await captchaRes.json()
  const loginRes = await ctx.post(`${API}/auth/login`, {
    data: { username, password, captcha: 'dev1', captchaKey: captchaData.data?.key }
  })
  const loginData = await loginRes.json()
  if (loginData.code !== 200) {
    throw new Error(`账号 ${username} 登录失败: ${loginData.message || loginRes.status()}`)
  }
  const csrf = (await ctx.storageState()).cookies.find((c) => c.name === 'csrf-token')
  if (!csrf) throw new Error(`账号 ${username} 登录后未拿到 csrf-token cookie`)
  const userId = loginData.data?.userInfo?.id
  if (!userId) throw new Error(`账号 ${username} 登录响应缺少 userInfo.id`)
  return { ctx, csrfToken: csrf.value, userId }
}

/** 带 CSRF 头的 POST */
function post(ctx, csrfToken, url, data) {
  return ctx.post(url, { headers: { 'x-csrf-token': csrfToken }, data })
}

/**
 * 建一个归属于 actor 的客户。
 *
 * ⚠️ 真实模型（已核对 customerDetailService.addCustomer）：
 *   `owner_id` 并不取创建者，而是 `autoAssignOwner(pool, {source, address})` 的返回值。
 *   若无分配规则命中 → owner_id = NULL，客户以 lead 身份进入公海。
 *   因此「让 A 持有客户」的正确做法是：A 创建 → A 认领（pool:claim）。
 *   这也是产品里真实的路径，比强行指定 owner 更能代表实际使用。
 */
async function createCustomerAs(actor, companyName) {
  // 用单数前缀 /customer/add（customer 模块），与 assign、detail 保持同一套
  const res = await post(actor.ctx, actor.csrfToken, `${API}/customer/add`, {
    company_name: companyName,
    contacts: [{ name: 'E2E联系人', phone: '13900000000' }],
    // source 必须是 customerDetailService.VALID_SOURCES 中的中文展示值（不是英文 code）
    source: '其他'
  })
  const body = await res.json()
  if (body.code !== 200) {
    throw new Error(
      `创建客户失败（检查 ${actor.username} 是否有 customer:add 权限）: ${JSON.stringify(body)}`
    )
  }
  const id = typeof body.data === 'object' ? (body.data?.id ?? body.data?.customer_id) : body.data
  if (!id) throw new Error(`创建客户响应取不到 id: ${JSON.stringify(body)}`)
  return id
}

/**
 * 让 actor 成为客户负责人。
 *
 * ⚠️ 为什么不用 pool/claim（重要发现，已实测）：
 *   路由 /pool/claim 实际调用的是 customerService.claimPoolCustomer，
 *   其前置条件是 `pool_status === 'sea'` 且 `business_status !== 'lead'`。
 *   而 customerDetailService.addCustomer 的 INSERT 语句【不写 pool_status】，
 *   落到列默认值 'private'，status='lead'。
 *   于是「刚刚新建的客户」两个条件都不满足 → 恒报「该客户不在公海中」，
 *   即新建客户无法被任何人认领。
 *   （注：另有一份 poolService.claimCustomer 只校验 owner_id IS NULL，
 *     是同一业务的两套实现 —— 这正是项目里反复出现的「多份副本」问题，
 *     已单独记录，不在此处擅自改动。）
 *
 * 因此本用例走真实可用的产品路径：由 admin（manageAll）把客户分配给 A。
 * 分配接口需 customer:assign + requireManager，demo_sales 无此权限，故必须用 admin 操作。
 */
async function assignTo(adminActor, customerId, toUserId) {
  // ⚠️ 路径是 /customer/assign（单数）——由 ModuleRegistry 以 `/<name>` 前缀挂载
  // （backend/core/ModuleRegistry.js:31），routes/customer/assign.js 挂在其中。
  // 注意与 /customers/add（复数，backend/app.js:314 手工挂载）区分：
  // 项目里 customer 与 customers 两套前缀并存，改动时极易踩错。
  const res = await post(adminActor.ctx, adminActor.csrfToken, `${API}/customer/assign`, {
    customer_id: customerId,
    to_user_id: toUserId
  })
  const body = await res.json()
  if (body.code !== 200) {
    throw new Error(`分配客户失败: ${JSON.stringify(body)}`)
  }
  return body
}

/**
 * 准备好「A 持有的客户」：admin 建客户 → admin 分配给 A → 断言归属确为 A
 */
async function setupCustomerOwnedBy(a, adminActor, companyName) {
  const id = await createCustomerAs(adminActor, companyName)
  await assignTo(adminActor, id, a.userId)
  const owner = await ownerOf(adminActor, id)
  if (Number(owner) !== Number(a.userId)) {
    throw new Error(`准备失败：期望 owner=${a.userId}，实际=${owner}`)
  }
  return id
}

/** 读客户当前负责人（需要 customer:view + 数据范围；用 owner 自己或 admin 查） */
async function ownerOf(actor, customerId) {
  // 用单数前缀 /customer/detail/:id：该路由只做 checkDataPermission，
  // 而复数 /customers/detail/:id 额外要求 customer:view。
  // admin(manageAll) 两条都能过，但单数路径对角色要求更少，更稳。
  const res = await actor.ctx.get(`${API}/customer/detail/${customerId}`, {
    headers: { 'x-csrf-token': actor.csrfToken }
  })
  const body = await res.json()
  if (body.code !== 200) {
    throw new Error(`查询客户 ${customerId} 详情失败: ${JSON.stringify(body)}`)
  }
  // ⚠️ 响应结构是 { customer, contacts, followRecords }（见 customerDetailService.getCustomerDetail），
  // owner_id 在 data.customer 下，不在 data 顶层。
  const owner = body.data?.customer?.owner_id ?? body.data?.owner_id ?? null
  return owner === null || owner === undefined ? null : Number(owner)
}

const A_CRED = {
  username: process.env.E2E_SALES_USER || 'demo_sales',
  password: process.env.E2E_SALES_PASSWORD
}
/**
 * ⚠️ B 必须是「拥有 customer:transfer 权限」的用户，否则同意时会 403。
 *
 * 走查中实测发现：`listTransferCandidates` 只按 deleted_at/status 过滤，
 * 【不做角色或权限过滤】，会把 hr / purchase / finance 等无权限用户也列为候选人。
 * 在本机测试库的 24 个可用用户中，有 7 人（hr×1、purchase×4、finance×2）
 * 会被列为候选人但「同意」必然 403 —— 这是产品缺陷，已单独记录。
 *
 * 因此 B 取 demo_sales2（database/seeds/demo_users.sql 新增的第二个销售），
 * 与 demo_sales 同密码。
 */
const B_CRED = {
  username: process.env.E2E_TRANSFER_USER || 'demo_sales2',
  password: process.env.E2E_TRANSFER_PASSWORD || process.env.E2E_SALES_PASSWORD
}

/** 登录 A / B / admin 三方，并附带 username 便于报错定位 */
async function loginAll(playwright) {
  const a = await loginAs(playwright, A_CRED.username, A_CRED.password)
  a.username = A_CRED.username
  const b = await loginAs(playwright, B_CRED.username, B_CRED.password)
  b.username = B_CRED.username
  const admin = await loginAs(
    playwright,
    process.env.E2E_ADMIN_USER || 'demo_admin',
    process.env.E2E_ADMIN_PASSWORD
  )
  admin.username = process.env.E2E_ADMIN_USER || 'demo_admin'
  return { a, b, admin }
}

/** 释放三方的请求上下文 */
async function disposeAll(...actors) {
  for (const actor of actors) {
    if (actor?.ctx) await actor.ctx.dispose()
  }
}

test.describe('客户转移 · 双方同意制（双角色真实链路）', () => {
  test('A 发起 → B 通知栏可见并可同意 → 归属变更为 B', async ({ playwright, browser }) => {
    const { a, b, admin } = await loginAll(playwright)

    expect(a.userId, 'A 与 B 必须是不同用户').not.toBe(b.userId)

    const stamp = Date.now()
    const companyName = `E2E转移-同意-${stamp}`

    // 准备：admin 建客户并分配给 A，使 A 成为负责人
    const customerId = await setupCustomerOwnedBy(a, admin, companyName)

    // ---------- 步骤 1：A 发起转移到 B ----------
    const createRes = await post(a.ctx, a.csrfToken, `${API}/pool/transfer`, {
      customer_id: customerId,
      to_user_id: b.userId,
      reason: `E2E 走查发起 ${stamp}`
    })
    const createBody = await createRes.json()
    expect(createBody.code, `A 发起转移应成功，实际: ${JSON.stringify(createBody)}`).toBe(200)
    const transferId = createBody.data?.id ?? createBody.data

    // 双方同意制：发起后归属不应变化（用 admin 查询，数据范围最稳）
    expect(await ownerOf(admin, customerId), '发起后归属不应立即变更').toBe(a.userId)

    // ---------- 步骤 2：B 的待办里应有这条 ----------
    const pendingRes = await post(b.ctx, b.csrfToken, `${API}/pool/transfer/my-pending`, {})
    const pendingBody = await pendingRes.json()
    expect(pendingBody.code, `B 查询待办应成功: ${JSON.stringify(pendingBody)}`).toBe(200)
    const pendingList = pendingBody.data?.list || pendingBody.data || []
    expect(
      pendingList.some((t) => Number(t.id) === Number(transferId)),
      `B 的待办应包含转移 ${transferId}，实际: ${JSON.stringify(pendingList)}`
    ).toBe(true)

    // ---------- 步骤 3：B 在真实浏览器打开通知栏并点「同意」 ----------
    const bPage = await browser.newPage()
    // 收集浏览器控制台错误，收尾断言（前端禁止静默失败）
    const consoleErrors = []
    bPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    const bState = await b.ctx.storageState()
    await bPage.context().addCookies(bState.cookies)
    await bPage.goto(BASE + '/')
    // ⚠️ 不能用 waitForLoadState('networkidle')：Vite dev server 的 HMR WebSocket
    // 会持续保持连接，networkidle 永不触发，必然等到用例超时。
    // 改为等待「顶栏通知铃铛」出现 —— 这才是本步骤真正依赖的就绪信号。
    const bell = bPage.locator('.reminder-bell').first()
    await expect(bell, '通知栏入口应可见（说明 B 已登录并渲染出顶栏）').toBeVisible({ timeout: 25000 })

    // 铃铛上的未读角标应 > 0（B 收到了刚发起的转移通知）
    await expect(
      bPage.locator('.reminder-bell .el-badge__content').first(),
      'B 的通知角标应显示未读'
    ).toBeVisible({ timeout: 10000 })

    // 通知铃铛真实结构（已核对 NotificationBadge.vue）：
    //   <el-popover trigger="click" @show="fetchNotificationCenter">
    //     <template #reference><el-badge class="reminder-bell">…
    // 点击 .reminder-bell 即可展开 .notify-panel
    await bell.click()

    await expect(
      bPage.locator('.notify-panel .notify-group-title').filter({ hasText: '客户转移待处理' }),
      'B 的通知栏应出现「客户转移待处理」分组'
    ).toBeVisible({ timeout: 15000 })

    const acceptBtn = bPage.getByRole('button', { name: '同意' }).first()
    await expect(acceptBtn, '待办项应有「同意」按钮').toBeVisible({ timeout: 10000 })
    await acceptBtn.click()

    // ElMessageBox.confirm 的确认按钮文案是「确认接收」（见 composables/useTransferTodo.js）
    const confirmBtn = bPage
      .locator('.el-message-box__btns button')
      .filter({ hasText: '确认接收' })
      .first()
    await expect(confirmBtn, '应弹出二次确认框').toBeVisible({ timeout: 10000 })
    await confirmBtn.click()

    // 用轮询等待归属真正落库 —— UI 提示成功 ≠ DB 已提交
    await expect
      .poll(async () => ownerOf(admin, customerId), {
        message: 'B 同意后，客户归属应变为 B',
        timeout: 20000
      })
      .toBe(b.userId)

    // 前端不得有控制台错误（项目禁止静默失败）
    expect(
      consoleErrors.filter((t) => !/favicon|ResizeObserver/i.test(t)),
      `B 侧浏览器控制台不应有错误，实际: ${JSON.stringify(consoleErrors)}`
    ).toEqual([])

    await bPage.close()
    await disposeAll(a, b, admin)
  })

  test('B 拒绝 → 归属保持 A + 记录状态为 rejected', async ({ playwright }) => {
    const { a, b, admin } = await loginAll(playwright)

    const stamp = Date.now()
    const customerId = await setupCustomerOwnedBy(a, admin, `E2E转移-拒绝-${stamp}`)

    const createRes = await post(a.ctx, a.csrfToken, `${API}/pool/transfer`, {
      customer_id: customerId,
      to_user_id: b.userId,
      reason: `E2E 拒绝路径 ${stamp}`
    })
    const createBody = await createRes.json()
    expect(createBody.code, `A 发起转移应成功: ${JSON.stringify(createBody)}`).toBe(200)
    const transferId = createBody.data?.id ?? createBody.data

    const rejectRes = await post(b.ctx, b.csrfToken, `${API}/pool/transfer/reject`, {
      id: transferId,
      remark: `E2E 拒绝 ${stamp}`
    })
    const rejectBody = await rejectRes.json()
    expect(rejectBody.code, `B 拒绝应成功: ${JSON.stringify(rejectBody)}`).toBe(200)

    expect(await ownerOf(admin, customerId), '拒绝后归属应保持 A').toBe(a.userId)

    const histRes = await post(a.ctx, a.csrfToken, `${API}/pool/transfer/by-customer`, {
      customer_id: customerId
    })
    const histBody = await histRes.json()
    const rec = (histBody.data || []).find((t) => Number(t.id) === Number(transferId))
    expect(rec, '应能查到该转移记录').toBeTruthy()
    expect(rec.status, '拒绝后状态应为 rejected').toBe('rejected')

    await disposeAll(a, b, admin)
  })

  test('越权守卫：非接收人不得同意他人转移', async ({ playwright }) => {
    const { a, b, admin } = await loginAll(playwright)

    const stamp = Date.now()
    const customerId = await setupCustomerOwnedBy(a, admin, `E2E转移-越权-${stamp}`)

    const createRes = await post(a.ctx, a.csrfToken, `${API}/pool/transfer`, {
      customer_id: customerId,
      to_user_id: b.userId,
      reason: `E2E 越权 ${stamp}`
    })
    const createBody = await createRes.json()
    expect(createBody.code).toBe(200)
    const transferId = createBody.data?.id ?? createBody.data

    // admin（manageAll）不是本次接收人，不得代为同意
    const acceptRes = await post(admin.ctx, admin.csrfToken, `${API}/pool/transfer/accept`, {
      id: transferId
    })
    const acceptBody = await acceptRes.json()
    expect(
      acceptBody.code,
      `非接收人同意应被拒绝，实际: ${JSON.stringify(acceptBody)}`
    ).not.toBe(200)

    expect(await ownerOf(admin, customerId), '越权尝试后归属应仍为 A').toBe(a.userId)

    await disposeAll(a, b, admin)
  })
})

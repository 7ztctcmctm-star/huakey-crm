/**
 * E2E API 辅助函数
 * 用于在测试前通过后端 API 预置测试数据（客户/产品/报价/合同/审批流等）
 */

const DEFAULT_USER = {
  username: process.env.E2E_USERNAME || 'admin',
  password: process.env.E2E_PASSWORD || 'Admin@123'
}

/**
 * 使用 admin 账号登录，返回后续请求需要的 CSRF token
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function loginAsAdmin(request) {
  // 1. 获取验证码
  const captchaRes = await request.get('/api/v1/auth/captcha')
  const captchaData = await captchaRes.json()

  // 2. 登录；后端会设置 token（httpOnly）和 csrf-token cookie
  const loginRes = await request.post('/api/v1/auth/login', {
    data: {
      username: DEFAULT_USER.username,
      password: DEFAULT_USER.password,
      captcha: 'dev1',
      captchaKey: captchaData.data?.key
    }
  })

  const loginData = await loginRes.json()
  if (loginData.code !== 200) {
    throw new Error(`API 登录失败：${loginData.message || loginRes.statusText()}`)
  }

  // Playwright APIRequestContext 没有 .context() 方法，通过 storageState() 读取 cookie
  const storageState = await request.storageState()
  const csrfCookie = storageState.cookies.find((c) => c.name === 'csrf-token')
  if (!csrfCookie) {
    throw new Error(
      'E2E 登录后未获取到 csrf-token cookie。' +
      `已存储的 cookies: ${JSON.stringify(storageState.cookies.map(c => c.name))}。` +
      '请确认后端是否正确设置了 csrf-token cookie（检查 NODE_ENV 和 CSRF 中间件）。'
    )
  }
  return { csrfToken: csrfCookie.value }
}

/**
 * 创建测试客户
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {object} data
 */
export async function createCustomer(request, csrfToken, data) {
  const res = await request.post('/api/v1/customer/add', {
    data: {
      company_name: data.companyName,
      contacts: data.contacts || [{ name: 'E2E联系人', phone: '13800138000' }],
      industry: data.industry || '测试行业',
      source: data.source || '展会',
      level: data.level || 'C',
      remark: data.remark || ''
    },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 创建测试产品
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {object} data
 */
export async function createProduct(request, csrfToken, data) {
  const res = await request.post('/api/v1/product/add', {
    data: {
      name: data.name,
      code: data.code || '',
      category: data.category || '测试分类',
      unit: data.unit || '件',
      price: data.price || 100,
      stock: data.stock ?? 1000,
      description: data.description || 'E2E 测试产品'
    },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 查询报价单列表
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {object} params
 */
export async function listQuotes(request, csrfToken, params = {}) {
  const res = await request.post('/api/v1/quote/list', {
    data: {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      customer_name: params.customerName || '',
      quote_no: params.quoteNo || ''
    },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 创建报价单
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {object} data
 */
export async function createQuote(request, csrfToken, data) {
  const res = await request.post('/api/v1/quote/add', {
    data: {
      customer_id: data.customerId,
      items: data.items,
      discount: data.discount ?? 0,
      valid_days: data.validDays ?? 30,
      remark: data.remark || '',
      currency: data.currency || 'CNY',
      exchange_rate: data.exchangeRate ?? 1.0000
    },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 审批报价单（直接审批，非工作流）
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {number} quoteId
 * @param {number} status 2=通过, 3=拒绝
 * @param {string} remark
 */
export async function approveQuote(request, csrfToken, quoteId, status = 2, remark = '') {
  const res = await request.post('/api/v1/quote/approve', {
    data: { id: quoteId, approval_status: status, approval_remark: remark },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 报价单转合同
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {number} quoteId
 */
export async function quoteToContract(request, csrfToken, quoteId) {
  const res = await request.post('/api/v1/quote/to-contract', {
    data: { id: quoteId },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 删除报价单（逻辑删除）
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {number} quoteId
 */
export async function deleteQuote(request, csrfToken, quoteId) {
  const res = await request.post('/api/v1/quote/delete', {
    data: { id: quoteId },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 创建合同
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {object} data
 */
export async function createContract(request, csrfToken, data) {
  const res = await request.post('/api/v1/contract/add', {
    data: {
      customer_id: data.customerId,
      amount: data.amount,
      sign_date: data.signDate || null,
      delivery_date: data.deliveryDate || null,
      payment_terms: data.paymentTerms || '',
      remark: data.remark || '',
      plans: data.plans || []
    },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 删除合同（逻辑删除）
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {number} contractId
 */
export async function deleteContract(request, csrfToken, contractId) {
  const res = await request.post('/api/v1/contract/delete', {
    data: { id: contractId },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 查询审批流程列表
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 */
export async function listApprovalWorkflows(request, csrfToken) {
  const res = await request.get('/api/v1/approval/workflows', {
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 删除审批流程（软删除）
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {number} workflowId
 */
export async function deleteApprovalWorkflow(request, csrfToken, workflowId) {
  const res = await request.delete(`/api/v1/approval/workflows/${workflowId}`, {
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 创建审批流程
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {object} data
 */
export async function createApprovalWorkflow(request, csrfToken, data) {
  const res = await request.post('/api/v1/approval/workflows', {
    data: {
      name: data.name,
      type: data.type,
      description: data.description || 'E2E 自动创建',
      steps: data.steps
    },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 提交审批
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {string} businessType quote|contract|purchase|discount
 * @param {number} businessId
 */
export async function submitApproval(request, csrfToken, businessType, businessId) {
  const res = await request.post('/api/v1/approval/submit', {
    data: { business_type: businessType, business_id: businessId },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 获取我的待审批列表
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 */
export async function getMyPending(request, csrfToken) {
  const res = await request.get('/api/v1/approval/my-pending', {
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 删除测试客户（逻辑删除，仅用于 E2E 清理）
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {number} customerId
 */
export async function deleteCustomer(request, csrfToken, customerId) {
  const res = await request.post('/api/v1/customer/delete', {
    data: { id: customerId },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

/**
 * 删除测试产品（逻辑删除）
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} csrfToken
 * @param {number} productId
 */
export async function deleteProduct(request, csrfToken, productId) {
  const res = await request.post('/api/v1/product/delete', {
    data: { id: productId },
    headers: { 'X-CSRF-Token': csrfToken }
  })
  return res.json()
}

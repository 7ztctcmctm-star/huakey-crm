// 通用 mock 响应工厂
export const mockSuccess = (data) => ({ code: 200, message: 'ok', data })
export const mockError = (code, message) => ({ code, message, data: null })
export const mockPaginated = (list, total) => ({ code: 200, message: 'ok', data: { list, total } })

// 预设 mock 数据
export const MOCK_USER = {
  id: 1,
  username: 'admin',
  realName: '管理员',
  roleId: 1,
  manageAll: true,
  viewAll: true,
  permissions: ['customer:add', 'customer:edit', 'customer:delete', 'customer:list']
}

export const MOCK_CUSTOMERS = [
  {
    id: 1,
    company_name: '测试公司A',
    contact_name: '张三',
    phone: '13800138000',
    status: 2,
    level: 'A',
    source: '官网',
    owner_name: '管理员',
    owner_id: 1
  },
  {
    id: 2,
    company_name: '测试公司B',
    contact_name: '李四',
    phone: '13900139000',
    status: 1,
    level: 'B',
    source: '展会',
    owner_name: null,
    owner_id: null
  }
]

export const MOCK_CAPTCHA = { svg: '<svg>test</svg>', key: 'test_captcha_key' }

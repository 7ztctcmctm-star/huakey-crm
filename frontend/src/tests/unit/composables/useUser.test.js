import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request（必须在 import 之前）
vi.mock('@/utils/request', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

describe('useUser', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    vi.clearAllMocks()
  })

  async function getUseUser() {
    const { useUser } = await import('@/composables/useUser')
    return useUser
  }

  it('初始状态 userInfo 应为 null', async () => {
    const useUser = await getUseUser()
    const { userInfo } = useUser()
    expect(userInfo.value).toBeNull()
  })

  it('setUser 应更新 userInfo 并存入 localStorage', async () => {
    const useUser = await getUseUser()
    const { setUser, userInfo } = useUser()
    const user = { id: 1, username: 'admin', manageAll: true }
    setUser(user)
    expect(userInfo.value).toEqual(user)
    expect(localStorage.setItem).toHaveBeenCalledWith('userInfo', JSON.stringify(user))
  })

  it('clearUser 应清空 userInfo 和 localStorage', async () => {
    const useUser = await getUseUser()
    const { setUser, clearUser, userInfo } = useUser()
    setUser({ id: 1, username: 'admin' })
    clearUser()
    expect(userInfo.value).toBeNull()
    expect(localStorage.removeItem).toHaveBeenCalledWith('userInfo')
  })

  it('verifyAuth 成功应返回 true 并设置 userInfo', async () => {
    const { default: request } = await import('@/utils/request')
    request.get.mockResolvedValue({ code: 200, data: { id: 1, username: 'admin' } })
    const useUser = await getUseUser()
    const { verifyAuth, userInfo } = useUser()
    const result = await verifyAuth()
    expect(result).toBe(true)
    expect(userInfo.value).toBeDefined()
  })

  it('verifyAuth 失败应返回 false', async () => {
    const { default: request } = await import('@/utils/request')
    request.get.mockRejectedValue(new Error('unauthorized'))
    const useUser = await getUseUser()
    const { verifyAuth, userInfo } = useUser()
    const result = await verifyAuth()
    expect(result).toBe(false)
    expect(userInfo.value).toBeNull()
  })

  it('isAdmin 应根据 manageAll 计算', async () => {
    const useUser = await getUseUser()
    const { setUser, isAdmin } = useUser()
    setUser({ id: 1, manageAll: true })
    expect(isAdmin.value).toBe(true)
    setUser({ id: 2, manageAll: false })
    expect(isAdmin.value).toBe(false)
  })

  it('canViewAll 应根据 viewAll 或 manageAll 计算', async () => {
    const useUser = await getUseUser()
    const { setUser, canViewAll } = useUser()
    setUser({ id: 1, viewAll: true, manageAll: false })
    expect(canViewAll.value).toBe(true)
    setUser({ id: 2, viewAll: false, manageAll: true })
    expect(canViewAll.value).toBe(true)
    setUser({ id: 3, viewAll: false, manageAll: false })
    expect(canViewAll.value).toBe(false)
  })
})

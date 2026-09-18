import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request（必须在 import 之前）
vi.mock('@/utils/request', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

describe('useUser', () => {
  beforeEach(() => {
    vi.resetModules()
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

  it('setUser 应更新 userInfo 且不持久化到 localStorage', async () => {
    const useUser = await getUseUser()
    const { setUser, userInfo } = useUser()
    const user = { id: 1, username: 'admin', manageAll: true }
    setUser(user)
    expect(userInfo.value).toEqual(user)
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('clearUser 应清空 userInfo 且不操作 localStorage', async () => {
    const useUser = await getUseUser()
    const { setUser, clearUser, userInfo } = useUser()
    setUser({ id: 1, username: 'admin' })
    clearUser()
    expect(userInfo.value).toBeNull()
    expect(localStorage.removeItem).not.toHaveBeenCalled()
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

  // ── R-05/R-07：团队筛选显隐判据 ────────────────────────────────
  describe('canViewTeam（能否按成员筛选 = 能否看到他人数据）', () => {
    it('viewAll / manageAll 为真 → true', async () => {
      const useUser = await getUseUser()
      const { setUser, canViewTeam } = useUser()
      setUser({ id: 1, viewAll: true })
      expect(canViewTeam.value).toBe(true)
      setUser({ id: 2, manageAll: true })
      expect(canViewTeam.value).toBe(true)
    })

    it('**manager 场景**：viewAll/manageAll 均为 false，但 dataPermissions 含 dept_and_sub → true', async () => {
      const useUser = await getUseUser()
      const { setUser, canViewTeam, canViewAll } = useUser()
      setUser({
        id: 10,
        roleCode: 'manager',
        viewAll: false,
        manageAll: false,
        dataPermissions: [
          { module: 'customer', data_scope: 'dept_and_sub' },
          { module: 'report', data_scope: 'dept_and_sub' }
        ]
      })
      expect(canViewAll.value).toBe(false)   // 仍非全局可见
      expect(canViewTeam.value).toBe(true)   // 但可按成员筛选
    })

    it('all / dept / dept_and_sub 均视为可看他人数据；self 不算', async () => {
      const useUser = await getUseUser()
      const { setUser, canViewTeam } = useUser()
      for (const scope of ['all', 'dept', 'dept_and_sub']) {
        setUser({ id: 1, dataPermissions: [{ module: 'customer', data_scope: scope }] })
        expect(canViewTeam.value, `scope=${scope}`).toBe(true)
      }
      setUser({ id: 2, dataPermissions: [{ module: 'customer', data_scope: 'self' }] })
      expect(canViewTeam.value).toBe(false)
    })

    it('数据范围为空 / 非数组 → false（sales 场景）', async () => {
      const useUser = await getUseUser()
      const { setUser, canViewTeam } = useUser()
      setUser({ id: 5, roleCode: 'sales', viewAll: false, manageAll: false, dataPermissions: [] })
      expect(canViewTeam.value).toBe(false)
      setUser({ id: 6 })
      expect(canViewTeam.value).toBe(false)
    })
  })
})

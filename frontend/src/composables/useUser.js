import { ref, computed } from 'vue'
import request from '@/utils/request'
import { reportError } from '@/utils/error'

const userInfo = ref(null)
let authChecked = false
// 强制刷新在途去重：403 刷新与 SSE 推送可能并发，保证同一时刻只发一次 /auth/me
let refreshPromise = null

// 验证cookie登录状态（仅首次调用时请求后端）
async function verifyAuth() {
  // 如果已检查过但 userInfo 为空（例如登录页未 setUser），重置以允许重新请求 /auth/me
  if (authChecked && !userInfo.value) {
    authChecked = false
  }
  if (authChecked) return !!userInfo.value
  authChecked = true
  try {
    const res = await request.get('/auth/me')
    if (res.code === 200) {
      // 权限等敏感信息仅保存在内存中，不持久化到 localStorage/sessionStorage
      userInfo.value = res.data
      return true
    }
  } catch (e) {
    // 401 = 未登录/登录过期的正常探测结果（路由守卫依赖此返回值决定是否跳 /login），
    // 不是错误——无痕窗口/过期会话每次打开必然触发。其余异常（500/网络断）才上报。
    if (e?.response?.status !== 401) reportError('[useUser] 验证登录状态失败:', e)
  }
  userInfo.value = null
  return false
}

/**
 * [C2 2026-10-21] 强制刷新权限缓存
 *
 * 绕过 authChecked 短路重新拉取 /auth/me，用于两个场景：
 *   1. request.js 收到 403（权限可能刚被管理员调整，本地缓存已过期）；
 *   2. 后端经 SSE 推送 permission-changed（管理员改了当前用户的角色/部门）。
 * 刷新后 userInfo 更新 ⇒ v-permission 指令控制的按钮即时显隐。
 * 在途去重：并发调用共享同一次请求。
 *
 * 模块级命名导出（非 useUser() 返回值属性）：utils/sse.js 与 utils/request.js
 * 在组件上下文之外调用，拿不到 useUser() 的返回值。
 *
 * @returns {Promise<boolean>} 刷新后是否仍处于登录态
 */
export async function refreshPermissions() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    authChecked = false
    try {
      return await verifyAuth()
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export function useUser() {
  const userId = computed(() => userInfo.value?.id)
  const roleId = computed(() => userInfo.value?.roleId)
  const isBoss = computed(() => userInfo.value?.manageAll === true)
  const isAdmin = computed(() => userInfo.value?.manageAll === true)
  /**
   * [C2 2026-10-21] 是否「管理层」——对齐后端 middleware/admin.js 的 requireManager：
   *   manageAll（super_admin/admin/boss，migration 004）或 roleCode === 'manager'。
   * 库中实际角色为 boss/manager/sales/hr/purchase/finance/engineer；
   * super_admin/admin 为遗留 code（config/roles.js 注明现库已不存在）。
   * 用于「后端挂 requireManager 的端点」对应按钮显隐（如标签管理 /tag/manage）。
   */
  const isManager = computed(
    () => userInfo.value?.manageAll === true || userInfo.value?.roleCode === 'manager'
  )
  const canViewAll = computed(() => userInfo.value?.viewAll === true || userInfo.value?.manageAll === true)
  const canClaim = computed(() => {
    const perms = userInfo.value?.permissions || []
    return userInfo.value?.manageAll === true || perms.includes('customer:claim')
  })
  /**
   * 是否能按「团队成员」筛选（即看得到他人数据）
   *
   * 判据来自后端 /auth/me 的 dataPermissions（[{ module, data_scope }]），而不是只看 viewAll：
   * manager 角色 sys_role.view_all=0/manage_all=0，但 sys_data_permission 配了 dept_and_sub
   * ⇒ 能看本部门及下级部门数据；若只用 viewAll 判断会把这类角色误判为"只能看自己"。
   * 前端仅用于控制筛选器显隐；**真正的可见范围由后端强制**（见 buildOwnerOverrideFilter）。
   */
  const canViewTeam = computed(() => {
    if (userInfo.value?.viewAll === true || userInfo.value?.manageAll === true) return true
    const dps = userInfo.value?.dataPermissions
    if (!Array.isArray(dps)) return false
    return dps.some((d) => ['all', 'dept', 'dept_and_sub'].includes(d?.data_scope))
  })

  function setUser(info) {
    userInfo.value = info
  }

  function clearUser() {
    userInfo.value = null
    authChecked = false
  }

  return { userInfo, userId, roleId, isBoss, isAdmin, isManager, canViewAll, canViewTeam, canClaim, setUser, clearUser, verifyAuth, refreshPermissions }
}

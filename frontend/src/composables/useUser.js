import { ref, computed } from 'vue'
import request from '@/utils/request'
import { reportError, reportWarn } from '@/utils/error'

const userInfo = ref(null)
let authChecked = false

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
  } catch (e) { reportError('[useUser] 验证登录状态失败:', e) }
  userInfo.value = null
  return false
}

export function useUser() {
  const userId = computed(() => userInfo.value?.id)
  const roleId = computed(() => userInfo.value?.roleId)
  const isBoss = computed(() => userInfo.value?.manageAll === true)
  const isAdmin = computed(() => userInfo.value?.manageAll === true)
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

  return { userInfo, userId, roleId, isBoss, isAdmin, canViewAll, canViewTeam, canClaim, setUser, clearUser, verifyAuth }
}

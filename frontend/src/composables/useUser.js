import { ref, computed } from 'vue'
import request from '@/utils/request'

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
  } catch (e) { console.error('[useUser] 验证登录状态失败:', e) }
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

  function setUser(info) {
    userInfo.value = info
  }

  function clearUser() {
    userInfo.value = null
    authChecked = false
  }

  return { userInfo, userId, roleId, isBoss, isAdmin, canViewAll, canClaim, setUser, clearUser, verifyAuth }
}

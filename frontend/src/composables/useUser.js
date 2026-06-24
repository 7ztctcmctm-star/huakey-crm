import { ref, computed } from 'vue'
import request from '@/utils/request'

const userInfo = ref(null)
let authChecked = false

function loadUser() {
  try {
    const stored = localStorage.getItem('userInfo')
    if (stored) userInfo.value = JSON.parse(stored)
  } catch (e) { console.error('[useUser] 加载用户信息失败:', e) }
}

// 验证cookie登录状态（仅首次调用时请求后端）
async function verifyAuth() {
  if (authChecked) return !!userInfo.value
  authChecked = true
  try {
    const res = await request.get('/auth/me')
    if (res.code === 200) {
      userInfo.value = res.data
      localStorage.setItem('userInfo', JSON.stringify(res.data))
      // 后端权限变化时会返回新 token，更新本地存储
      if (res.data.token) {
        localStorage.setItem('token', res.data.token)
      }
      return true
    }
  } catch (e) { console.error('[useUser] 验证登录状态失败:', e) }
  userInfo.value = null
  localStorage.removeItem('userInfo')
  return false
}

export function useUser() {
  if (!userInfo.value) loadUser()

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
    localStorage.setItem('userInfo', JSON.stringify(info))
  }

  function clearUser() {
    userInfo.value = null
    authChecked = false
    localStorage.removeItem('userInfo')
  }

  return { userInfo, userId, roleId, isBoss, isAdmin, canViewAll, canClaim, setUser, clearUser, loadUser, verifyAuth }
}

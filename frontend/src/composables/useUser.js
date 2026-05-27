import { ref, computed } from 'vue'

const userInfo = ref(null)

function loadUser() {
  try {
    const stored = localStorage.getItem('userInfo')
    if (stored) userInfo.value = JSON.parse(stored)
  } catch { /* ignore */ }
}

export function useUser() {
  if (!userInfo.value) loadUser()

  const userId = computed(() => userInfo.value?.id)
  const roleId = computed(() => userInfo.value?.roleId)
  const isBoss = computed(() => userInfo.value?.manageAll === true || userInfo.value?.roleId === 1)
  const isAdmin = computed(() => userInfo.value?.manageAll === true || userInfo.value?.roleId === 1)
  const canViewAll = computed(() => userInfo.value?.viewAll === true || userInfo.value?.roleId === 1)
  const canClaim = computed(() => [1, 2, 3].includes(userInfo.value?.roleId))

  function setUser(info) {
    userInfo.value = info
    localStorage.setItem('userInfo', JSON.stringify(info))
  }

  function clearUser() {
    userInfo.value = null
    localStorage.removeItem('userInfo')
  }

  return { userInfo, userId, roleId, isBoss, isAdmin, canViewAll, canClaim, setUser, clearUser, loadUser }
}

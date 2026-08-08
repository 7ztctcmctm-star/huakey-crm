import { useUser } from '@/composables/useUser'

/**
 * 检查是否有权限
 * @param {string} permissionCode - 权限编码
 * @returns {boolean}
 */
export function hasPermission(permissionCode) {
  const { userInfo } = useUser()
  const permissions = userInfo.value?.permissions || []

  // manageAll 用户（super_admin/boss/manager）拥有所有权限
  if (userInfo.value?.manageAll) {
    return true
  }

  return permissions.includes(permissionCode)
}

/**
 * 检查是否有任一权限
 * @param {string[]} permissionCodes - 权限编码数组
 * @returns {boolean}
 */
export function hasAnyPermission(permissionCodes) {
  if (!Array.isArray(permissionCodes)) return false
  return permissionCodes.some(code => hasPermission(code))
}

/**
 * 检查是否有所有权限
 * @param {string[]} permissionCodes - 权限编码数组
 * @returns {boolean}
 */
export function hasAllPermissions(permissionCodes) {
  if (!Array.isArray(permissionCodes)) return false
  return permissionCodes.every(code => hasPermission(code))
}

/**
 * 检查是否有数据权限
 * @param {string} module - 模块名称
 * @param {string} scope - 数据范围
 * @returns {boolean}
 */
export function hasDataPermission(module, scope) {
  const { userInfo } = useUser()
  const dataPermissions = userInfo.value?.dataPermissions || []

  const config = dataPermissions.find(p => p.module === module)
  if (!config) return scope === 'self'

  return config.data_scope === scope || config.data_scope === 'all'
}

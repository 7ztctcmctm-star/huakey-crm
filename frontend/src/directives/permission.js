import { hasPermission, hasAnyPermission, hasAllPermissions } from '@/utils/permission'

/**
 * 权限指令
 * 使用方式：
 * v-permission="'customer:add'"  // 单个权限
 * v-permission="['customer:add', 'customer:edit']"  // 多个权限（任一即可）
 */
export const permissionDirective = {
  mounted(el, binding) {
    const { value } = binding

    if (!value) return

    const hasAuth = Array.isArray(value) ? hasAnyPermission(value) : hasPermission(value)

    if (!hasAuth) {
      el.parentNode?.removeChild(el)
    }
  }
}

/**
 * 权限指令（所有权限都要满足）
 * 使用方式：
 * v-permission:all="['customer:add', 'customer:edit']"
 */
export const permissionAllDirective = {
  mounted(el, binding) {
    const { value, arg } = binding

    if (!value) return

    const hasAuth = (arg === 'all' && Array.isArray(value))
      ? hasAllPermissions(value)
      : (Array.isArray(value) ? hasAnyPermission(value) : hasPermission(value))

    if (!hasAuth) {
      el.parentNode?.removeChild(el)
    }
  }
}

/**
 * 权限指令（禁用而非移除）
 * 使用方式：
 * v-permission:disabled="'customer:add'"
 */
export const permissionDisabledDirective = {
  mounted(el, binding) {
    const { value, arg } = binding

    if (!value) return

    const hasAuth = Array.isArray(value) ? hasAnyPermission(value) : hasPermission(value)

    if (!hasAuth && arg === 'disabled') {
      el.disabled = true
      el.classList.add('is-disabled')
    }
  }
}

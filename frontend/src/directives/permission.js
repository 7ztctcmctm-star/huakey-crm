import { hasPermission, hasAnyPermission, hasPermissionFromStorage } from '@/utils/permission'

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

    let hasAuth = false

    // 优先使用localStorage检查（兼容性更好）
    if (Array.isArray(value)) {
      hasAuth = value.some(code => hasPermissionFromStorage(code))
    } else {
      hasAuth = hasPermissionFromStorage(value)
    }

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

    let hasAuth = false

    if (arg === 'all' && Array.isArray(value)) {
      hasAuth = value.every(code => hasPermissionFromStorage(code))
    } else if (Array.isArray(value)) {
      hasAuth = value.some(code => hasPermissionFromStorage(code))
    } else {
      hasAuth = hasPermissionFromStorage(value)
    }

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

    let hasAuth = false

    if (Array.isArray(value)) {
      hasAuth = value.some(code => hasPermissionFromStorage(code))
    } else {
      hasAuth = hasPermissionFromStorage(value)
    }

    if (!hasAuth && arg === 'disabled') {
      el.disabled = true
      el.classList.add('is-disabled')
    }
  }
}

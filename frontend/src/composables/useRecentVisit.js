/**
 * 最近访问记录（localStorage）
 * 在客户/合同详情页 onMounted 时调用 recordVisit
 * Header 中调用 getVisits 显示列表
 */

const STORAGE_KEY = 'crm_recent_visits'
const MAX_ITEMS = 10
const EXPIRE_DAYS = 30

/**
 * 记录一次访问
 * @param {'customer'|'contract'} type - 访问类型
 * @param {number} id - 记录ID
 * @param {string} name - 显示名称（公司名/合同号）
 */
export function recordVisit(type, id, name) {
  if (!id || !name) return
  try {
    const list = getVisits()
    // 去重：同类型同ID只保留最新
    const filtered = list.filter(v => !(v.type === type && v.id === id))
    filtered.unshift({ type, id, name, time: Date.now() })
    // 截断
    const trimmed = filtered.slice(0, MAX_ITEMS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch { /* ignore */ }
}

/**
 * 获取最近访问列表
 * @returns {Array<{type: string, id: number, name: string, time: number}>}
 */
export function getVisits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    const now = Date.now()
    const expireMs = EXPIRE_DAYS * 86400000
    // 过滤过期项
    const valid = list.filter(v => now - v.time < expireMs)
    // 如果有过期项被清理，回写
    if (valid.length !== list.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid))
    }
    return valid
  } catch {
    return []
  }
}

/**
 * 获取访问类型的路由路径
 */
export function getVisitPath(item) {
  if (item.type === 'customer') return `/customer/detail/${item.id}`
  if (item.type === 'contract') return `/contract/detail/${item.id}`
  return '/'
}

/**
 * 获取访问类型的显示标签
 */
export function getVisitTypeLabel(type) {
  const map = { customer: '客户', contract: '合同' }
  return map[type] || type
}

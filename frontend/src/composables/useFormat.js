export function formatTime(t) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

export function formatDate(t) {
  if (!t) return '-'
  return new Date(t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function formatAmount(v) {
  if (!v && v !== 0) return '0.00'
  return parseFloat(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}

export function isOverdue(time, days = 30) {
  if (!time) return true
  return (new Date() - new Date(time)) > days * 24 * 60 * 60 * 1000
}

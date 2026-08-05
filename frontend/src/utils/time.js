/**
 * 统一时间格式化工具
 * 所有跟进/客户页面统一调用此处，禁止各页面重复定义。
 */

function fmtClock(t) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 相对时间（用于“上次跟进 / 创建时间”等展示）
 */
export function formatRelativeTime(t) {
  if (!t) return '-'
  const now = Date.now()
  const d = new Date(t).getTime()
  const diff = now - d
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hour = Math.floor(min / 60)
  const day = Math.floor(hour / 24)

  if (sec < 60) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  if (hour < 24) return `${hour} 小时前`
  if (day === 1) return '昨天 ' + fmtClock(t)
  if (day < 7) return `${day} 天前`
  if (day < 365) {
    const m = new Date(t).getMonth() + 1
    const dd = new Date(t).getDate()
    return `${m}月${dd}日`
  }
  return new Date(t).toLocaleDateString('zh-CN')
}

/**
 * 完整时间（用于 tooltip / 精确展示）
 */
export function formatFullTime(t) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

/**
 * 相对未来/过去时间（用于“距下次跟进”）
 * - 未来：今天 / 明天 / N 天后
 * - 过去：已逾期（今天） / 已逾期 N 天
 */
export function formatRelativeNextTime(t) {
  if (!t) return '-'
  const now = Date.now()
  const d = new Date(t).getTime()
  const diff = d - now
  const day = Math.floor(Math.abs(diff) / (24 * 60 * 60 * 1000))
  if (diff < 0) return day === 0 ? '已逾期（今天）' : `已逾期 ${day} 天`
  if (day === 0) return '今天'
  if (day === 1) return '明天'
  return `${day} 天后`
}

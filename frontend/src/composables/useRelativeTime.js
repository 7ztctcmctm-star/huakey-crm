export function relativeTime(t) {
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
  if (day === 1) return '昨天 ' + fmtTime(t)
  if (day < 7) return `${day} 天前`
  if (day < 365) {
    const m = new Date(t).getMonth() + 1
    const dd = new Date(t).getDate()
    return `${m}月${dd}日`
  }
  return new Date(t).toLocaleDateString('zh-CN')
}

function fmtTime(t) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function fullTime(t) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

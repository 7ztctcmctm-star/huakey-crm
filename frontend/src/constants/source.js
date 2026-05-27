/**
 * 客户来源常量 — 统一引用，避免各模块重复定义
 *
 * 数据层级：
 *   展会
 *   网络 → Facebook / Instagram / LinkedIn / 独立站 / 其他网络渠道
 *   转介绍
 *   电话
 *   其他
 *
 * 数据库 source 字段存储的是叶子节点的 value（如 'Facebook'，不再是 '网络'）。
 * 历史数据中 '网络' 已迁移为 '其他网络渠道'。
 */

// ---- 源分组定义（所有叶子值）----
export const SOURCE_GROUPS = {
  展会: ['展会'],
  网络: ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道'],
  转介绍: ['转介绍'],
  电话: ['电话'],
  其他: ['其他']
}

// 父分组 → 子值展开（后端筛选 "网络" 时用）
export const SOURCE_PARENT_MAP = {
  网络: ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道']
}

// 所有叶子值
export const ALL_SOURCE_VALUES = Object.values(SOURCE_GROUPS).flat()

// ---- 新增/编辑表单用（option-group 分组）----
export const SOURCE_FORM_OPTIONS = [
  { label: '展会', value: '展会' },
  {
    label: '网络',
    options: [
      { label: 'Facebook', value: 'Facebook' },
      { label: 'Instagram', value: 'Instagram' },
      { label: 'LinkedIn', value: 'LinkedIn' },
      { label: '独立站', value: '独立站' },
      { label: '其他网络渠道', value: '其他网络渠道' }
    ]
  },
  { label: '转介绍', value: '转介绍' },
  { label: '电话', value: '电话' },
  { label: '其他', value: '其他' }
]

// ---- 搜索筛选用（含"全部来源"选项 + option-group 分组）----
export const SOURCE_SEARCH_OPTIONS = [
  { label: '全部来源', value: '' },
  { label: '展会', value: '展会' },
  {
    label: '网络',
    options: [
      { label: 'Facebook', value: 'Facebook' },
      { label: 'Instagram', value: 'Instagram' },
      { label: 'LinkedIn', value: 'LinkedIn' },
      { label: '独立站', value: '独立站' },
      { label: '其他网络渠道', value: '其他网络渠道' }
    ]
  },
  { label: '转介绍', value: '转介绍' },
  { label: '电话', value: '电话' },
  { label: '其他', value: '其他' }
]

// ---- 报表用：叶子值 → 父分组名 ----
export function getSourceParent(leafValue) {
  for (const [parent, children] of Object.entries(SOURCE_GROUPS)) {
    if (children.includes(leafValue)) return parent
  }
  return '其他'
}

// ---- 报表用：标签颜色 ----
const SOURCE_COLORS = {
  展会: '#409EFF',
  Facebook: '#1877F2',
  Instagram: '#E4405F',
  LinkedIn: '#0A66C2',
  独立站: '#67C23A',
  其他网络渠道: '#909399',
  转介绍: '#E6A23C',
  电话: '#F56C6C',
  其他: '#B3B3B3'
}

export function getSourceColor(source) {
  return SOURCE_COLORS[source] || '#909399'
}

// 父分组颜色（报表饼图用）
export const PARENT_SOURCE_COLORS = {
  展会: '#1a56db',
  网络: '#2563eb',
  转介绍: '#3b82f6',
  电话: '#60a5fa',
  其他: '#94a3b8'
}

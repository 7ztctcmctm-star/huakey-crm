const LEVEL_MAP = {
  A: { type: 'danger', color: '#F56C6C', label: 'A级-重点' },
  B: { type: 'warning', color: '#E6A23C', label: 'B级-意向' },
  C: { type: 'info',    color: '#409EFF', label: 'C级-潜在' },
  D: { type: '',        color: '#909399', label: 'D级-冷淡' }
}

export const LEVEL_OPTIONS = Object.entries(LEVEL_MAP).map(([value, { label }]) => ({ label, value }))

export function levelTagType(l) { return LEVEL_MAP[l]?.type || 'info' }
export function levelColor(l) { return LEVEL_MAP[l]?.color }
export function levelLabel(l) { return LEVEL_MAP[l]?.label || l || '-' }

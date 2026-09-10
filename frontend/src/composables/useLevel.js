const LEVEL_MAP = {
  A: { type: 'danger',  color: 'var(--color-danger)',         label: 'A级-重点' },
  B: { type: 'warning', color: 'var(--color-warning)',        label: 'B级-意向' },
  C: { type: 'info',    color: 'var(--color-accent)',         label: 'C级-潜在' },
  D: { type: '',        color: 'var(--color-text-secondary)', label: 'D级-冷淡' }
}

export const LEVEL_OPTIONS = Object.entries(LEVEL_MAP).map(([value, { label }]) => ({ label, value }))

export function levelTagType(l) { return LEVEL_MAP[l]?.type || 'info' }
export function levelColor(l) { return LEVEL_MAP[l]?.color }
export function levelLabel(l) { return LEVEL_MAP[l]?.label || l || '-' }

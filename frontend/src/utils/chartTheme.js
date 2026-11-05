/**
 * Chart theme tokens — mirrors `apple.css` CSS variables.
 * Use these when ECharts or other canvas-based renderers need resolved HEX/RGB values.
 */

export function cssVar(name, fallback = '#86868b') {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function normalizeHex(color) {
  const hex = color.replace('#', '')
  if (hex.length === 3) {
    return hex.split('').map(c => c + c).join('')
  }
  return hex
}

export function alpha(color, opacity) {
  const hex = normalizeHex(color)
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export const chartColors = {
  primary: cssVar('--color-accent'),
  secondary: cssVar('--color-success'),
  tertiary: cssVar('--color-warning'),
  quaternary: cssVar('--color-danger'),
  quinary: cssVar('--color-purple'),
  senary: cssVar('--color-cyan'),
  septenary: cssVar('--color-orange'),
  neutral: cssVar('--color-text-secondary'),
  text: cssVar('--color-text'),
  textSecondary: cssVar('--color-text-secondary'),
  textTertiary: cssVar('--color-text-tertiary'),
  border: cssVar('--color-border'),
  bg: cssVar('--color-bg')
}

/**
 * Element Plus 语义色（canvas 不解析 CSS 变量，需在渲染前取计算值）。
 * fallback 与 Element Plus 默认主题一致，保证 CSS 尚未加载时颜色不丢失。
 */
export const semanticColors = {
  primary: cssVar('--el-color-primary', '#409eff'),
  success: cssVar('--el-color-success', '#67c23a'),
  warning: cssVar('--el-color-warning', '#e6a23c'),
  danger: cssVar('--el-color-danger', '#f56c6c')
}

/**
 * 销售漏斗渐变（深→浅）— ECharts canvas 只能用具体色值，统一收口在此。
 */
export const funnelColors = ['#0071e3', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#86868b']
export const funnelColorsLight = ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#e2e8f0', '#cbd5e1']

export function chartPalette() {
  return [
    cssVar('--chart-color-1'),
    cssVar('--chart-color-2'),
    cssVar('--chart-color-3'),
    cssVar('--chart-color-4'),
    cssVar('--chart-color-5'),
    cssVar('--chart-color-6'),
    cssVar('--chart-color-7'),
    cssVar('--chart-color-8')
  ]
}

export function presetColors(count = 8) {
  return chartPalette().slice(0, count)
}

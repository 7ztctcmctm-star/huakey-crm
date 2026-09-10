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
  border: cssVar('--color-border'),
  bg: cssVar('--color-bg')
}

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

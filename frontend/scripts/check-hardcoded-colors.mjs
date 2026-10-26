#!/usr/bin/env node
/**
 * 硬编码颜色守卫（P2-V11-14）
 *
 * 规则：`src/` 下 .vue/.js/.css 不得出现裸十六进制颜色，颜色只能来自：
 *   1) 设计 token 源：`src/styles/apple.css`（CSS 变量定义）
 *   2) 图表 token 源：`src/utils/chartTheme.js`（canvas 需解析后的具体色值）
 *   3) 明确标注 `color-allowlist` 的行（如第三方平台品牌色）
 *   4) 测试文件（测试夹具可含任意颜色）
 *
 * 用法：npm run lint:colors
 * 退出码：0 = 通过；1 = 存在违规
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const EXTENSIONS = new Set(['.vue', '.js', '.css'])
const ALLOWED_FILES = new Set([
  'src/styles/apple.css',
  'src/utils/chartTheme.js'
])
const SKIP_DIRS = new Set(['tests', '__tests__', 'node_modules'])
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const HEX_TEST_RE = /#[0-9a-fA-F]{3,8}\b/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out)
      continue
    }
    const ext = entry.name.slice(entry.name.lastIndexOf('.'))
    if (EXTENSIONS.has(ext)) out.push(full)
  }
  return out
}

const violations = []
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/')
  if (ALLOWED_FILES.has(rel)) continue
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  let allowNextLine = false
  lines.forEach((line, index) => {
    if (line.includes('color-allowlist')) {
      // 注释可写在同一条语句上，也可单独成行豁免下一行
      allowNextLine = !HEX_TEST_RE.test(line)
      return
    }
    if (allowNextLine) {
      allowNextLine = false
      return
    }
    const matches = line.match(HEX_RE)
    if (!matches) return
    violations.push({ file: rel, line: index + 1, colors: [...new Set(matches)].join(', ') })
  })
}

if (violations.length === 0) {
  console.log('check-hardcoded-colors: OK（无裸十六进制颜色）')
  process.exit(0)
}

console.error(`check-hardcoded-colors: 发现 ${violations.length} 处硬编码颜色`)
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.colors}`)
}
console.error('\n请改用 apple.css / Element Plus CSS 变量，或在使用处加 `color-allowlist` 注释说明理由。')
process.exit(1)

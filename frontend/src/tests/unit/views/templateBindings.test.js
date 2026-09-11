/**
 * 模板绑定守卫 —— <script setup> SFC 中，模板引用的标识符必须已在脚本里声明。
 *
 * 为什么需要：前端没有 ESLint（根 .lintstagedrc.json 只覆盖 backend 目录）。
 * 「模板引用了未声明变量」不会被构建拦住（编译成 _ctx.x，运行时渲染空值），
 * E2E 也只在特定状态才覆盖得到。此前 supplier/list.vue 就因此把错误态传丢过。
 *
 * 判定方式：模板编译产物里出现 _ctx.<name>，即该 name 未声明。
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'

// 不用 import.meta.url：jsdom 环境下它不是 file: 协议。vitest 的 cwd 即 frontend/
const VIEWS_DIR = join(process.cwd(), 'src', 'views')

// 合法的实例属性（模板里可直接用，不要求脚本声明）
// $router/$route 由 vue-router 的 app.use() 注入 globalProperties（实测 19 个视图在用）
const ALLOWED = new Set([
  '$slots', '$attrs', '$props', '$refs', '$emit', '$el', '$parent', '$root', '$options', '$data',
  '$router', '$route'
])

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : p.endsWith('.vue') ? [p] : []
  })
}

describe('模板绑定守卫', () => {
  it('所有 <script setup> 视图的模板标识符均已声明', () => {
    expect(existsSync(VIEWS_DIR), `未找到 ${VIEWS_DIR}，请在 frontend/ 目录下运行 vitest`).toBe(true)
    const problems = []
    for (const file of walk(VIEWS_DIR)) {
      const source = readFileSync(file, 'utf8')
      // Options API 页面（如 NotFound.vue）模板走 _ctx 代理，本规则不适用
      if (!source.includes('<script setup')) continue

      const { descriptor, errors } = parse(source, { filename: file })
      if (errors.length) { problems.push(`${file}: SFC 解析失败 ${errors[0].message}`); continue }

      const { bindings } = compileScript(descriptor, { id: 'guard' })
      const { code, errors: tplErrors } = compileTemplate({
        source: descriptor.template?.content || '',
        filename: file,
        id: 'guard',
        compilerOptions: { bindingMetadata: bindings, prefixIdentifiers: true },
      })
      if (tplErrors?.length) { problems.push(`${file}: 模板编译失败 ${tplErrors[0].message || tplErrors[0]}`); continue }

      const undeclared = [...new Set([...code.matchAll(/_ctx\.([A-Za-z0-9_$]+)/g)].map((m) => m[1]))]
        .filter((n) => !ALLOWED.has(n))
      if (undeclared.length) {
        problems.push(`${file.replace(VIEWS_DIR, 'views')}: 模板引用了未声明的标识符 -> ${undeclared.join(', ')}`)
      }
    }
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([])
  })
})

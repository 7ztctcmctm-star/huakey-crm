/**
 * [P1-28] 客户等级前后端枚举一致性（前端侧守位）
 *
 * 后端已按 `crm_customer.level` 的 A/B/C/D 定义统一放行 D 级
 * （backend/constants/customerLevel.js）。本测试锁定前端所有会下发
 * `level` 的入口仍提供 D，避免今后单侧回退成 A/B/C。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEVEL_OPTIONS } from '@/composables/useLevel'

const read = (...parts) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8')

describe('[P1-28] 客户等级 A/B/C/D', () => {
  it('共享等级选项包含 A/B/C/D', () => {
    expect(LEVEL_OPTIONS.map((o) => o.value)).toEqual(['A', 'B', 'C', 'D'])
  })

  it.each([
    ['客户列表', ['views', 'customer', 'List.vue']],
    ['客户详情', ['views', 'customer', 'Detail.vue']],
    ['潜客池', ['views', 'leads', 'List.vue']],
    ['公海池', ['views', 'pool', 'List.vue']]
  ])('%s 提供 D 级选项', (_name, parts) => {
    const source = read(...parts)
    // 列表页用对象字面量 value: 'D'，详情页用模板属性 value="D"
    expect(source).toMatch(/value[:=]\s*['"]D['"]/)
  })
})

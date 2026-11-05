/**
 * [P1-25] 合同回款计划删除回归守卫
 *
 * 缺陷回顾：编辑合同时点“删除”只把计划从 form.plans 里 splice 掉，保存时后端
 * 既不知道要删哪条，也没有校验计划归属；结果是被删的计划在保存后“复活”。
 *
 * 本测试做源码级守位（视图依赖大量接口，整体挂载成本高且易碎）：
 *  1. 删除按钮必须走 removePlan($index)，且 removePlan 记录已有计划 id；
 *  2. 新建/编辑打开表单时清空记录，避免串合同；
 *  3. 编辑保存必须随请求下发 delete_plan_ids。
 * 后端归属校验与 SQL 限定由 backend/tests/unit/services-contractCrudService.test.js 行为级覆盖。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(process.cwd(), 'src', 'views', 'contract', 'list.vue'), 'utf8')

function scriptBlock() {
  const match = SOURCE.match(/<script setup>([\s\S]*?)<\/script>/)
  expect(match, 'contract/list.vue 应包含 <script setup> 块').toBeTruthy()
  return match[1]
}

describe('[P1-25] 合同回款计划删除', () => {
  it('删除按钮调用 removePlan($index)，不再直接 splice', () => {
    expect(SOURCE).toContain('@click="removePlan($index)"')
    expect(SOURCE).not.toMatch(/@click="form\.plans\.splice/)
  })

  it('removePlan 把已有计划的 id 记入 deletedPlanIds', () => {
    const script = scriptBlock()
    const fn = script.match(/const removePlan =[\s\S]*?\n\}/)
    expect(fn, '应定义 removePlan').toBeTruthy()
    expect(fn[0]).toContain('form.plans.splice(index, 1)')
    expect(fn[0]).toContain('removed?.id')
    expect(fn[0]).toContain('deletedPlanIds.value.push(removed.id)')
  })

  it('新建与编辑打开表单时都应清空 deletedPlanIds（防止跨合同串号）', () => {
    const script = scriptBlock()
    const create = script.match(/const handleCreate = \(\) => \{[^\n]*\}/)
    const edit = script.match(/const handleEdit = async \(row\) => \{[\s\S]*?\n\}/)
    expect(create[0]).toContain('deletedPlanIds.value = []')
    expect(edit[0]).toContain('deletedPlanIds.value = []')
  })

  it('编辑保存时下发 delete_plan_ids，新增时不带', () => {
    const script = scriptBlock()
    const submit = script.match(/const submitForm = async \(\) => \{[\s\S]*?\n\}/)
    expect(submit, '应定义 submitForm').toBeTruthy()
    expect(submit[0]).toContain('data.delete_plan_ids = deletedPlanIds.value')
    // 只在 isEdit 分支里赋值
    const editBranch = submit[0].match(/if \(isEdit\.value\) \{[\s\S]*?\}/)
    expect(editBranch[0]).toContain('data.delete_plan_ids')
  })
})

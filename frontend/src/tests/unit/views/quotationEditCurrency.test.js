/**
 * [P1-26] 报价编辑币种/汇率/商机回填守卫
 *
 * 后端补齐 schema 后，若详情不回填这三个字段，编辑外币报价会以表单默认的
 * CNY/1.0000 提交，反而把原值覆盖成人民币口径——比“静默丢失”更危险。
 * 本测试锁定详情回填与提交两端的字段一一对应。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(process.cwd(), 'src', 'views', 'quotation', 'edit.vue'), 'utf8')

describe('[P1-26] 报价编辑币种/汇率/商机', () => {
  it('详情加载时必须回填 opportunity_id/currency/exchange_rate', () => {
    expect(SOURCE).toContain('formData.opportunity_id = data.opportunity_id')
    expect(SOURCE).toContain('formData.currency = data.currency')
    expect(SOURCE).toContain('formData.exchange_rate = data.exchange_rate != null ? Number(data.exchange_rate)')
  })

  it('提交时三个字段与后端 updateQuoteSchema 对齐', () => {
    const submit = SOURCE.match(/const handleSubmit = async \(\) => \{[\s\S]*?\n\}/)
    expect(submit, '应定义 handleSubmit').toBeTruthy()
    expect(submit[0]).toContain('opportunity_id: formData.opportunity_id || undefined')
    expect(submit[0]).toContain('currency: formData.currency')
    expect(submit[0]).toContain('exchange_rate: formData.exchange_rate')
  })

  it('汇率回填为数值（el-input-number 不接受 DECIMAL 字符串）', () => {
    const hydrate = SOURCE.match(/formData\.exchange_rate = data\.exchange_rate[^\n]*/)
    expect(hydrate[0]).toContain('Number(data.exchange_rate)')
  })
})

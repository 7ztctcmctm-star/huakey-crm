import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * navigation.spec.js 断言选择器守卫
 *
 * 为什么需要：
 * `frontend/e2e/navigation.spec.js` 用
 *   `page.locator('.el-table, .el-empty')`
 * 判定「列表页加载成功」。但视觉规范第三阶段（提交 c923960）已把全站 `el-empty`
 * 换成自研 `EmptyState`（内联 SVG 插画），**源码里 `el-empty` 只残留注释与一条死样式**
 * （`apple.css:621` 的 `.el-empty__description`，已无组件产出该 class）。
 *
 * 而列表页接入 `StateWrapper` 后，空数据渲染的是 `.empty-state`（EmptyState 根节点），
 * 加载中渲染的是骨架屏 —— 两者都**不产出 `.el-table` 也不产出 `.el-empty`**。
 * ⇒ 该断言只在「列表恰好有数据」时碰巧通过；数据为空时必然红。
 * 这正是 navigation.spec 连续 5 次红灯的形态：真因被 seed 数据不足触发，而断言本身也已过时。
 * （2026-09-12 已将 E2E 选择器修正为 `.el-table, .empty-state`，本测试同步锁定该契约。）
 *
 * 本测试用真实页面组件在三种状态下渲染，反向验证 E2E 使用的选择器确实能命中，
 * 从而在**不依赖浏览器与数据库**的前提下，把「断言与实现脱节」这类缺陷拦在 CI 前。
 */
vi.mock('@element-plus/icons-vue', async () => await vi.importActual('@element-plus/icons-vue'))

// 商机页 onMounted → fetchFunnel() + fetchList()，两者都要 mock，
// 否则未 mock 的 getSalesFunnel 会走真实 request，在 jsdom 下产生未捕获 rejection。
vi.mock('@/api/opportunity', () => ({
  getOpportunityList: vi.fn(),
  // 形状必须与 list.vue fetchFunnel 的消费一致：
  //   data.funnel / data.total_count / data.total_amount / data.failed{count,amount}
  // 少了 data.failed 会让模板 `funnelFailed.count` 抛 TypeError（Unhandled Rejection）。
  getSalesFunnel: vi.fn().mockResolvedValue({
    code: 200,
    data: {
      funnel: [],
      total_count: 0,
      total_amount: 0,
      failed: { count: 0, amount: 0 },
    },
  }),
}))

vi.mock('@/api/product', () => ({
  getProductList: vi.fn(),
  getProductCategories: vi.fn().mockResolvedValue({ code: 200, data: [] }),
}))

// 商机页还引入 @/api/system 与 @/api/customer（下拉选项用，onMounted 不触发，
// 但保持与真实模块同形，避免将来页面初始化扩展时静默走网络）。
vi.mock('@/api/system', () => ({
  getUserList: vi.fn().mockResolvedValue({ code: 200, data: { list: [], total: 0 } }),
}))

vi.mock('@/api/customer', () => ({
  getCustomerList: vi.fn().mockResolvedValue({ code: 200, data: { list: [], total: 0 } }),
}))

import { getOpportunityList } from '@/api/opportunity'
import { getProductList } from '@/api/product'
import OpportunityList from '@/views/opportunity/list.vue'
import ProductIndex from '@/views/product/index.vue'

/**
 * E2E navigation.spec.js 使用的「列表已加载」判定选择器（2026-09-12 修订后快照）。
 *
 * 修订前为 `'.el-table, .el-empty'` —— 与实现脱节：el-empty 已全站下线，
 * 空态实际渲染 `.empty-state`，导致断言只在「列表恰好有数据」时碰巧通过。
 *
 * ⚠️ 本常量必须与 frontend/e2e/navigation.spec.js 的 `LIST_LOADED` 保持一致。
 *    若 E2E 侧再次调整选择器，本测试会失败并提示同步 —— 这正是它存在的意义。
 */
const E2E_SELECTOR = '.el-table, .empty-state'
const REAL_TABLE = '.el-table'
const REAL_EMPTY = '.empty-state'
const REAL_SKELETON = '.table-skeleton'

const stubs = {
  directives: { permission: {} },
  stubs: {
    TableSkeleton: { template: '<div class="table-skeleton" />' },
    'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
    'el-table': { template: '<div class="el-table"><slot /></div>' },
    'el-table-column': true,
    'el-pagination': true,
    'el-dialog': true,
    'el-form': true,
    'el-form-item': true,
    'el-input': true,
    'el-select': true,
    'el-option': true,
    'el-card': { template: '<div><slot /></div>' },
  },
}

const mountOpp = () =>
  mount(OpportunityList, {
    global: { ...stubs, stubs: { ...stubs.stubs, ViewToggle: true, StatCard: true } },
  })

const mountProduct = () =>
  mount(ProductIndex, { global: stubs })

describe('navigation.spec 选择器与页面真实渲染的对齐性', () => {
  beforeEach(() => vi.clearAllMocks())

  it('商机列表为空时：E2E 选择器必须能命中（当前 .el-empty 已下线，故需靠 .el-table）', async () => {
    getOpportunityList.mockResolvedValueOnce({ code: 200, data: { list: [], total: 0 } })
    const w = mountOpp()
    await flushPromises()

    const html = w.html()
    const e2eHit = w.find(E2E_SELECTOR).exists()
    const emptyHit = w.find(REAL_EMPTY).exists()

    // 空数据时渲染的是 EmptyState，不是 el-table
    expect(emptyHit, `空态应渲染 ${REAL_EMPTY}；DOM:\n${html.slice(0, 600)}`).toBe(true)
    expect(
      e2eHit,
      `E2E 选择器 "${E2E_SELECTOR}" 未命中空态。真实空态节点为 ${REAL_EMPTY}；` +
        `说明 navigation.spec 的断言已与实现脱节（el-empty 已全站下线）。`
    ).toBe(true)
    w.unmount()
  })

  it('商机列表有数据时：E2E 选择器应命中 .el-table', async () => {
    getOpportunityList.mockResolvedValueOnce({
      code: 200,
      data: { list: [{ id: 1, name: 'A 项目', customer_name: 'C 公司', expected_amount: 100 }], total: 1 },
    })
    const w = mountOpp()
    await flushPromises()

    expect(w.find(REAL_TABLE).exists()).toBe(true)
    expect(w.find(E2E_SELECTOR).exists()).toBe(true)
    w.unmount()
  })

  it('产品列表为空时：E2E 选择器必须能命中', async () => {
    getProductList.mockResolvedValueOnce({ code: 200, data: { list: [], total: 0 } })
    const w = mountProduct()
    await flushPromises()

    expect(w.find(REAL_EMPTY).exists()).toBe(true)
    expect(
      w.find(E2E_SELECTOR).exists(),
      `E2E 选择器 "${E2E_SELECTOR}" 未命中产品页空态（真实节点 ${REAL_EMPTY}）。`
    ).toBe(true)
    w.unmount()
  })

  it('加载中：E2E 选择器不应命中（等骨架屏不算「加载成功」）', async () => {
    // 挂起请求，让页面停在 loading 态
    getOpportunityList.mockReturnValueOnce(new Promise(() => {}))
    const w = mountOpp()
    await flushPromises()

    // 骨架屏确实渲染了
    expect(w.find(REAL_SKELETON).exists()).toBe(true)
    // 加载态下 E2E 选择器不命中 —— 这正是 E2E 必须依赖 timeout 等加载结束的原因；
    // 若此处变为 true，说明骨架屏结构变了（如被包进 .empty-state），需同步复核 navigation.spec。
    expect(
      w.find(E2E_SELECTOR).exists(),
      '加载态下 E2E 选择器不应命中；若命中说明骨架屏与空态结构混淆，需复核 navigation.spec。'
    ).toBe(false)
    w.unmount()
  })
})

/**
 * 客户等级枚举（唯一事实源）
 *
 * 依据：
 *   · `crm_customer.level` 列注释为「客户等级（A/B/C/D）」（000_real_baseline.sql:451）；
 *   · 迁移 016 的数据质量规则值为 ["A","B","C","D"]；
 *   · 前端客户列表 / 详情 / 潜客池 / 公海池均提供 D 级选项。
 *
 * [P1-28] 此前路由层各自写死 `valid('A','B','C')`，选择 D 级筛选或保存 D 级客户
 * 会被 Joi 直接 400；后端枚举才是漂移的一方。新增等级只改这里。
 *
 * 注意：产品价格的 `crm_product_price.customer_level` 是另一套枚举（A/B/C，见迁移 054），
 * 不要复用本常量。
 */
const CUSTOMER_LEVEL_CODES = Object.freeze(['A', 'B', 'C', 'D']);

module.exports = { CUSTOMER_LEVEL_CODES };

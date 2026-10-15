/**
 * 客户资源归属与业务生命周期常量
 *
 * 097 迁移后：
 *   pool_status: VARCHAR(8) 枚举 'private'/'sea'（原 TINYINT 0/1）
 *   business_status: VARCHAR(32) 枚举 lead/following/quoted/negotiating/signed/lost
 *
 * 业务语义：
 *   线索池 = business_status='lead'（不论 pool_status）
 *   正式客户 = business_status IN (following/quoted/negotiating/signed) 且 owner_id IS NOT NULL
 *   公海池 = owner_id IS NULL 且 business_status != 'lead'
 *
 * ⚠️ 2026-10-15 P0-2 判据收敛：**owner_id 是公海/归属的唯一年事实源**
 * （MASTER_SPEC §3.3）。历史上曾以 pool_status='sea' 为公海判据，但 097 之后新建的
 * 无主客户 pool_status 并非 'sea'（实测 423 条全不命中）⇒ 公海页恒空。
 * pool_status 降级为只读兼容字段：assign/claim 写 'private'、release 写 'sea'，
 * 读取方一律以 owner_id 为准（listPoolCustomersNew / listFormalCustomers /
 * claimPoolCustomer 已于 2026-10-15 全部收敛）。
 */

// ========== pool_status 枚举 ==========
const POOL_STATUS = {
  PRIVATE: 'private', // 私有（有负责人 或 lead 客户）
  SEA: 'sea'          // 公海（被释放的非 lead 客户，owner_id IS NULL）
};

const POOL_STATUS_CODES = Object.values(POOL_STATUS);

// ========== business_status 枚举 ==========
const BUSINESS_STATUS = {
  LEAD: 'lead',             // 线索/潜客
  FOLLOWING: 'following',   // 跟进中
  QUOTED: 'quoted',         // 已报价
  NEGOTIATING: 'negotiating', // 商务谈判
  SIGNED: 'signed',         // 已成交
  LOST: 'lost'              // 流失
};

const BUSINESS_STATUS_CODES = Object.values(BUSINESS_STATUS);

// 正式客户状态集合（潜客池以外的活跃客户）
const FORMAL_BUSINESS_STATUSES = [
  BUSINESS_STATUS.FOLLOWING,
  BUSINESS_STATUS.QUOTED,
  BUSINESS_STATUS.NEGOTIATING,
  BUSINESS_STATUS.SIGNED
];

// 业务状态显示名称
const BUSINESS_STATUS_NAME = {
  [BUSINESS_STATUS.LEAD]: '线索',
  [BUSINESS_STATUS.FOLLOWING]: '跟进中',
  [BUSINESS_STATUS.QUOTED]: '已报价',
  [BUSINESS_STATUS.NEGOTIATING]: '谈判中',
  [BUSINESS_STATUS.SIGNED]: '已成交',
  [BUSINESS_STATUS.LOST]: '已流失'
};

/**
 * 判断 pool_status 是否有效
 * @param {string} code
 * @returns {boolean}
 */
function isValidPoolStatus(code) {
  return POOL_STATUS_CODES.includes(code);
}

/**
 * 判断 business_status 是否有效
 * @param {string} code
 * @returns {boolean}
 */
function isValidBusinessStatus(code) {
  return BUSINESS_STATUS_CODES.includes(code);
}

module.exports = {
  POOL_STATUS,
  POOL_STATUS_CODES,
  BUSINESS_STATUS,
  BUSINESS_STATUS_CODES,
  FORMAL_BUSINESS_STATUSES,
  BUSINESS_STATUS_NAME,
  isValidPoolStatus,
  isValidBusinessStatus
};

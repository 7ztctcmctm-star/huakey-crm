/**
 * 客户归属/公海状态写入的唯一事实源（P1-03）
 *
 * 历史缺陷：认领/释放/分配分散在 poolService、customerService、assignService，
 * 各写各的字段，导致 status / business_status / pool_status / owner_id 互相矛盾：
 *   · 有负责人但 status 仍为 'sea'（列表显示公海）
 *   · 释放后 business_status 仍为 'signed'（报表仍按正式客户统计）
 *
 * 统一口径（见 constants/poolStatus.js）：
 *   · 线索池   = business_status='lead'（owner 可有可无）
 *   · 公海池   = owner_id IS NULL 且 business_status != 'lead'
 *   · 正式客户 = business_status IN formal 且 owner_id IS NOT NULL
 *
 * 本模块只产出 SET 片段与参数；事务、行锁、权限判定仍由各调用方负责。
 */

const { POOL_STATUS, BUSINESS_STATUS } = require('../constants/poolStatus');
const { CUSTOMER_STATUS } = require('../constants/customerStatus');

/**
 * 认领：owner NULL → user。认领即开始跟进。
 * 用法：`UPDATE crm_customer SET ${CLAIM_SET_SQL} WHERE id = ? AND owner_id IS NULL`
 */
const CLAIM_SET_SQL = 'pool_status = ?, owner_id = ?, protect_until = NULL, status = ?, business_status = ?, last_follow_time = NOW()';

const claimParams = (userId) => [
  POOL_STATUS.PRIVATE,
  userId,
  CUSTOMER_STATUS.FOLLOWING,
  BUSINESS_STATUS.FOLLOWING
];

/**
 * 释放：owner → NULL。仅适用于**非线索**客户；线索释放必须由调用方拒绝/跳过
 * （线索进公海会把 business_status 改成 following，等于把线索静默转成正式客户）。
 */
const RELEASE_SET_SQL = 'pool_status = ?, owner_id = NULL, protect_until = NULL, status = ?, business_status = ?';

const releaseParams = () => [
  POOL_STATUS.SEA,
  CUSTOMER_STATUS.SEA,
  BUSINESS_STATUS.FOLLOWING
];

/**
 * 分配/回收时的状态片段（拼在 SET 子句末尾，可分多段）
 *
 * 规则：
 *   · 线索（business_status='lead'）：分配/回收都不改阶段，继续留在线索池
 *   · 回收为待分配（toUserId 为空）：非线索 → 公海态（status/business_status=following）
 *   · 分配给用户：客户原本无主或 status='sea'（公海客户）→ 转为跟进中；
 *     已归属的客户不变更阶段（避免普通转移丢掉 quoted/signed 阶段）
 *
 * @param {{ owner_id?: number|null, status?: string, business_status?: string }|null|undefined} current
 * @param {number|null|undefined} toUserId
 * @returns {{ sql: string, params: Array }} 无变化时 sql 为空串
 */
function assignmentStatusFragment(current, toUserId) {
  if (current && current.business_status === BUSINESS_STATUS.LEAD) {
    return { sql: '', params: [] };
  }
  if (!toUserId) {
    return {
      sql: ', status = ?, business_status = ?',
      params: [CUSTOMER_STATUS.SEA, BUSINESS_STATUS.FOLLOWING]
    };
  }
  const fromPool = !current
    || current.owner_id === null
    || current.owner_id === undefined
    || current.status === CUSTOMER_STATUS.SEA;
  if (fromPool) {
    return {
      sql: ', status = ?, business_status = ?',
      params: [CUSTOMER_STATUS.FOLLOWING, BUSINESS_STATUS.FOLLOWING]
    };
  }
  return { sql: '', params: [] };
}

module.exports = {
  CLAIM_SET_SQL,
  claimParams,
  RELEASE_SET_SQL,
  releaseParams,
  assignmentStatusFragment
};

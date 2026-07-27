/**
 * 客户状态常量（新状态机）
 * 说明：自 Prompt 1 改造后，客户状态统一使用 code 字符串，不再使用数字 status
 */

// 状态编码
const CUSTOMER_STATUS = {
  LEAD: 'lead',
  SEA: 'sea',
  FOLLOWING: 'following',
  QUOTED: 'quoted',
  NEGOTIATING: 'negotiating',
  SIGNED: 'signed',
  LOST: 'lost',
  PAUSED: 'paused'
};

// 状态显示名称
const CUSTOMER_STATUS_NAME = {
  [CUSTOMER_STATUS.LEAD]: '线索',
  [CUSTOMER_STATUS.SEA]: '公海客户',
  [CUSTOMER_STATUS.FOLLOWING]: '跟进中',
  [CUSTOMER_STATUS.QUOTED]: '已报价',
  [CUSTOMER_STATUS.NEGOTIATING]: '谈判中',
  [CUSTOMER_STATUS.SIGNED]: '已签约',
  [CUSTOMER_STATUS.LOST]: '已流失',
  [CUSTOMER_STATUS.PAUSED]: '暂停跟进'
};

// Element Plus 标签类型映射
const CUSTOMER_STATUS_TAG_TYPE = {
  [CUSTOMER_STATUS.LEAD]: '',
  [CUSTOMER_STATUS.SEA]: 'info',
  [CUSTOMER_STATUS.FOLLOWING]: 'primary',
  [CUSTOMER_STATUS.QUOTED]: 'success',
  [CUSTOMER_STATUS.NEGOTIATING]: 'warning',
  [CUSTOMER_STATUS.SIGNED]: 'success',
  [CUSTOMER_STATUS.LOST]: 'danger',
  [CUSTOMER_STATUS.PAUSED]: 'info'
};

// 默认颜色（供前端自定义渲染使用）
const CUSTOMER_STATUS_COLOR = {
  [CUSTOMER_STATUS.LEAD]: '#909399',
  [CUSTOMER_STATUS.SEA]: '#909399',
  [CUSTOMER_STATUS.FOLLOWING]: '#409EFF',
  [CUSTOMER_STATUS.QUOTED]: '#67C23A',
  [CUSTOMER_STATUS.NEGOTIATING]: '#E6A23C',
  [CUSTOMER_STATUS.SIGNED]: '#67C23A',
  [CUSTOMER_STATUS.LOST]: '#F56C6C',
  [CUSTOMER_STATUS.PAUSED]: '#909399'
};

// 主销售漏斗路径（用于 forward / backward）
const CUSTOMER_STATUS_PIPELINE = [
  CUSTOMER_STATUS.LEAD,
  CUSTOMER_STATUS.SEA,
  CUSTOMER_STATUS.FOLLOWING,
  CUSTOMER_STATUS.QUOTED,
  CUSTOMER_STATUS.NEGOTIATING,
  CUSTOMER_STATUS.SIGNED
];

// 所有有效的状态编码集合
const CUSTOMER_STATUS_CODES = Object.values(CUSTOMER_STATUS);

/**
 * 判断状态编码是否有效
 * @param {string} code
 * @returns {boolean}
 */
function isValidCustomerStatus(code) {
  return CUSTOMER_STATUS_CODES.includes(code);
}

/**
 * 判断状态是否为终态
 * @param {object} config - sys_customer_status 中的配置行
 * @returns {boolean}
 */
function isEndStatus(config) {
  return config && config.is_end === 1;
}

module.exports = {
  CUSTOMER_STATUS,
  CUSTOMER_STATUS_NAME,
  CUSTOMER_STATUS_TAG_TYPE,
  CUSTOMER_STATUS_COLOR,
  CUSTOMER_STATUS_PIPELINE,
  CUSTOMER_STATUS_CODES,
  isValidCustomerStatus,
  isEndStatus
};

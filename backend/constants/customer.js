// 客户状态常量
const CUSTOMER_STATUS = {
  DELETED: 0,      // 删除
  PROSPECT: 1,     // 潜客
  CUSTOMER: 2,     // 正式客户
  LOST: 3,         // 流失
  LEAD: 5          // 线索（新导入）
};

const STATUS_MAP = {
  0: '已删除',
  1: '潜客',
  2: '正式客户',
  3: '已流失',
  5: '线索'
};

const STATUS_TAG_TYPE = {
  0: 'info',
  1: 'warning',
  2: 'success',
  3: 'danger',
  5: ''
};

module.exports = { CUSTOMER_STATUS, STATUS_MAP, STATUS_TAG_TYPE };

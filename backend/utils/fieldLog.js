const { logAction, getIpAddress, extractUserInfo } = require('../middleware/logger');

// 字段中文名称映射（按需扩展）
const FIELD_LABEL_MAP = {
  company_name: '公司名称',
  contact_name: '联系人',
  phone: '电话',
  email: '邮箱',
  address: '地址',
  industry: '行业',
  source: '来源',
  level: '等级',
  status: '状态',
  remark: '备注',
  name: '名称',
  expected_amount: '预期金额',
  expected_date: '预期日期',
  stage: '阶段',
  win_rate: '胜率',
  owner_id: '负责人',
  customer_id: '客户',
  amount: '金额',
  sign_date: '签约日期',
  delivery_date: '交付日期',
  payment_terms: '付款条件',
  contract_no: '合同编号',
  title: '标题',
  description: '描述',
  type: '类型',
  priority: '优先级',
  assignee_id: '处理人'
};

/**
 * 对比新旧数据，生成变更记录
 * @param {object} oldData - 变更前的完整记录
 * @param {object} newData - 传入的新字段值 { field: newValue, ... }
 * @param {string[]} allowedFields - 允许追踪的字段列表
 * @returns {{ changedFields: array|null, oldValue: object|null, newValue: object|null }}
 */
function computeFieldChanges(oldData, newData, allowedFields) {
  const changedFields = [];
  const oldVals = {};
  const newVals = {};

  for (const field of allowedFields) {
    if (newData[field] === undefined) continue;
    const oldVal = oldData[field];
    const newVal = newData[field];
    // 统一转字符串比较，避免类型差异
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      changedFields.push({
        field,
        label: FIELD_LABEL_MAP[field] || field,
        old: oldVal,
        new: newVal
      });
      oldVals[field] = oldVal;
      newVals[field] = newVal;
    }
  }

  if (changedFields.length === 0) {
    return { changedFields: null, oldValue: null, newValue: null };
  }

  return {
    changedFields,
    oldValue: oldVals,
    newValue: newVals
  };
}

/**
 * 记录字段级变更日志
 * @param {object} req - Express请求对象
 * @param {object} options
 * @param {string} options.module - 模块名
 * @param {string} options.action - 操作名
 * @param {object} options.oldData - 变更前的完整记录
 * @param {object} options.newData - 传入的新字段值
 * @param {string[]} options.allowedFields - 允许追踪的字段
 * @param {string} [options.description] - 操作描述
 */
async function logFieldChanges(req, { module, action, oldData, newData, allowedFields, description }) {
  const { changedFields, oldValue, newValue } = computeFieldChanges(oldData, newData, allowedFields);
  if (!changedFields) return; // 无变更不记录

  const { userId, userName } = extractUserInfo(req);
  await logAction({
    module,
    action,
    method: req.method,
    url: req.originalUrl,
    params: req.body,
    ipAddress: getIpAddress(req),
    userId,
    userName,
    description: description || `${module} - ${action}`,
    changedFields,
    oldValue,
    newValue
  });
}

module.exports = { computeFieldChanges, logFieldChanges, FIELD_LABEL_MAP };

/**
 * @module utils/paymentPlan
 * @description 回款计划日期唯一性校验
 *
 * 背景：迁移 123 给 crm_payment_plan 加了 UNIQUE(contract_id, plan_date)。
 * 若不前置校验，重复日期会直接撞 1062，由 errorHandler 兜底成 409「数据重复，请核对后重试」——
 * 用户看不出是哪一天重复。因此在写入前统一在此校验，给出可读的具体日期。
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
// [步骤 B3 · 时区统一] 日期归一化统一复用 dateCode（北京时间），避免两处各写一套本地取值
const { dateKey } = require('./dateCode');

/**
 * 归一化计划日期为 YYYY-MM-DD
 * 兼容 'YYYY-MM-DD'、ISO 字符串与 Date 对象（mysql2 将 DATE 列返回为本地时区 Date）
 *
 * @param {string|Date|null} value - 计划日期
 * @returns {string} 归一化后的日期 key；空值返回空串
 */
function toPlanDateKey(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return String(value).trim().slice(0, 10);
    // 按业务时区（Asia/Shanghai）取年月日，不能用 toISOString（UTC 会整体前移一天）
    return dateKey(value);
  }
  return String(value).trim().slice(0, 10);
}

/**
 * 找出第一个重复的计划日期
 *
 * @param {Array<string|Date>} planDates - 计划日期列表
 * @returns {string|null} 重复日期的 key；无重复返回 null
 */
function findDuplicatePlanDate(planDates) {
  const seen = new Set();
  for (const value of planDates || []) {
    const key = toPlanDateKey(value);
    if (!key) continue; // 空值交给 Joi / NOT NULL 约束处理，不参与判重
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/**
 * 校验计划日期在同一合同内唯一，重复则抛业务错误（400）
 *
 * @param {Array<string|Date>} planDates - 计划日期列表
 * @throws {AppError} BUSINESS_VALIDATION，message 带具体重复日期
 * @returns {void}
 */
function assertUniquePlanDates(planDates) {
  const dup = findDuplicatePlanDate(planDates);
  if (dup) {
    throw new AppError(
      ErrorCodes.BUSINESS_VALIDATION,
      `回款计划日期重复：${dup}（同一合同下每个日期只能有一条计划）`
    );
  }
}

module.exports = { toPlanDateKey, findDuplicatePlanDate, assertUniquePlanDates };

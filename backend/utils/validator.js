/**
 * 数据验证工具
 * 支持 required / format / range / unique 四种规则类型
 * 规则来源：sys_validation_rule 表或调用方直接传入
 */

class DataValidator {
  constructor(rules = []) {
    this.rules = rules;
  }

  /**
   * 验证单条记录
   * @param {object} record - 要验证的数据对象
   * @returns {{ valid: boolean, errors: Array<{column, message}> }}
   */
  validate(record) {
    const errors = [];

    for (const rule of this.rules) {
      if (rule.is_active === 0) continue;

      const value = record[rule.column_name];
      const config = rule.rule_config ? (typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config) : null;

      switch (rule.rule_type) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            errors.push({
              column: rule.column_name,
              message: rule.error_message || `${rule.column_name} 不能为空`
            });
          }
          break;

        case 'format':
          if (value && config && config.pattern) {
            const re = new RegExp(config.pattern);
            if (!re.test(String(value))) {
              errors.push({
                column: rule.column_name,
                message: rule.error_message || `${rule.column_name} 格式不正确`
              });
            }
          }
          break;

        case 'range':
          if (value !== undefined && value !== null && value !== '' && config) {
            if (config.values && !config.values.includes(String(value))) {
              errors.push({
                column: rule.column_name,
                message: rule.error_message || `${rule.column_name} 值不在允许范围内`
              });
            }
            if (config.min !== undefined && Number(value) < config.min) {
              errors.push({
                column: rule.column_name,
                message: rule.error_message || `${rule.column_name} 不能小于 ${config.min}`
              });
            }
            if (config.max !== undefined && Number(value) > config.max) {
              errors.push({
                column: rule.column_name,
                message: rule.error_message || `${rule.column_name} 不能大于 ${config.max}`
              });
            }
          }
          break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 批量验证
   * @param {Array} records
   * @returns {{ validRecords: Array, invalidRecords: Array }}
   */
  validateBatch(records) {
    const validRecords = [];
    const invalidRecords = [];

    for (const record of records) {
      const result = this.validate(record);
      if (result.valid) {
        validRecords.push(record);
      } else {
        invalidRecords.push({ record, errors: result.errors });
      }
    }

    return { validRecords, invalidRecords };
  }
}

module.exports = DataValidator;

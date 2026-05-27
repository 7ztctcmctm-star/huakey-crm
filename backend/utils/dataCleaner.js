/**
 * 数据清洗工具
 * 提供字符串清理、电话标准化、邮箱规范化、重复检测
 */

class DataCleaner {
  /**
   * 清洗客户数据
   * @param {Array} data - 原始数据数组
   * @returns {Array} 清洗后的数据
   */
  static cleanCustomerData(data) {
    return data.map(record => ({
      ...record,
      company_name: this.cleanString(record.company_name),
      contact_name: this.cleanString(record.contact_name),
      phone: this.cleanPhone(record.phone),
      email: this.cleanEmail(record.email),
      address: this.cleanString(record.address),
      industry: this.cleanString(record.industry),
      source: this.cleanString(record.source),
      remark: record.remark ? String(record.remark).trim() : record.remark
    }));
  }

  /**
   * 清洗字符串：去首尾空格，合并连续空格
   */
  static cleanString(str) {
    if (!str && str !== 0) return str;
    return String(str).trim().replace(/\s+/g, ' ');
  }

  /**
   * 清洗电话号码：只保留数字和+号
   */
  static cleanPhone(phone) {
    if (!phone) return phone;
    let cleaned = String(phone).trim().replace(/[^\d+]/g, '');
    // 去掉多余的+号，只保留开头一个
    cleaned = cleaned.replace(/\+/g, '');
    return cleaned || phone;
  }

  /**
   * 清洗邮箱：trim + 小写
   */
  static cleanEmail(email) {
    if (!email) return email;
    return String(email).trim().toLowerCase();
  }

  /**
   * 检测批量数据中的重复记录
   * @param {Array} data - 数据数组
   * @param {Array} keyFields - 用于判断重复的字段名
   * @returns {Array<{index, record, duplicateOf}>}
   */
  static detectDuplicates(data, keyFields) {
    const seen = new Map();
    const duplicates = [];

    data.forEach((record, index) => {
      const key = keyFields.map(f => (record[f] || '').toLowerCase().trim()).join('|');
      if (!key.replace(/\|/g, '')) return; // 全空不算重复

      if (seen.has(key)) {
        duplicates.push({
          index,
          record,
          duplicateOf: seen.get(key)
        });
      } else {
        seen.set(key, index);
      }
    });

    return duplicates;
  }

  /**
   * 从批量数据中去除与数据库已有记录重复的条目
   * @param {Array} data - 清洗后的数据
   * @param {object} pool - 数据库连接池
   * @param {string} tableName - 表名
   * @param {Array<{column, value}>} matchFields - 匹配条件
   * @returns {Promise<{newRecords: Array, skippedCount: number}>}
   */
  static async filterExistingDuplicates(data, pool, tableName, matchFields) {
    if (data.length === 0) return { newRecords: [], skippedCount: 0 };

    // 收集所有待检查的值
    const valueSets = {};
    for (const field of matchFields) {
      valueSets[field.column] = [...new Set(data.map(r => r[field.column]).filter(v => v))];
    }

    // 构建查询
    const conditions = [];
    const params = [];
    for (const field of matchFields) {
      const values = valueSets[field.column];
      if (values.length > 0) {
        conditions.push(`${field.column} IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
      }
    }

    if (conditions.length === 0) return { newRecords: data, skippedCount: 0 };

    const whereClause = conditions.join(' OR ');
    const [existing] = await pool.query(
      `SELECT ${matchFields.map(f => f.column).join(', ')} FROM ${tableName} WHERE deleted_at IS NULL AND (${whereClause})`,
      params
    );

    // 构建已存在记录的 Set
    const existingSet = new Set(
      existing.map(row =>
        matchFields.map(f => (row[f.column] || '').toLowerCase().trim()).join('|')
      )
    );

    const newRecords = [];
    let skippedCount = 0;

    for (const record of data) {
      const key = matchFields.map(f => (record[f.column] || '').toLowerCase().trim()).join('|');
      if (existingSet.has(key)) {
        skippedCount++;
      } else {
        newRecords.push(record);
      }
    }

    return { newRecords, skippedCount };
  }
}

module.exports = DataCleaner;

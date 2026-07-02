/**
 * 客户导入服务层
 * 从 routes/customer/import.js 提取的业务逻辑
 */
const XLSX = require('xlsx');
const DataCleaner = require('../utils/dataCleaner');
const DataValidator = require('../utils/validator');
const { createRouteLogger } = require('../middleware/logger');

const logAction = createRouteLogger('客户管理');

// Excel 列名 → DB 字段映射
const FIELD_MAP = {
  '公司名称': 'company_name',
  '联系人': 'contact_name',
  '电话': 'phone',
  '联系电话': 'phone',
  '邮箱': 'email',
  '地址': 'address',
  '公司地址': 'address',
  '行业': 'industry',
  '来源': 'source',
  '客户来源': 'source',
  '等级': 'level',
  '客户等级': 'level',
  '状态': 'status',
  '客户状态': 'status',
  '备注': 'remark',
};

/**
 * 解析 Excel 行数据为标准格式
 */
function parseRows(rawRows) {
  const headers = Object.keys(rawRows[0]);
  return rawRows.map((row, i) => {
    const item = { _row: i + 2 };
    const extras = [];
    for (const h of headers) {
      const val = String(row[h] || '').trim();
      if (!val) continue;
      if (FIELD_MAP[h]) item[FIELD_MAP[h]] = val;
      else extras.push(h + ': ' + val);
    }
    if (extras.length > 0) {
      item.remark = (item.remark ? item.remark + '; ' : '') + extras.join('; ');
    }
    if (!item.level) item.level = 'C';
    if (!item.status) item.status = 1;
    return item;
  });
}

/**
 * 导入预览
 */
async function importPreview(pool, fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    throw Object.assign(new Error('Excel文件为空'), { statusCode: 400 });
  }

  const headers = Object.keys(rows[0]);
  const mapped = [];
  const unmapped = [];
  for (const h of headers) {
    if (FIELD_MAP[h]) mapped.push({ excel: h, field: FIELD_MAP[h] });
    else if (h.trim()) unmapped.push(h);
  }

  let preview = parseRows(rows);
  preview = DataCleaner.cleanCustomerData(preview);

  // 加载验证规则并验证
  const [rules] = await pool.query(
    'SELECT * FROM sys_validation_rule WHERE table_name = ? AND is_active = 1',
    ['crm_customer']
  );
  const validator = new DataValidator(rules);
  preview = preview.map(item => {
    const result = validator.validate(item);
    return { ...item, valid: result.valid, errors: result.errors };
  });

  return {
    total: preview.length,
    mapped_fields: mapped,
    unmapped_fields: unmapped,
    preview: preview.slice(0, 10)
  };
}

/**
 * 批量导入已解析的客户数据（供异步 Worker 调用）
 * @param {object} pool
 * @param {Array} customers - 已解析的客户记录数组
 * @param {number} userId
 */
async function batchImport(pool, customers, userId) {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw Object.assign(new Error('导入数据为空'), { statusCode: 400 });
  }

  // 1. 数据清洗
  let data = DataCleaner.cleanCustomerData(customers);

  // 2. 状态映射
  const statusMap = { '潜在客户': 1, '成交客户': 2, '流失客户': 3, '未合作': 1, '已合作': 2 };
  data = data.map(item => ({
    ...item,
    status: (item.status && isNaN(item.status)) ? (statusMap[item.status] || 1) : (parseInt(item.status) || 1)
  }));

  // 3. 数据验证
  const [rules] = await pool.query(
    'SELECT * FROM sys_validation_rule WHERE table_name = ? AND is_active = 1',
    ['crm_customer']
  );
  const validator = new DataValidator(rules);
  const { validRecords, invalidRecords } = validator.validateBatch(data);

  // 4. 批量去重
  const { newRecords, skippedCount } = await DataCleaner.filterExistingDuplicates(
    validRecords, pool, 'crm_customer',
    [{ column: 'company_name' }, { column: 'phone' }]
  );

  // 5. 批量插入
  const connection = await pool.getConnection();
  try {
    let success = 0;
    const insertErrors = [];
    const truncate = (val, max) => val && val.length > max ? val.substring(0, max) : val;

    await connection.beginTransaction();

    for (const record of newRecords) {
      try {
        await connection.query(
          `INSERT INTO crm_customer (company_name, contact_name, phone, email, address, industry, source, level, status, remark, owner_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [truncate(record.company_name, 200), truncate(record.contact_name, 50), truncate(record.phone, 20),
           truncate(record.email, 100), truncate(record.address, 500), truncate(record.industry, 50),
           truncate(record.source, 50), truncate(record.level, 20), record.status,
           record.remark ? record.remark.substring(0, 2000) : null, userId]
        );
        success++;
      } catch (error) {
        insertErrors.push(`第${record._row}行: ${error.message}`);
      }
    }

    await connection.commit();

    await logAction({ user: { userId }, ip: '' }, 'import', `批量导入客户: 成功${success}条, 跳过重复${skippedCount}条, 验证失败${invalidRecords.length}条`);

    return {
      success,
      duplicates: skippedCount,
      invalid: invalidRecords.length,
      fail: insertErrors.length,
      errors: [
        ...invalidRecords.slice(0, 5).map(r => `第${r.record._row}行: ${r.errors.map(e => e.message).join('; ')}`),
        ...insertErrors.slice(0, 5)
      ]
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function importCustomers(pool, fileBuffer, userId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rawRows.length === 0) {
    throw Object.assign(new Error('Excel文件为空'), { statusCode: 400 });
  }

  // 1. 原始数据映射
  const data = parseRows(rawRows);

  // 复用异步 Worker 同款批量导入逻辑
  return batchImport(pool, data, userId);
}

/**
 * 从 Excel Buffer 解析为客户记录数组
 * @param {Buffer} fileBuffer
 * @returns {Array}
 */
function parseRowsFromBuffer(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return parseRows(rawRows);
}

module.exports = {
  importPreview,
  importCustomers,
  batchImport,
  parseRowsFromBuffer
};

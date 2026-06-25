// 自定义报表服务
// 从 routes/report/custom.js 提取的业务逻辑

// 数据源字段映射
const SOURCE_FIELDS = {
  customer: { table: 'crm_customer', alias: 't', fields: { id: 'ID', company_name: '客户名称', contact_name: '联系人', phone: '电话', source: '来源', level: '等级', status: '状态', industry: '行业', owner_id: '负责人', create_time: '创建时间' } },
  contract: { table: 'crm_contract', alias: 't', join: 'LEFT JOIN crm_customer cu ON t.customer_id = cu.id', fields: { id: 'ID', contract_no: '合同编号', 'cu.company_name': '客户名称', amount: '合同金额', sign_date: '签订日期', status: '状态', create_time: '创建时间' } },
  payment: { table: 'crm_payment', alias: 't', join: 'LEFT JOIN crm_contract ct ON t.contract_id = ct.id', fields: { id: 'ID', 'ct.contract_no': '合同编号', pay_amount: '回款金额', pay_date: '回款日期', pay_method: '回款方式', create_time: '创建时间' } },
  purchase: { table: 'crm_purchase_order', alias: 't', join: 'LEFT JOIN crm_supplier s ON t.supplier_id = s.id', fields: { id: 'ID', order_no: '采购单号', 's.name': '供应商', total_amount: '采购金额', create_time: '采购日期', status: '状态' } },
  opportunity: { table: 'crm_opportunity', alias: 't', join: 'LEFT JOIN crm_customer cu ON t.customer_id = cu.id', fields: { id: 'ID', name: '商机名称', 'cu.company_name': '客户名称', expected_amount: '预期金额', stage: '阶段', win_rate: '赢率', create_time: '创建时间' } }
};

/**
 * 获取自定义报表列表
 */
async function listReports(pool, userId) {
  const [rows] = await pool.query(
    "SELECT * FROM crm_report_config WHERE (create_by = ? OR is_public = 1) AND deleted_at IS NULL ORDER BY create_time DESC",
    [userId]
  );
  return rows;
}

/**
 * 创建自定义报表
 */
async function createReport(pool, data, userId) {
  const { name, description, report_type, data_source, columns_config, filter_config, chart_config, is_public } = data;
  if (!name || !name.trim()) return { error: '报表名称不能为空' };
  if (!report_type) return { error: '报表类型不能为空' };
  if (!data_source) return { error: '数据来源不能为空' };
  if (!SOURCE_FIELDS[data_source]) return { error: '无效的数据来源' };

  const [result] = await pool.query(
    'INSERT INTO crm_report_config (name, description, report_type, data_source, columns_config, filter_config, chart_config, is_public, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name.trim(), description || null, report_type, data_source, columns_config || null, filter_config || null, chart_config || null, is_public || 0, userId]
  );
  return { id: result.insertId };
}

/**
 * 更新自定义报表（含所有权校验）
 */
async function updateReport(pool, id, data, userId, manageAll) {
  const [existing] = await pool.query('SELECT create_by FROM crm_report_config WHERE id = ? AND deleted_at IS NULL', [id]);
  if (existing.length === 0) return { error: '报表不存在', status: 404 };
  if (existing[0].create_by !== userId && !manageAll) {
    return { error: '无权修改此报表', status: 403 };
  }

  const { name, description, report_type, data_source, columns_config, filter_config, chart_config, is_public } = data;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (report_type !== undefined) { fields.push('report_type = ?'); values.push(report_type); }
  if (data_source !== undefined) { fields.push('data_source = ?'); values.push(data_source); }
  if (columns_config !== undefined) { fields.push('columns_config = ?'); values.push(columns_config); }
  if (filter_config !== undefined) { fields.push('filter_config = ?'); values.push(filter_config); }
  if (chart_config !== undefined) { fields.push('chart_config = ?'); values.push(chart_config); }
  if (is_public !== undefined) { fields.push('is_public = ?'); values.push(parseInt(is_public)); }
  if (fields.length === 0) return { error: '没有要更新的字段', status: 400 };
  values.push(id);
  await pool.query(`UPDATE crm_report_config SET ${fields.join(', ')} WHERE id = ?`, values);
  return { success: true };
}

/**
 * 删除自定义报表（含所有权校验，软删除）
 */
async function deleteReport(pool, id, userId, manageAll) {
  const [existing] = await pool.query('SELECT create_by FROM crm_report_config WHERE id = ? AND deleted_at IS NULL', [id]);
  if (existing.length === 0) return { error: '报表不存在', status: 404 };
  if (existing[0].create_by !== userId && !manageAll) {
    return { error: '无权删除此报表', status: 403 };
  }
  await pool.query('UPDATE crm_report_config SET deleted_at = NOW() WHERE id = ?', [id]);
  return { success: true };
}

/**
 * 获取数据源可用字段列表
 */
function getFields(source) {
  const src = SOURCE_FIELDS[source];
  if (!src) return { error: '无效的数据来源' };
  const fields = Object.entries(src.fields).map(([key, label]) => ({ key, label }));
  return fields;
}

/**
 * 执行自定义报表查询
 */
async function runReport(pool, id, { page = 1, pageSize = 20, filters = {} }) {
  const [configs] = await pool.query('SELECT * FROM crm_report_config WHERE id = ? AND deleted_at IS NULL', [id]);
  if (configs.length === 0) return { error: '报表不存在', status: 404 };
  const config = configs[0];

  const src = SOURCE_FIELDS[config.data_source];
  if (!src) return { error: '无效的数据来源', status: 400 };

  let columns = [];
  try { columns = JSON.parse(config.columns_config || '[]'); } catch { columns = []; }
  if (columns.length === 0) {
    columns = Object.entries(src.fields).slice(0, 6).map(([key, label]) => ({ field: key, label, agg: null }));
  }

  const allowedFields = Object.keys(src.fields);
  const selectParts = columns
    .filter(c => allowedFields.includes(c.field))
    .map(c => {
      if (c.agg === 'count') return `COUNT(${src.alias}.${c.field}) as \`${c.label}\``;
      if (c.agg === 'sum') return `COALESCE(SUM(${src.alias}.${c.field}), 0) as \`${c.label}\``;
      if (c.agg === 'avg') return `COALESCE(AVG(${src.alias}.${c.field}), 0) as \`${c.label}\``;
      return `${src.alias}.${c.field} as \`${c.label}\``;
    });

  let where = `${src.alias}.deleted_at IS NULL`;
  const params = [];

  try {
    const filterConfig = JSON.parse(config.filter_config || '[]');
    for (const f of filterConfig) {
      const val = filters[f.field];
      if (val !== undefined && val !== '') {
        if (f.type === 'select') { where += ` AND ${src.alias}.${f.field} = ?`; params.push(val); }
        else if (f.type === 'date_range' && Array.isArray(val) && val.length === 2) { where += ` AND ${src.alias}.${f.field} BETWEEN ? AND ?`; params.push(val[0], val[1]); }
        else { where += ` AND ${src.alias}.${f.field} LIKE ?`; params.push(`%${val}%`); }
      }
    }
  } catch { /* */ }

  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== '' && !where.includes(key) && allowedFields.includes(key)) {
      where += ` AND ${src.alias}.${key} LIKE ?`;
      params.push(`%${val}%`);
    }
  }

  const hasGroupBy = columns.some(c => c.agg);
  const groupBy = hasGroupBy ? `GROUP BY ${columns.filter(c => !c.agg && allowedFields.includes(c.field)).map(c => `${src.alias}.${c.field}`).join(', ')}` : '';
  const join = src.join || '';

  const countSql = `SELECT COUNT(*) as total FROM ${src.table} ${src.alias} ${join} WHERE ${where}`;
  const [[{ total }]] = await pool.query(countSql, params);

  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const dataSql = `SELECT ${selectParts.join(', ')} FROM ${src.table} ${src.alias} ${join} WHERE ${where} ${groupBy} LIMIT ? OFFSET ?`;
  const [rows] = await pool.query(dataSql, [...params, parseInt(pageSize), offset]);

  return { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

module.exports = {
  listReports,
  createReport,
  updateReport,
  deleteReport,
  getFields,
  runReport
};

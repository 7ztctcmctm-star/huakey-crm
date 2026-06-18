const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { maskSensitiveData } = require('../utils/mask');
const { logFieldChanges } = require('../utils/fieldLog');

const MODULE_NAME = '供应商管理';

const { createRouteLogger } = require('../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  type: Joi.string().valid('生产', '贸易', '服务').allow('', null),
  level: Joi.string().valid('核心', '重点', '普通', '备用').allow('', null),
  status: Joi.number().integer().valid(1, 2, 3).allow('', null)
});

const addSupplierSchema = Joi.object({
  name: Joi.string().required().max(200),
  short_name: Joi.string().max(200).allow('', null),
  type: Joi.string().valid('生产', '贸易', '服务').default('贸易'),
  industry: Joi.string().max(200).allow('', null),
  level: Joi.string().valid('核心', '重点', '普通', '备用').default('普通'),
  contact_person: Joi.string().max(200).allow('', null),
  contact_phone: Joi.string().max(20).allow('', null),
  contact_email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  payment_terms: Joi.string().max(200).allow('', null),
  delivery_days: Joi.number().integer().min(1).max(365).allow(null),
  remark: Joi.string().max(2000).allow('', null)
});

const updateSupplierSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(200),
  short_name: Joi.string().max(200).allow('', null),
  type: Joi.string().valid('生产', '贸易', '服务'),
  industry: Joi.string().max(200).allow('', null),
  level: Joi.string().valid('核心', '重点', '普通', '备用'),
  status: Joi.number().integer().valid(1, 2, 3),
  contact_person: Joi.string().max(200).allow('', null),
  contact_phone: Joi.string().max(20).allow('', null),
  contact_email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  payment_terms: Joi.string().max(200).allow('', null),
  delivery_days: Joi.number().integer().min(1).max(365).allow(null),
  remark: Joi.string().max(2000).allow('', null)
});

const deleteSupplierSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const addContactSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  name: Joi.string().required().max(50),
  position: Joi.string().max(200).allow('', null),
  department: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  mobile: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  wechat: Joi.string().max(50).allow('', null),
  role: Joi.string().valid('决策人', '对接人', '财务', '技术', '其他').default('对接人'),
  is_primary: Joi.number().integer().valid(0, 1).default(0),
  remark: Joi.string().max(500).allow('', null)
});

const supplierListHandler = async (req, res) => {
  try {
  const source = req.method === 'GET' ? req.query : req.body;
  const page = parseInt(source.page) || 1;
  const pageSize = parseInt(source.pageSize) || 10;
  const keyword = source.keyword || '';
  const type = source.type || '';
  const level = source.level || '';
  const status = source.status || '';
  const offset = (page - 1) * pageSize;

  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 's');

    let sql = `SELECT s.*, u.real_name as owner_name,
      (SELECT COUNT(*) FROM crm_supplier_contact c WHERE c.supplier_id = s.id) as contact_count,
      (SELECT COUNT(*) FROM crm_supplier_qualification q WHERE q.supplier_id = s.id AND q.status = 1) as valid_cert_count
      FROM crm_supplier s
      LEFT JOIN sys_user u ON s.owner_id = u.id
      WHERE s.deleted_at IS NULL AND ${permissionClause}`;

    const params = [...permParams];

    if (keyword) {
      sql += ' AND (s.name LIKE ? OR s.supplier_no LIKE ? OR s.contact_person LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (type) {
      sql += ' AND s.type = ?';
      params.push(type);
    }
    if (level) {
      sql += ' AND s.level = ?';
      params.push(level);
    }
    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.create_time DESC LIMIT ?, ?';
    params.push(offset, pageSize);
    const [rows] = await pool.query(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM crm_supplier s WHERE s.deleted_at IS NULL AND ${permissionClause}`;
    const countParams = [...permParams];

    if (keyword) {
      countSql += ' AND (s.name LIKE ? OR s.supplier_no LIKE ? OR s.contact_person LIKE ?)';
      countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (type) {
      countSql += ' AND s.type = ?';
      countParams.push(type);
    }
    if (level) {
      countSql += ' AND s.level = ?';
      countParams.push(level);
    }
    if (status) {
      countSql += ' AND s.status = ?';
      countParams.push(status);
    }

    const [countResult] = await pool.query(countSql, countParams);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total: countResult[0].total } });
  } catch (error) {
    console.error('[供应商] 供应商列表错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
  } catch (error) {
    console.error('[供应商] 供应商列表错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
};

router.get('/list', authenticateToken, checkPermission('supplier'), checkDataPermission('supplier', 'owner_id'), supplierListHandler);
router.post('/list', authenticateToken, checkPermission('supplier'), checkDataPermission('supplier', 'owner_id'), validate(listSchema), supplierListHandler);

router.get('/detail/:id', authenticateToken, checkDataPermission('supplier', 'owner_id'), async (req, res) => {
  const { id } = req.params;

  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 's');

    const [suppliers] = await pool.query(`
      SELECT s.*, u.real_name as owner_name, ub.real_name as create_by_name
      FROM crm_supplier s
      LEFT JOIN sys_user u ON s.owner_id = u.id
      LEFT JOIN sys_user ub ON s.create_by = ub.id
      WHERE s.id = ? AND s.deleted_at IS NULL AND ${permissionClause}
    `, [id, ...permParams]);

    if (!suppliers.length) {
      return res.status(404).json({ code: 404, message: '供应商不存在', data: null });
    }

    const supplier = suppliers[0];

    const [contacts] = await pool.query(
      'SELECT id, supplier_id, name, position, department, phone, mobile, email, wechat, role, is_primary, remark FROM crm_supplier_contact WHERE supplier_id = ? ORDER BY is_primary DESC, id ASC',
      [id]
    );

    const [qualifications] = await pool.query(
      'SELECT id, supplier_id, cert_type, cert_no, cert_name, issue_date, expire_date, issuing_authority, file_path, status, remark FROM crm_supplier_qualification WHERE supplier_id = ? ORDER BY expire_date ASC',
      [id]
    );

    const [ratings] = await pool.query(
      `SELECT r.*, u.real_name as evaluator_name
       FROM crm_supplier_rating r
       LEFT JOIN sys_user u ON r.evaluator_id = u.id
       WHERE r.supplier_id = ?
       ORDER BY r.rating_period DESC
       LIMIT 10`,
      [id]
    );

    const [relatedCustomers] = await pool.query(
      `SELECT r.*, cu.company_name as customer_name
       FROM crm_customer_supplier_relation r
       LEFT JOIN crm_customer cu ON r.customer_id = cu.id
       WHERE r.supplier_id = ?
       ORDER BY r.create_time DESC`,
      [id]
    );

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        ...supplier,
        contacts,
        qualifications,
        ratings,
        relatedCustomers
      }
    });
  } catch (error) {
    console.error('[供应商] 供应商详情错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, checkPermission('supplier:add'), validate(addSupplierSchema), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query(
      'SELECT COUNT(*) as cnt FROM crm_supplier WHERE supplier_no LIKE ? FOR UPDATE',
      [`SUP-${dateStr}-%`]
    );
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const supplierNo = `SUP-${dateStr}-${seq}`;

    const [result] = await connection.query(
      `INSERT INTO crm_supplier (supplier_no, name, short_name, type, industry, level, contact_person, contact_phone, contact_email, address, payment_terms, delivery_days, remark, owner_id, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplierNo,
        req.body.name,
        req.body.short_name || null,
        req.body.type,
        req.body.industry || null,
        req.body.level,
        req.body.contact_person || null,
        req.body.contact_phone || null,
        req.body.contact_email || null,
        req.body.address || null,
        req.body.payment_terms || null,
        req.body.delivery_days || null,
        req.body.remark || null,
        req.user.userId,
        req.user.userId
      ]
    );

    const supplierId = result.insertId;

    if (req.body.contact_person && req.body.contact_phone) {
      await connection.query(
        `INSERT INTO crm_supplier_contact (supplier_id, name, phone, mobile, is_primary)
         VALUES (?, ?, ?, ?, 1)`,
        [supplierId, req.body.contact_person, req.body.contact_phone || null, req.body.contact_phone || null]
      );
    }

    await connection.commit();

    await logAction(req, 'add', `新增供应商: ${req.body.name}`);

    res.json({ code: 200, message: '创建供应商成功', data: { id: supplierId, supplier_no: supplierNo } });
  } catch (error) {
    await connection.rollback();
    console.error('[供应商] 添加供应商错误:', error.message);
    res.status(500).json({ code: 500, message: '创建供应商失败', data: null });
  } finally {
    connection.release();
  }
});

router.post('/update', authenticateToken, checkPermission('supplier:edit'), validate(updateSupplierSchema), async (req, res) => {
  const { id, ...updateFields } = req.body;

  try {
    // 权限校验：非管理员只能修改自己负责/创建的供应商
    const [oldRows] = await pool.query('SELECT * FROM crm_supplier WHERE id=? AND deleted_at IS NULL', [id]);
    if (!oldRows.length) {
      return res.status(404).json({ code: 404, message: '供应商不存在', data: null });
    }
    const oldData = oldRows[0];
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && oldData.owner_id !== userId && oldData.create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权限修改该供应商', data: null });
    }

    const allowedFields = ['name', 'short_name', 'type', 'industry', 'level', 'status', 'contact_person', 'contact_phone', 'contact_email', 'address', 'payment_terms', 'delivery_days', 'remark'];
    const setClauses = [];
    const params = [];

    for (const [key, value] of Object.entries(updateFields)) {
      if (allowedFields.includes(key) && value !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ code: 400, message: '没有要修改的字段', data: null });
    }

    params.push(id);
    await pool.query(`UPDATE crm_supplier SET ${setClauses.join(', ')} WHERE id = ?`, params);

    await logAction(req, 'update', `修改供应商: ID=${id}`);
    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑供应商',
      oldData,
      newData: req.body,
      allowedFields: ['company_name', 'contact_name', 'phone', 'email', 'address', 'industry', 'level', 'status', 'remark', 'owner_id'],
      description: `编辑供应商: ${oldData.name || oldData.company_name}`
    });

    res.json({ code: 200, message: '修改供应商成功', data: null });
  } catch (error) {
    console.error('[供应商] 更新供应商错误:', error.message);
    res.status(500).json({ code: 500, message: '修改供应商失败', data: null });
  }
});

router.post('/delete', authenticateToken, checkPermission('supplier:delete'), validate(deleteSupplierSchema), async (req, res) => {
  const { id } = req.body;

  try {
    const [supplier] = await pool.query('SELECT status, owner_id, create_by FROM crm_supplier WHERE id=? AND deleted_at IS NULL', [id]);
    if (!supplier.length) {
      return res.status(404).json({ code: 404, message: '供应商不存在', data: null });
    }

    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && supplier[0].owner_id !== userId && supplier[0].create_by !== userId) {
      return res.status(403).json({ code: 403, message: '无权限删除该供应商', data: null });
    }

    await pool.query('UPDATE crm_supplier SET deleted_at = NOW() WHERE id=?', [id]);

    await logAction(req, 'delete', `删除供应商: ID=${id}`);

    res.json({ code: 200, message: '删除供应商成功', data: null });
  } catch (error) {
    console.error('[供应商] 删除供应商错误:', error.message);
    res.status(500).json({ code: 500, message: '删除供应商失败', data: null });
  }
});

router.post('/contact/add', authenticateToken, checkPermission('supplier:edit'), validate(addContactSchema), async (req, res) => {
  try {
    const [result] = await pool.query(
      `INSERT INTO crm_supplier_contact (supplier_id, name, position, department, phone, mobile, email, wechat, role, is_primary, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.body.supplier_id,
        req.body.name,
        req.body.position || null,
        req.body.department || null,
        req.body.phone || null,
        req.body.mobile || null,
        req.body.email || null,
        req.body.wechat || null,
        req.body.role,
        req.body.is_primary,
        req.body.remark || null
      ]
    );

    res.json({ code: 200, message: '添加联系人成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[供应商] 添加联系人错误:', error.message);
    res.status(500).json({ code: 500, message: '添加联系人失败', data: null });
  }
});

router.get('/options', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, level, type FROM crm_supplier WHERE status = 1 AND deleted_at IS NULL ORDER BY name'
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[供应商] 查询评分列表失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 评分新增
const addRatingSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  quality_score: Joi.number().min(0).max(5).required(),
  delivery_score: Joi.number().min(0).max(5).required(),
  service_score: Joi.number().min(0).max(5).required(),
  price_score: Joi.number().min(0).max(5).required(),
  rating_period: Joi.string().max(20).required(),
  remark: Joi.string().max(500).allow('', null)
});

router.post('/rating/add', authenticateToken, checkPermission('supplier:edit'), validate(addRatingSchema), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { supplier_id, quality_score, delivery_score, service_score, price_score, rating_period, remark } = req.body;
    const total_score = Number(((quality_score + delivery_score + service_score + price_score) / 4).toFixed(2));

    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO crm_supplier_rating (supplier_id, quality_score, delivery_score, service_score, price_score, total_score, rating_period, evaluator_id, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplier_id, quality_score, delivery_score, service_score, price_score, total_score, rating_period, req.user.userId, remark || null]
    );

    // 更新供应商聚合评分
    await connection.query(
      'UPDATE crm_supplier SET rating = ? WHERE id = ?',
      [total_score, supplier_id]
    );

    await connection.commit();
    res.json({ code: 200, message: '评分成功', data: { id: result.insertId, total_score } });
  } catch (error) {
    await connection.rollback();
    console.error('[供应商] 添加评分错误:', error.message);
    res.status(500).json({ code: 500, message: '评分失败', data: null });
  } finally {
    connection.release();
  }
});

// 联系人编辑
const updateContactSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(50),
  position: Joi.string().max(200).allow('', null),
  department: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  mobile: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  wechat: Joi.string().max(50).allow('', null),
  role: Joi.string().valid('决策人', '对接人', '财务', '技术', '其他'),
  is_primary: Joi.number().integer().valid(0, 1),
  remark: Joi.string().max(500).allow('', null)
});

router.post('/contact/update', authenticateToken, checkPermission('supplier:edit'), validate(updateContactSchema), async (req, res) => {
  try {
    const { id, ...fields } = req.body;
    const allowed = ['name', 'position', 'department', 'phone', 'mobile', 'email', 'wechat', 'role', 'is_primary', 'remark'];
    const setClauses = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k) && v !== undefined) { setClauses.push(`${k} = ?`); params.push(v); }
    }
    if (setClauses.length === 0) return res.status(400).json({ code: 400, message: '没有要修改的字段', data: null });
    params.push(id);
    await pool.query(`UPDATE crm_supplier_contact SET ${setClauses.join(', ')} WHERE id = ?`, params);
    res.json({ code: 200, message: '修改联系人成功', data: null });
  } catch (error) {
    console.error('[供应商] 更新联系人错误:', error.message);
    res.status(500).json({ code: 500, message: '修改联系人失败', data: null });
  }
});

router.post('/contact/delete', authenticateToken, checkPermission('supplier:edit'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '联系人ID不能为空', data: null });
    const [contacts] = await pool.query('SELECT id FROM crm_supplier_contact WHERE id = ?', [id]);
    if (contacts.length === 0) {
      return res.status(404).json({ code: 404, message: '联系人不存在', data: null });
    }
    await pool.query('UPDATE crm_supplier_contact SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除联系人成功', data: null });
  } catch (error) {
    console.error('[供应商] 删除联系人错误:', error.message);
    res.status(500).json({ code: 500, message: '删除联系人失败', data: null });
  }
});

// 资质增删改
const addQualificationSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  cert_type: Joi.string().max(50).allow('', null),
  cert_no: Joi.string().max(100).allow('', null),
  cert_name: Joi.string().max(200).required(),
  issue_date: Joi.date().iso().allow(null),
  expire_date: Joi.date().iso().allow(null),
  issuing_authority: Joi.string().max(200).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

router.post('/qualification/add', authenticateToken, checkPermission('supplier:edit'), validate(addQualificationSchema), async (req, res) => {
  try {
    const { supplier_id, cert_type, cert_no, cert_name, issue_date, expire_date, issuing_authority, remark } = req.body;
    const status = expire_date
      ? (new Date(expire_date) < new Date() ? 3 : new Date(expire_date) < new Date(Date.now() + 30 * 86400000) ? 2 : 1)
      : 1;
    const [result] = await pool.query(
      `INSERT INTO crm_supplier_qualification (supplier_id, cert_type, cert_no, cert_name, issue_date, expire_date, issuing_authority, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplier_id, cert_type || null, cert_no || null, cert_name, issue_date || null, expire_date || null, issuing_authority || null, status, remark || null]
    );
    res.json({ code: 200, message: '添加资质成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[供应商] 添加资质错误:', error.message);
    res.status(500).json({ code: 500, message: '添加资质失败', data: null });
  }
});

const updateQualificationSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  cert_type: Joi.string().max(50).allow('', null),
  cert_no: Joi.string().max(100).allow('', null),
  cert_name: Joi.string().max(200),
  issue_date: Joi.date().iso().allow(null),
  expire_date: Joi.date().iso().allow(null),
  issuing_authority: Joi.string().max(200).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

router.post('/qualification/update', authenticateToken, checkPermission('supplier:edit'), validate(updateQualificationSchema), async (req, res) => {
  try {
    const { id, ...fields } = req.body;
    const allowed = ['cert_type', 'cert_no', 'cert_name', 'issue_date', 'expire_date', 'issuing_authority', 'remark'];
    const setClauses = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k) && v !== undefined) { setClauses.push(`${k} = ?`); params.push(v); }
    }
    // 重新计算状态
    if (fields.expire_date !== undefined) {
      const exp = fields.expire_date ? new Date(fields.expire_date) : null;
      const s = exp ? (exp < new Date() ? 3 : exp < new Date(Date.now() + 30 * 86400000) ? 2 : 1) : 1;
      setClauses.push('status = ?');
      params.push(s);
    }
    if (setClauses.length === 0) return res.status(400).json({ code: 400, message: '没有要修改的字段', data: null });
    params.push(id);
    await pool.query(`UPDATE crm_supplier_qualification SET ${setClauses.join(', ')} WHERE id = ?`, params);
    res.json({ code: 200, message: '修改资质成功', data: null });
  } catch (error) {
    console.error('[供应商] 更新资质错误:', error.message);
    res.status(500).json({ code: 500, message: '修改资质失败', data: null });
  }
});

router.post('/qualification/delete', authenticateToken, checkPermission('supplier:edit'), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '资质ID不能为空', data: null });
    await pool.query('UPDATE crm_supplier_qualification SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除资质成功', data: null });
  } catch (error) {
    console.error('[供应商] 删除资质错误:', error.message);
    res.status(500).json({ code: 500, message: '删除资质失败', data: null });
  }
});

// 绩效统计
router.get('/performance/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 采购单统计
    const [purchaseStats] = await pool.query(
      `SELECT COUNT(*) as order_count, COALESCE(SUM(total_with_tax), 0) as total_amount
       FROM crm_purchase_order WHERE supplier_id = ? AND deleted_at IS NULL AND status != '已取消'`,
      [id]
    );

    // 质检合格率
    const [qualityStats] = await pool.query(
      `SELECT COUNT(*) as total,
         SUM(CASE WHEN r.quality_result = '合格' THEN 1 ELSE 0 END) as passed
       FROM crm_purchase_receipt r
       JOIN crm_purchase_item i ON r.item_id = i.id
       JOIN crm_purchase_order o ON i.order_id = o.id
       WHERE o.supplier_id = ? AND o.deleted_at IS NULL`,
      [id]
    );

    // 准时交付率
    const [deliveryStats] = await pool.query(
      `SELECT COUNT(*) as total,
         SUM(CASE WHEN actual_date IS NOT NULL AND actual_date <= expected_date THEN 1 ELSE 0 END) as on_time
       FROM crm_purchase_order
       WHERE supplier_id = ? AND deleted_at IS NULL AND status IN ('已完成', '部分收货') AND expected_date IS NOT NULL`,
      [id]
    );

    // 最近评分趋势
    const [ratingTrend] = await pool.query(
      `SELECT rating_period, total_score, quality_score, delivery_score, service_score, price_score
       FROM crm_supplier_rating WHERE supplier_id = ? AND deleted_at IS NULL
       ORDER BY rating_period DESC LIMIT 4`,
      [id]
    );

    const qTotal = qualityStats[0].total || 0;
    const dTotal = deliveryStats[0].total || 0;

    res.json({
      code: 200, message: '查询成功',
      data: {
        order_count: purchaseStats[0].order_count,
        total_amount: purchaseStats[0].total_amount,
        quality_rate: qTotal > 0 ? Math.round((qualityStats[0].passed / qTotal) * 100) : null,
        delivery_rate: dTotal > 0 ? Math.round((deliveryStats[0].on_time / dTotal) * 100) : null,
        rating_trend: ratingTrend.reverse()
      }
    });
  } catch (error) {
    console.error('[供应商] 绩效统计错误:', error.message);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// ============ 供应商评估排行 ============

// 供应商评估排行
router.get('/ranking', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const [rows] = await pool.query(`
      SELECT s.id, s.name, s.contact_person as contact, s.contact_phone as phone, s.type, s.rating,
             r.quality_score, r.delivery_score, r.service_score, r.rating_period, r.total_score
      FROM crm_supplier s
      LEFT JOIN crm_supplier_rating r ON s.id = r.supplier_id
        AND r.id = (SELECT id FROM crm_supplier_rating WHERE supplier_id = s.id ORDER BY create_time DESC LIMIT 1)
      WHERE s.deleted_at IS NULL
      ORDER BY COALESCE(r.total_score, 0) DESC, s.rating DESC
      LIMIT ?
    `, [limit]);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[供应商] 排行查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 供应商对比（雷达图数据）
router.get('/compare', authenticateToken, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ code: 400, message: '请选择供应商', data: null });

    const placeholders = ids.map(() => '?').join(',');
    const [suppliers] = await pool.query(
      `SELECT id, name FROM crm_supplier WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids
    );

    const result = [];
    for (const s of suppliers) {
      const [ratings] = await pool.query(
        'SELECT quality_score, delivery_score, service_score, total_score, rating_period FROM crm_supplier_rating WHERE supplier_id = ? ORDER BY create_time DESC LIMIT 6',
        [s.id]
      );
      result.push({ id: s.id, name: s.name, ratings: ratings.reverse() });
    }

    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('[供应商] 对比查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

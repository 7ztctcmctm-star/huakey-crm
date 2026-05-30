const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { validate, Joi } = require('../../middleware/validate');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../../middleware/permission');
const { getOverdueDays } = require('../../utils/config');

const MODULE_NAME = '客户管理';

// 细化后的客户来源
const VALID_SOURCES = [
  '展会',
  'Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道',
  '转介绍',
  '电话',
  '其他'
];

// 父分组 → 子值展开（搜索时用）
const SOURCE_PARENT_MAP = {
  '网络': ['Facebook', 'Instagram', 'LinkedIn', '独立站', '其他网络渠道']
};

const customerListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().valid(...VALID_SOURCES, ...Object.keys(SOURCE_PARENT_MAP)).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  status: Joi.number().integer().valid(0, 1, 2, 3).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null),
  overdue: Joi.boolean().allow(null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const addCustomerSchema = Joi.object({
  company_name: Joi.string().required().max(200),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').default('C'),
  remark: Joi.string().max(2000).allow('', null)
});

const updateCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  company_name: Joi.string().max(200),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C'),
  status: Joi.number().integer().valid(1, 2, 3),
  remark: Joi.string().max(2000).allow('', null)
});

const deleteCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const { createRouteLogger } = require('../../middleware/logger');
const { logFieldChanges } = require('../../utils/fieldLog');
const logAction = createRouteLogger(MODULE_NAME);

const { getDataPermission, buildPermissionClause } = require('../../utils/permission');

// 检查用户是否有权限编辑指定客户
const canManageCustomer = async (user, customerOwnerId) => {
  if (user.manageAll || user.roleId === 1 || user.roleId === 2) {
    return true;
  }
  return customerOwnerId === user.userId;
};

const router = express.Router();

// 1. 获取客户列表
router.post('/list',
  authenticateToken,
  checkDataPermission('customer', 'owner_id'),
  validate(customerListSchema),
  async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      company_name,
      contact_name,
      phone,
      source,
      level,
      status,
      owner_id,
      start_date,
      end_date,
      overdue,
      sort
    } = req.body;

    const offset = (page - 1) * pageSize;
    const params = [];

    // 使用新的数据权限中间件（参数化查询）
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    params.push(...permParams);

    // 客户列表仅显示正式客户（成交=2、流失=3），线索(1)在独立模块
    let whereClause;
    if (status !== undefined && status !== null && status !== '') {
      whereClause = `WHERE ${permissionWhere} AND c.status = ?`;
      params.push(parseInt(status));
    } else {
      whereClause = `WHERE ${permissionWhere} AND c.status != 0`;
    }

    if (owner_id) {
      whereClause += ' AND c.owner_id = ?';
      params.push(owner_id);
    }
    if (company_name) {
      whereClause += ' AND c.company_name LIKE ?';
      params.push(`%${company_name}%`);
    }
    if (contact_name) {
      whereClause += ' AND c.contact_name LIKE ?';
      params.push(`%${contact_name}%`);
    }
    if (phone) {
      whereClause += ' AND c.phone LIKE ?';
      params.push(`%${phone}%`);
    }
    if (source) {
      if (SOURCE_PARENT_MAP[source]) {
        const children = SOURCE_PARENT_MAP[source];
        whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
        params.push(...children);
      } else {
        whereClause += ' AND c.source = ?';
        params.push(source);
      }
    }
    if (level) {
      whereClause += ' AND c.level = ?';
      params.push(level);
    }
    if (start_date) {
      whereClause += ' AND c.create_time >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND c.create_time < ?';
      params.push(end_date + ' 23:59:59');
    }
    // 逾期跟进筛选：最后跟进时间超过配置天数的客户
    if (overdue === true || overdue === 'true' || overdue === 1) {
      const overdueDays = await getOverdueDays();
      whereClause += ' AND EXTRACT(DAY FROM NOW() - COALESCE(c.last_follow_time, c.create_time)) >= ?';
      params.push(overdueDays);
    }
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 排序
    const SORT_MAP = {
      'create_time_desc': 'c.create_time DESC',
      'last_follow_time_asc': 'c.last_follow_time IS NULL ASC, c.last_follow_time ASC',
      'last_follow_time_desc': 'c.last_follow_time DESC'
    };
    const orderBy = SORT_MAP[sort] || 'c.create_time DESC';

    const [list] = await pool.query(
      `SELECT
        c.id, c.company_name, c.contact_name, c.phone, c.email,
        c.address, c.industry, c.source, c.level,
        c.owner_id, c.status, c.remark, c.create_time, c.update_time,
        c.pool_status, c.protect_until, c.last_follow_time,
        c.lead_level, c.follow_status, c.converted_at,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取客户列表成功',
      data: {
        list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取客户列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取客户列表失败',
      data: null
    });
  }
});

// 2. 添加客户
router.post('/add', authenticateToken, checkPermission('customer:add'), validate(addCustomerSchema), async (req, res) => {
  try {
    const {
      company_name,
      contact_name,
      phone,
      email,
      address,
      industry,
      source,
      level,
      remark
    } = req.body;

    if (!company_name) {
      return res.status(400).json({
        code: 400,
        message: '公司名称不能为空',
        data: null
      });
    }

    if (source && !VALID_SOURCES.includes(source)) {
      return res.status(400).json({
        code: 400,
        message: `无效的客户来源: ${source}`,
        data: null
      });
    }

    // 重复检测
    const [duplicates] = await pool.query(
      'SELECT id, company_name, phone, email FROM crm_customer WHERE company_name = ? AND status != 0 LIMIT 5',
      [company_name]
    );

    const [result] = await pool.query(
      `INSERT INTO crm_customer
        (company_name, contact_name, phone, email, address, industry, source, level, owner_id, status, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      RETURNING id`,
      [
        company_name,
        contact_name || null,
        phone || null,
        email || null,
        address || null,
        industry || null,
        source || null,
        level || 'C',
        req.user.userId,
        remark || null
      ]
    );

    await logAction(req, 'add', `新增客户: ${company_name}`);

    res.json({
      code: 200,
      message: duplicates.length > 0
        ? `添加客户成功（注意：已有 ${duplicates.length} 个同名客户，可能重复）`
        : '添加客户成功',
      data: { id: result.insertId, possibleDuplicates: duplicates.length > 0 ? duplicates : null }
    });
  } catch (error) {
    console.error('添加客户错误:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        code: 409,
        message: '检测到重复客户（相同公司名和电话已存在），请核对后重试',
        data: null
      });
    }
    res.status(500).json({
      code: 500,
      message: '添加客户失败',
      data: null
    });
  }
});

// 3. 修改客户
router.post('/update', authenticateToken, checkPermission('customer:edit'), validate(updateCustomerSchema), async (req, res) => {
  try {
    const { id, ...updateFields } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '客户ID不能为空',
        data: null
      });
    }

    const [customers] = await pool.query(
      'SELECT id, owner_id, company_name, contact_name, phone, email, address, industry, source, level, status, remark FROM crm_customer WHERE id = ? AND status != 0',
      [id]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '客户不存在',
        data: null
      });
    }

    const customer = customers[0];

    // 权限检查：有manageAll权限或客户负责人可修改
    if (!(await canManageCustomer(req.user, customer.owner_id))) {
      return res.status(403).json({
        code: 403,
        message: '无权修改该客户',
        data: null
      });
    }

    // 构建动态更新语句
    const allowedFields = [
      'company_name', 'contact_name', 'phone', 'email', 'address',
      'industry', 'source', 'level', 'status', 'remark'
    ];

    const setClauses = [];
    const params = [];

    for (const [key, value] of Object.entries(updateFields)) {
      if (allowedFields.includes(key) && value !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '没有要修改的字段',
        data: null
      });
    }

    params.push(id);

    // 重复检测：公司名变更时检查是否与已有客户重名
    if (updateFields.company_name && updateFields.company_name !== customer.company_name) {
      const [dups] = await pool.query(
        'SELECT id, company_name FROM crm_customer WHERE company_name = ? AND id != ? AND status != 0 LIMIT 5',
        [updateFields.company_name, id]
      );
      if (dups.length > 0) {
        return res.status(409).json({
          code: 409,
          message: `公司名称"${updateFields.company_name}"已存在（${dups.length} 个同名客户），请确认是否重复`,
          data: { possibleDuplicates: dups }
        });
      }
    }

    await pool.query(
      `UPDATE crm_customer SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    await logAction(req, 'update', `修改客户: ${customer.company_name}`);
    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑',
      oldData: customer,
      newData: updateFields,
      allowedFields,
      description: `修改客户 "${customer.company_name}" 字段变更`
    });

    res.json({
      code: 200,
      message: '修改客户成功',
      data: null
    });
  } catch (error) {
    console.error('修改客户错误:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        code: 409,
        message: '检测到重复客户（相同公司名和电话已存在），请核对后重试',
        data: null
      });
    }
    res.status(500).json({
      code: 500,
      message: '修改客户失败',
      data: null
    });
  }
});

// 4. 删除客户（逻辑删除）
router.post('/delete', authenticateToken, checkPermission('customer:delete'), validate(deleteCustomerSchema), async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '客户ID不能为空',
        data: null
      });
    }

    const [customers] = await pool.query(
      'SELECT id, owner_id FROM crm_customer WHERE id = ? AND status != 0',
      [id]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '客户不存在',
        data: null
      });
    }

    const customer = customers[0];

    // 权限检查
    if (!(await canManageCustomer(req.user, customer.owner_id))) {
      return res.status(403).json({
        code: 403,
        message: '无权删除该客户',
        data: null
      });
    }

    await pool.query(
      'UPDATE crm_customer SET status = 0 WHERE id = ?',
      [id]
    );

    await logAction(req, 'delete', `删除客户: ID=${id}`);

    res.json({
      code: 200,
      message: '删除客户成功',
      data: null
    });
  } catch (error) {
    console.error('删除客户错误:', error);
    res.status(500).json({
      code: 500,
      message: '删除客户失败',
      data: null
    });
  }
});

// 5. 获取客户详情
// [安全修复] 添加 checkDataPermission 中间件，防止越权查看任意客户
router.get('/detail/:id', authenticateToken, checkDataPermission('customer', 'owner_id'), async (req, res) => {
  try {
    const { id } = req.params;

    // 构建数据权限WHERE条件（参数化查询）
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');

    const [customers] = await pool.query(
      `SELECT
        c.id, c.company_name, c.contact_name, c.phone, c.email,
        c.address, c.industry, c.source, c.level,
        c.owner_id, c.status, c.remark, c.create_time, c.update_time,
        c.pool_status, c.protect_until, c.last_follow_time,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      WHERE c.id = ? AND c.status != 0 AND ${permissionWhere}`,
      [id, ...permParams]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '客户不存在',
        data: null
      });
    }

    const customer = customers[0];

    // 获取关联的联系人列表
    const [contacts] = await pool.query(
      `SELECT id, customer_id, name, position, phone, email, wechat, is_decision, remark
      FROM crm_contact
      WHERE customer_id = ? AND deleted_at IS NULL
      ORDER BY is_decision DESC, id ASC`,
      [id]
    );

    // 获取跟进记录列表（仅返回最近50条，避免大量数据导致性能问题）
    const [followRecords] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_by, f.create_time,
        u.real_name as creator_name,
        c.name as contact_name
      FROM crm_follow_up f
      LEFT JOIN sys_user u ON f.create_by = u.id
      LEFT JOIN crm_contact c ON f.contact_id = c.id AND c.deleted_at IS NULL
      WHERE f.customer_id = ? AND f.deleted_at IS NULL
      ORDER BY f.create_time DESC
      LIMIT 50`,
      [id]
    );

    // 获取跟进记录的附件
    if (followRecords.length > 0) {
      const followIds = followRecords.map(f => f.id);
      const placeholders = followIds.map(() => '?').join(',');
      const [attachments] = await pool.query(
        `SELECT id, business_id as follow_up_id, file_name, file_path, file_size, file_type
         FROM crm_attachment WHERE business_type = 'follow_up' AND business_id IN (${placeholders})
         ORDER BY create_time ASC`,
        followIds
      );
      const attMap = {};
      attachments.forEach(a => {
        if (!attMap[a.follow_up_id]) attMap[a.follow_up_id] = [];
        attMap[a.follow_up_id].push(a);
      });
      followRecords.forEach(f => { f.attachments = attMap[f.id] || []; });
    }

    res.json({
      code: 200,
      message: '获取客户详情成功',
      data: {
        customer,
        contacts,
        followRecords
      }
    });
  } catch (error) {
    console.error('获取客户详情错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取客户详情失败',
      data: null
    });
  }
});

const XLSX = require('xlsx');

// 6. 导出客户列表
router.post('/export', authenticateToken, checkPermission('customer:list'), async (req, res) => {
  try {
    const { company_name, contact_name, phone, source, level, status, owner_id, start_date, end_date } = req.body;
    const params = [];

    const permission = await getDataPermission(req.user);
    const { clause: permissionClause, params: permParams } = buildPermissionClause(permission, 'c');
    params.push(...permParams);

    let whereClause;
    if (status !== undefined && status !== null && status !== '') {
      whereClause = `WHERE ${permissionClause} AND c.status = ?`;
      params.push(parseInt(status));
    } else {
      whereClause = `WHERE ${permissionClause} AND c.status != 0`;
    }

    if (owner_id) { whereClause += ' AND c.owner_id = ?'; params.push(owner_id); }
    if (company_name) { whereClause += ' AND c.company_name LIKE ?'; params.push(`%${company_name}%`); }
    if (contact_name) { whereClause += ' AND c.contact_name LIKE ?'; params.push(`%${contact_name}%`); }
    if (phone) { whereClause += ' AND c.phone LIKE ?'; params.push(`%${phone}%`); }
    if (source) {
      if (SOURCE_PARENT_MAP[source]) {
        const children = SOURCE_PARENT_MAP[source];
        whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
        params.push(...children);
      } else {
        whereClause += ' AND c.source = ?';
        params.push(source);
      }
    }
    if (level) { whereClause += ' AND c.level = ?'; params.push(level); }
    if (start_date) { whereClause += ' AND c.create_time >= ?'; params.push(start_date); }
    if (end_date) { whereClause += ' AND c.create_time < ?'; params.push(end_date + ' 23:59:59'); }

    const [list] = await pool.query(
      `SELECT c.company_name, c.contact_name, c.phone, c.email,
        c.address, c.industry, c.source, c.level,
        c.status, c.remark, c.create_time, c.last_follow_time,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      ${whereClause}
      ORDER BY c.create_time DESC
      LIMIT 10000`,
      params
    );

    const statusMap = { 1: '潜在客户', 2: '成交客户', 3: '流失客户' };
    const exportData = list.map(row => ({
      '公司名称': row.company_name,
      '联系人': row.contact_name || '',
      '电话': row.phone || '',
      '邮箱': row.email || '',
      '地址': row.address || '',
      '行业': row.industry || '',
      '来源': row.source || '',
      '等级': row.level || '',
      '状态': statusMap[row.status] || '',
      '负责人': row.owner_name || '',
      '最后跟进': row.last_follow_time ? new Date(row.last_follow_time).toISOString().slice(0, 10) : '',
      '创建时间': row.create_time ? new Date(row.create_time).toISOString().slice(0, 10) : '',
      '备注': row.remark || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, '客户列表');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');
    res.send(buf);

    await logAction(req, 'export', `导出客户 ${list.length} 条`);
  } catch (error) {
    console.error('导出客户错误:', error);
    res.status(500).json({ code: 500, message: '导出客户失败', data: null });
  }
});

module.exports = router;
module.exports.VALID_SOURCES = VALID_SOURCES;
module.exports.SOURCE_PARENT_MAP = SOURCE_PARENT_MAP;
module.exports.canManageCustomer = canManageCustomer;

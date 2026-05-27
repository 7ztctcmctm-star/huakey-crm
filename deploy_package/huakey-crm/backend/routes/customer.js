const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

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

const logAction = async (req, action, description, status = 1, errorMsg = null) => {
  try {
    const userId = req.user?.userId || req.user?.id || null;
    const userName = req.user?.real_name || req.user?.username || null;
    const ipAddress = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '0.0.0.0';

    const params = JSON.stringify(req.method === 'GET' ? req.query : req.body);
    const paramsTruncated = params.length > 2000 ? params.substring(0, 2000) + '...[truncated]' : params;

    await pool.query(
      `INSERT INTO sys_log (module, action, method, url, params, ip_address, user_id, user_name, description, status, error_msg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [MODULE_NAME, action, req.method, req.originalUrl, paramsTruncated, ipAddress, userId, userName, description, status, errorMsg]
    );
  } catch (err) {
    console.error('记录操作日志失败:', err);
  }
};

const router = express.Router();

// 数据权限辅助函数
// 查看权限：所有登录用户均可查看全部客户（共享客户池）
// 编辑权限：只有客户负责人或管理员/老板可编辑
const getDataPermission = async (user) => {
  // 所有用户都可以看到全部客户
  return { type: 'all' };
};

// 检查用户是否有权限编辑指定客户
const canManageCustomer = async (user, customerOwnerId) => {
  if (user.manageAll || user.roleId === 1 || user.roleId === 2) {
    return true;
  }
  return customerOwnerId === user.userId;
};

const buildPermissionClause = (permission, tableAlias = 'c') => {
  if (permission.type === 'all') {
    return '1=1';
  }
  if (permission.type === 'dept') {
    return `${tableAlias}.owner_id IN (${permission.userIds.join(',')})`;
  }
  return `${tableAlias}.owner_id = ${permission.userId}`;
};

// 1. 获取客户列表
router.post('/list', authenticateToken, async (req, res) => {
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
      owner_id
    } = req.body;

    const offset = (page - 1) * pageSize;
    const params = [];

    const permission = await getDataPermission(req.user);
    const permissionClause = buildPermissionClause(permission);

    // 客户列表仅显示正式客户（成交=2、流失=3），线索(1)在独立模块
    if (status !== undefined && status !== null && status !== '') {
      whereClause = `WHERE ${permissionClause} AND c.status = ?`;
      params.push(parseInt(status));
    } else {
      whereClause = `WHERE ${permissionClause} AND c.status IN (2, 3)`;
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
    if (status !== undefined && status !== null && status !== '') {
      whereClause += ' AND c.status = ?';
      params.push(parseInt(status));
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

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
      ORDER BY c.create_time DESC
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
router.post('/add', authenticateToken, async (req, res) => {
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

    const [result] = await pool.query(
      `INSERT INTO crm_customer
        (company_name, contact_name, phone, email, address, industry, source, level, owner_id, status, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
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
      message: '添加客户成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('添加客户错误:', error);
    res.status(500).json({
      code: 500,
      message: '添加客户失败',
      data: null
    });
  }
});

// 3. 修改客户
router.post('/update', authenticateToken, async (req, res) => {
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
      'SELECT * FROM crm_customer WHERE id = ? AND status != 0',
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

    await pool.query(
      `UPDATE crm_customer SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    await logAction(req, 'update', `修改客户: ID=${id}`);

    res.json({
      code: 200,
      message: '修改客户成功',
      data: null
    });
  } catch (error) {
    console.error('修改客户错误:', error);
    res.status(500).json({
      code: 500,
      message: '修改客户失败',
      data: null
    });
  }
});

// 4. 删除客户（逻辑删除）
router.post('/delete', authenticateToken, async (req, res) => {
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
      'SELECT * FROM crm_customer WHERE id = ? AND status != 0',
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
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [customers] = await pool.query(
      `SELECT
        c.id, c.company_name, c.contact_name, c.phone, c.email,
        c.address, c.industry, c.source, c.level,
        c.owner_id, c.status, c.remark, c.create_time, c.update_time,
        c.pool_status, c.protect_until, c.last_follow_time,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      WHERE c.id = ? AND c.status != 0`,
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

    // 获取关联的联系人列表
    const [contacts] = await pool.query(
      `SELECT id, customer_id, name, position, phone, email, wechat, is_decision, remark
      FROM crm_contact
      WHERE customer_id = ?
      ORDER BY is_decision DESC, id ASC`,
      [id]
    );

    // 获取跟进记录列表
    const [followRecords] = await pool.query(
      `SELECT f.id, f.customer_id, f.contact_id, f.follow_type, f.content,
        f.next_time, f.next_content, f.create_by, f.create_time,
        u.real_name as creator_name,
        c.name as contact_name
      FROM crm_follow_up f
      LEFT JOIN sys_user u ON f.create_by = u.id
      LEFT JOIN crm_contact c ON f.contact_id = c.id
      WHERE f.customer_id = ?
      ORDER BY f.create_time DESC`,
      [id]
    );

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

// ============ 联系人接口 ============

// 6. 添加联系人
router.post('/contact/add', authenticateToken, async (req, res) => {
  try {
    const { customer_id, name, position, phone, email, wechat, is_decision, remark } = req.body;

    if (!customer_id || !name) {
      return res.status(400).json({
        code: 400,
        message: '客户ID和联系人姓名不能为空',
        data: null
      });
    }

    const [customers] = await pool.query(
      'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '客户不存在',
        data: null
      });
    }

    const [result] = await pool.query(
      `INSERT INTO crm_contact (customer_id, name, position, phone, email, wechat, is_decision, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, name, position || null, phone || null, email || null, wechat || null, is_decision || 0, remark || null]
    );

    res.json({
      code: 200,
      message: '添加联系人成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('添加联系人错误:', error);
    res.status(500).json({
      code: 500,
      message: '添加联系人失败',
      data: null
    });
  }
});

// 7. 修改联系人
router.post('/contact/update', authenticateToken, async (req, res) => {
  try {
    const { id, name, position, phone, email, wechat, is_decision, remark } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '联系人ID不能为空',
        data: null
      });
    }

    await pool.query(
      `UPDATE crm_contact SET name = ?, position = ?, phone = ?, email = ?, wechat = ?, is_decision = ?, remark = ?
      WHERE id = ?`,
      [name, position || null, phone || null, email || null, wechat || null, is_decision || 0, remark || null, id]
    );

    res.json({
      code: 200,
      message: '修改联系人成功',
      data: null
    });
  } catch (error) {
    console.error('修改联系人错误:', error);
    res.status(500).json({
      code: 500,
      message: '修改联系人失败',
      data: null
    });
  }
});

// 8. 删除联系人
router.post('/contact/delete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '联系人ID不能为空',
        data: null
      });
    }

    await pool.query('DELETE FROM crm_contact WHERE id = ?', [id]);

    res.json({
      code: 200,
      message: '删除联系人成功',
      data: null
    });
  } catch (error) {
    console.error('删除联系人错误:', error);
    res.status(500).json({
      code: 500,
      message: '删除联系人失败',
      data: null
    });
  }
});

// ============ 客户公海接口 ============

// 9. 公海客户列表
router.post('/pool', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, company_name, industry, source, level } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    // 公海准入：必须是已转化客户(status=2)，且负责人被置空
    let whereClause = 'WHERE c.pool_status = 1 AND c.status = 2 AND c.status != 0';

    if (company_name) {
      whereClause += ' AND c.company_name LIKE ?';
      params.push(`%${company_name}%`);
    }
    if (industry) {
      whereClause += ' AND c.industry = ?';
      params.push(industry);
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

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT c.id, c.company_name, c.contact_name, c.phone, c.email,
        c.industry, c.source, c.level, c.status,
        c.pool_status, c.protect_until, c.last_follow_time,
        c.create_time, c.update_time,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      ${whereClause}
      ORDER BY c.protect_until IS NULL ASC, c.protect_until ASC, c.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取公海客户列表成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取公海客户列表错误:', error);
    res.status(500).json({ code: 500, message: '获取公海客户列表失败', data: null });
  }
});

// 10. 认领公海客户
router.post('/claim', authenticateToken, async (req, res) => {
  try {
    const { customer_id } = req.body;
    const userId = req.user.userId;

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    const [customers] = await pool.query(
      'SELECT * FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const customer = customers[0];

    // 检查是否在公海
    if (customer.pool_status !== 1) {
      return res.status(400).json({ code: 400, message: '该客户不在公海中', data: null });
    }

    // 检查保护期
    if (customer.protect_until && new Date(customer.protect_until) > new Date()) {
      const remainDays = Math.ceil((new Date(customer.protect_until) - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({
        code: 400,
        message: `该客户在保护期内，还需等待 ${remainDays} 天`,
        data: { protect_until: customer.protect_until }
      });
    }

    // 认领客户
    const protectUntil = new Date();
    protectUntil.setDate(protectUntil.getDate() + 7);

    await pool.query(
      'UPDATE crm_customer SET pool_status = 0, owner_id = ?, protect_until = ?, last_follow_time = NOW() WHERE id = ?',
      [userId, protectUntil, customer_id]
    );

    // 记录操作日志
    await pool.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
       VALUES (?, 'claim', ?, ?)`,
      [customer_id, customer.owner_id, userId]
    );

    await logAction(req, 'claim', `认领客户: ${customer.company_name}`);

    res.json({ code: 200, message: '认领客户成功', data: { protect_until: protectUntil } });
  } catch (error) {
    console.error('认领客户错误:', error);
    res.status(500).json({ code: 500, message: '认领客户失败', data: null });
  }
});

// 11. 释放客户到公海
router.post('/release', authenticateToken, async (req, res) => {
  try {
    const { customer_id } = req.body;
    const userId = req.user.userId;

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    const [customers] = await pool.query(
      'SELECT * FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const customer = customers[0];

    // 权限检查：只能释放自己的客户（管理员/经理除外）
    if (req.user.roleId !== 1 && req.user.roleId !== 2 && req.user.roleId !== 3) {
      if (customer.owner_id !== userId) {
        return res.status(403).json({ code: 403, message: '无权释放该客户', data: null });
      }
    }

    // 释放到公海
    await pool.query(
      'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
      [customer_id]
    );

    // 记录操作日志
    await pool.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
       VALUES (?, 'release', ?, NULL)`,
      [customer_id, userId]
    );

    await logAction(req, 'release', `释放客户到公海: ${customer.company_name}`);

    res.json({ code: 200, message: '释放客户成功', data: null });
  } catch (error) {
    console.error('释放客户错误:', error);
    res.status(500).json({ code: 500, message: '释放客户失败', data: null });
  }
});

// 12. 批量释放客户到公海
router.post('/batch-release', authenticateToken, async (req, res) => {
  try {
    const { customer_ids } = req.body;
    const userId = req.user.userId;

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要释放的客户', data: null });
    }

    let successCount = 0;
    for (const customerId of customer_ids) {
      const [customers] = await pool.query(
        'SELECT * FROM crm_customer WHERE id = ? AND status != 0',
        [customerId]
      );

      if (customers.length === 0) continue;
      const customer = customers[0];

      // 权限检查
      if (req.user.roleId !== 1 && req.user.roleId !== 2 && req.user.roleId !== 3) {
        if (customer.owner_id !== userId) continue;
      }

      if (customer.pool_status === 1) continue; // 已经在公海

      await pool.query(
        'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
        [customerId]
      );

      await pool.query(
        `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
         VALUES (?, 'release', ?, NULL)`,
        [customerId, userId]
      );

      successCount++;
    }

    await logAction(req, 'batch-release', `批量释放 ${successCount} 个客户到公海`);

    res.json({ code: 200, message: `成功释放 ${successCount} 个客户`, data: { count: successCount } });
  } catch (error) {
    console.error('批量释放错误:', error);
    res.status(500).json({ code: 500, message: '批量释放失败', data: null });
  }
});

// ============ 客户分配接口 ============

// 13. 分配客户负责人（单个）
router.post('/assign', authenticateToken, async (req, res) => {
  try {
    const { customer_id, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    if (!customer_id || !to_user_id) {
      return res.status(400).json({ code: 400, message: '客户ID和新负责人ID不能为空', data: null });
    }

    // 权限检查：只有 manageAll 或管理员可分配
    if (!(req.user.manageAll || req.user.roleId === 1 || req.user.roleId === 2)) {
      return res.status(403).json({ code: 403, message: '无权分配客户负责人', data: null });
    }

    const [customers] = await pool.query(
      'SELECT * FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const customer = customers[0];
    const fromUserId = customer.owner_id;

    // 更新负责人
    await pool.query(
      'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
      [to_user_id, customer_id]
    );

    // 记录分配日志
    await pool.query(
      `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
       VALUES (?, ?, ?, ?, ?)`,
      [customer_id, fromUserId, to_user_id, userId, remark || null]
    );

    await logAction(req, 'assign', `分配客户: ${customer.company_name} → 用户ID ${to_user_id}`);

    res.json({ code: 200, message: '分配成功', data: null });
  } catch (error) {
    console.error('分配客户错误:', error);
    res.status(500).json({ code: 500, message: '分配失败', data: null });
  }
});

// 14. 批量分配客户负责人
router.post('/batch-assign', authenticateToken, async (req, res) => {
  try {
    const { customer_ids, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要分配的客户', data: null });
    }
    if (!to_user_id) {
      return res.status(400).json({ code: 400, message: '请选择新负责人', data: null });
    }

    if (!(req.user.manageAll || req.user.roleId === 1 || req.user.roleId === 2)) {
      return res.status(403).json({ code: 403, message: '无权批量分配客户', data: null });
    }

    let successCount = 0;
    for (const customerId of customer_ids) {
      const [customers] = await pool.query(
        'SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND status != 0',
        [customerId]
      );

      if (customers.length === 0) continue;
      const customer = customers[0];

      await pool.query(
        'UPDATE crm_customer SET owner_id = ?, pool_status = 0, protect_until = NULL WHERE id = ?',
        [to_user_id, customerId]
      );

      await pool.query(
        `INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark)
         VALUES (?, ?, ?, ?, ?)`,
        [customerId, customer.owner_id, to_user_id, userId, remark || null]
      );

      successCount++;
    }

    await logAction(req, 'batch-assign', `批量分配 ${successCount} 个客户 → 用户ID ${to_user_id}`);

    res.json({ code: 200, message: `成功分配 ${successCount} 个客户`, data: { count: successCount } });
  } catch (error) {
    console.error('批量分配错误:', error);
    res.status(500).json({ code: 500, message: '批量分配失败', data: null });
  }
});

// 15. 查询分配日志
router.post('/assign-log', authenticateToken, async (req, res) => {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    let whereClause = '1=1';
    if (customer_id) {
      whereClause += ' AND al.customer_id = ?';
      params.push(customer_id);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_assign_log al WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT al.*,
        c.company_name,
        u1.real_name as from_user_name,
        u2.real_name as to_user_name,
        u3.real_name as operator_name
      FROM crm_assign_log al
      LEFT JOIN crm_customer c ON al.customer_id = c.id
      LEFT JOIN sys_user u1 ON al.from_user_id = u1.id
      LEFT JOIN sys_user u2 ON al.to_user_id = u2.id
      LEFT JOIN sys_user u3 ON al.operator_id = u3.id
      WHERE ${whereClause}
      ORDER BY al.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('查询分配日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 16. 获取销售用户列表（供分配下拉选择）
router.get('/sales-users', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.real_name, u.username, d.name as dept_name
       FROM sys_user u
       LEFT JOIN sys_dept d ON u.dept_id = d.id
       LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.status = 1 AND r.code IN ('sales_manager', 'sales', 'tech')
       ORDER BY d.name, u.real_name`
    );
    res.json({ code: 200, message: '查询成功', data: users });
  } catch (error) {
    console.error('获取销售用户列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 17. 获取行业列表
router.get('/industries/list', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT industry FROM crm_customer WHERE industry IS NOT NULL AND industry != \"\" AND status != 0 ORDER BY industry'
    );
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.industry) });
  } catch (error) {
    console.error('获取行业列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 14. 获取公海操作日志
router.post('/pool-log', authenticateToken, async (req, res) => {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    let whereClause = '1=1';
    if (customer_id) {
      whereClause += ' AND pl.customer_id = ?';
      params.push(customer_id);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_pool_log pl WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT pl.*,
        cu.real_name as from_user_name,
        cu2.real_name as to_user_name,
        c.company_name
      FROM crm_pool_log pl
      LEFT JOIN crm_customer c ON pl.customer_id = c.id
      LEFT JOIN sys_user cu ON pl.from_user_id = cu.id
      LEFT JOIN sys_user cu2 ON pl.to_user_id = cu2.id
      WHERE ${whereClause}
      ORDER BY pl.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '查询成功',
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('查询公海日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 15. Excel导入预览
router.post('/import-preview', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ code: 400, message: 'Excel文件为空', data: null });
    }

    const headers = Object.keys(rows[0]);
    const mapped = [];
    const unmapped = [];
    for (const h of headers) {
      if (FIELD_MAP[h]) mapped.push({ excel: h, field: FIELD_MAP[h] });
      else if (h.trim()) unmapped.push(h);
    }

    const preview = rows.map((row, i) => {
      const item = { _row: i + 2 };
      for (const h of headers) {
        if (FIELD_MAP[h]) item[FIELD_MAP[h]] = String(row[h] || '').trim();
      }
      // 没有映射的列拼接进remark
      const extras = [];
      for (const h of headers) {
        if (!FIELD_MAP[h] && String(row[h] || '').trim()) {
          extras.push(h + ': ' + String(row[h]).trim());
        }
      }
      if (extras.length > 0) {
        item.remark = (item.remark ? item.remark + '; ' : '') + extras.join('; ');
      }
      return item;
    });

    // 清理上传文件
    fs.unlinkSync(req.file.path);

    res.json({
      code: 200,
      message: '预览成功',
      data: {
        total: preview.length,
        mapped_fields: mapped,
        unmapped_fields: unmapped,
        preview: preview.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('导入预览错误:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ code: 500, message: '预览失败: ' + error.message, data: null });
  }
});

// 16. Excel导入确认
router.post('/import-confirm', authenticateToken, upload.single('file'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const headers = Object.keys(rows[0]);
    let success = 0, fail = 0;
    const errors = [];

    await connection.beginTransaction();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const data = {
          company_name: '',
          contact_name: null, phone: null, email: null, address: null,
          industry: null, source: null, level: 'C', status: 1, remark: null
        };

        const extras = [];
        for (const h of headers) {
          const val = String(row[h] || '').trim();
          if (!val) continue;
          if (FIELD_MAP[h]) {
            data[FIELD_MAP[h]] = val;
          } else {
            extras.push(h + ': ' + val);
          }
        }

        if (!data.company_name) {
          fail++; errors.push(`第${i+2}行: 公司名称不能为空`);
          continue;
        }

        if (extras.length > 0) {
          data.remark = (data.remark ? data.remark + '; ' : '') + extras.join('; ');
        }

        // 状态映射
        const statusMap = { '潜在客户': 1, '成交客户': 2, '流失客户': 3, '未合作': 1, '已合作': 2 };
        if (data.status && isNaN(data.status)) {
          data.status = statusMap[data.status] || 1;
        }

        // 截断过长字段
        const truncate = (val, max) => val && val.length > max ? val.substring(0, max) : val;

        await connection.query(
          `INSERT INTO crm_customer (company_name, contact_name, phone, email, address, industry, source, level, status, remark, owner_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [truncate(data.company_name, 200), truncate(data.contact_name, 50), truncate(data.phone, 20),
           truncate(data.email, 100), truncate(data.address, 500), truncate(data.industry, 50),
           truncate(data.source, 50), truncate(data.level, 20), parseInt(data.status) || 1,
           data.remark ? data.remark.substring(0, 2000) : null, req.user.userId]
        );

        success++;
      } catch (e) {
        fail++;
        errors.push(`第${i+2}行: ${e.message}`);
      }
    }

    await connection.commit();

    // 记录日志
    await logAction(req, 'import', `批量导入客户: 成功${success}条, 失败${fail}条`);

    // 清理文件
    fs.unlinkSync(req.file.path);

    res.json({
      code: 200,
      message: `导入完成: 成功 ${success} 条, 失败 ${fail} 条`,
      data: { success, fail, errors: errors.slice(0, 10) }
    });
  } catch (error) {
    await connection.rollback();
    console.error('导入错误:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ code: 500, message: '导入失败: ' + error.message, data: null });
  } finally {
    connection.release();
  }
});

// ============ 线索管理接口 ============

// 18. 线索列表
router.post('/leads/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, company_name, contact_name, phone, source, lead_level, follow_status } = req.body;
    const offset = (page - 1) * pageSize;
    const params = [];

    const permission = await getDataPermission(req.user);
    const permissionClause = buildPermissionClause(permission);

    // 线索池准入：status=1 且 负责人为空或为管理员
    let whereClause = `WHERE ${permissionClause} AND c.status = 1 AND (c.owner_id IS NULL OR c.owner_id = 1)`;

    if (company_name) { whereClause += ' AND c.company_name LIKE ?'; params.push(`%${company_name}%`); }
    if (contact_name) { whereClause += ' AND c.contact_name LIKE ?'; params.push(`%${contact_name}%`); }
    if (phone) { whereClause += ' AND c.phone LIKE ?'; params.push(`%${phone}%`); }
    if (source) {
      if (SOURCE_PARENT_MAP[source]) {
        const children = SOURCE_PARENT_MAP[source];
        whereClause += ` AND c.source IN (${children.map(() => '?').join(',')})`;
        params.push(...children);
      } else {
        whereClause += ' AND c.source = ?'; params.push(source);
      }
    }
    if (lead_level) { whereClause += ' AND c.lead_level = ?'; params.push(lead_level); }
    if (follow_status) { whereClause += ' AND c.follow_status = ?'; params.push(follow_status); }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_customer c ${whereClause}`, params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT c.id, c.company_name, c.contact_name, c.phone, c.source, c.level,
        c.lead_level, c.follow_status, c.owner_id, c.status,
        c.last_follow_time, c.create_time,
        u.real_name as owner_name
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      ${whereClause}
      ORDER BY c.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({ code: 200, message: '获取线索列表成功', data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('获取线索列表错误:', error);
    res.status(500).json({ code: 500, message: '获取线索列表失败', data: null });
  }
});

// 19. 线索转化：将线索转为正式客户
router.post('/leads/convert', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '线索ID不能为空', data: null });

    const [rows] = await pool.query('SELECT * FROM crm_customer WHERE id = ? AND status = 1', [id]);
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '线索不存在或已转化', data: null });

    const lead = rows[0];
    await pool.query(
      'UPDATE crm_customer SET status = 2, converted_at = NOW(), lead_level = NULL WHERE id = ?',
      [id]
    );

    await logAction(req, 'convert', `线索转化: ${lead.company_name} → 正式客户`);

    res.json({ code: 200, message: '转化成功', data: { id, company_name: lead.company_name } });
  } catch (error) {
    console.error('线索转化错误:', error);
    res.status(500).json({ code: 500, message: '转化失败', data: null });
  }
});

// 20. 销售领取线索
router.post('/leads/claim', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '线索ID不能为空', data: null });

    const [rows] = await pool.query(
      'SELECT * FROM crm_customer WHERE id = ? AND status = 1 AND (owner_id IS NULL OR owner_id = 1)',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '线索不存在或已被领取', data: null });

    await pool.query(
      'UPDATE crm_customer SET owner_id = ?, follow_status = ? WHERE id = ?',
      [req.user.userId, '初次联系', id]
    );

    await logAction(req, 'claim-lead', `领取线索: ${rows[0].company_name}`);

    res.json({ code: 200, message: '领取成功，该线索已归您跟进', data: { id, company_name: rows[0].company_name } });
  } catch (error) {
    console.error('领取线索错误:', error);
    res.status(500).json({ code: 500, message: '领取失败', data: null });
  }
});

// 21. 销售标记线索为已流失
router.post('/leads/mark-lost', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '线索ID不能为空', data: null });

    const [rows] = await pool.query(
      'SELECT * FROM crm_customer WHERE id = ? AND status = 1 AND owner_id = ?',
      [id, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '线索不存在或无权操作', data: null });

    await pool.query(
      'UPDATE crm_customer SET follow_status = ? WHERE id = ?',
      ['已流失', id]
    );

    res.json({ code: 200, message: '已标记为流失', data: { id } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 22. 线索统计
router.get('/leads/stats', authenticateToken, async (req, res) => {
  try {
    const permission = await getDataPermission(req.user);
    const permissionClause = buildPermissionClause(permission);

    const [total] = await pool.query(`SELECT COUNT(*) as cnt FROM crm_customer WHERE ${permissionClause} AND status = 1`);
    const [month] = await pool.query(
      `SELECT COUNT(*) as cnt FROM crm_customer WHERE ${permissionClause} AND status = 1 AND YEARWEEK(create_time,1) = YEARWEEK(NOW(),1)`
    );
    const [converted] = await pool.query(
      `SELECT COUNT(*) as cnt FROM crm_customer WHERE ${permissionClause} AND status = 2 AND converted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    res.json({ code: 200, message: '查询成功', data: {
      total: total[0].cnt,
      week_new: month[0].cnt,
      month_converted: converted[0].cnt
    }});
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
const ROLES = require('../config/roles');

// 构建售后工单数据权限SQL（涉及create_by和assignee_id两个字段）
const buildServicePermissionClause = async (dataPermission, tableAlias = 'so') => {
  if (!dataPermission) return '1=1';
  const { type, userId } = dataPermission;
  if (type === 'all') {
    return '1=1';
  }
  if (type === 'dept' || type === 'dept_and_sub') {
    // 查询用户所在部门的所有用户ID
    const [deptRows] = await pool.query('SELECT dept_id FROM sys_user WHERE id = ?', [userId]);
    const deptId = deptRows[0]?.dept_id;
    if (deptId) {
      const [deptUsers] = await pool.query('SELECT id FROM sys_user WHERE dept_id = ?', [deptId]);
      const ids = deptUsers.map(u => u.id);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        return `(${tableAlias}.create_by IN (${placeholders}) OR ${tableAlias}.assignee_id IN (${placeholders}))`;
      }
    }
    return `(${tableAlias}.create_by = ? OR ${tableAlias}.assignee_id = ?)`;
  }
  return `(${tableAlias}.create_by = ${pool.escape(userId)} OR ${tableAlias}.assignee_id = ${pool.escape(userId)})`;
};

// 检查用户是否有权操作某工单
const canManageService = async (user, serviceOrder) => {
  if (user.manageAll || user.roleId === ROLES.ADMIN || user.roleId === ROLES.MANAGER) {
    return true;
  }
  if (user.roleId === ROLES.SALES) {
    const [users] = await pool.query(
      'SELECT dept_id FROM sys_user WHERE id = ?',
      [user.userId]
    );
    const deptId = users.length > 0 ? users[0].dept_id : null;
    if (deptId) {
      const [createByUser] = await pool.query(
        'SELECT dept_id FROM sys_user WHERE id = ?',
        [serviceOrder.create_by]
      );
      const [assigneeUser] = serviceOrder.assignee_id ? await pool.query(
        'SELECT dept_id FROM sys_user WHERE id = ?',
        [serviceOrder.assignee_id]
      ) : [[]];
      if (
        (createByUser.length > 0 && createByUser[0].dept_id === deptId) ||
        (assigneeUser.length > 0 && assigneeUser[0].dept_id === deptId)
      ) {
        return true;
      }
    }
  }
  return serviceOrder.create_by === user.userId || serviceOrder.assignee_id === user.userId;
};

// 获取工单列表
router.post('/list', authenticateToken, checkPermission('service'), checkDataPermission('service', 'create_by'), async (req, res) => {
  const { page = 1, pageSize = 10, status, type, priority, keyword, assignee_id, created_today, is_timeout } = req.body;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  try {
    const permissionClause = await buildServicePermissionClause(req.dataPermission);

    let sql = `
      SELECT so.*, cu.company_name as customer_name, cu.contact_name as customer_contact,
             cu.phone as customer_phone, c.contract_no,
             u1.real_name as assignee_name, u2.real_name as create_by_name,
             CASE WHEN so.status IN (1, 2) AND so.priority = 1 AND NOW() - INTERVAL 2 HOUR > so.create_time THEN 1
                  WHEN so.status IN (1, 2) AND so.priority = 2 AND NOW() - INTERVAL 4 HOUR > so.create_time THEN 1
                  ELSE 0 END as is_timeout
      FROM crm_service_order so
      LEFT JOIN crm_customer cu ON so.customer_id = cu.id
      LEFT JOIN crm_contract c ON so.contract_id = c.id
      LEFT JOIN sys_user u1 ON so.assignee_id = u1.id
      LEFT JOIN sys_user u2 ON so.create_by = u2.id
      WHERE ${permissionClause} AND so.deleted_at IS NULL
    `;

    const params = [];

    if (status !== undefined && status !== '') {
      sql += ' AND so.status = ?';
      params.push(status);
    }

    if (type !== undefined && type !== '') {
      sql += ' AND so.type = ?';
      params.push(type);
    }

    if (priority !== undefined && priority !== '') {
      sql += ' AND so.priority = ?';
      params.push(priority);
    }

    if (keyword) {
      sql += ' AND (so.title LIKE ? OR so.order_no LIKE ? OR cu.company_name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 按处理人筛选（"我的工单"视图）
    if (assignee_id) {
      sql += ' AND so.assignee_id = ?';
      params.push(assignee_id);
    }

    // 今日工单筛选
    if (created_today) {
      sql += ' AND DATE(so.create_time) = CURRENT_DATE';
    }

    // 超时工单筛选：紧急超2小时、高优超4小时，状态为待分配或已分配
    if (is_timeout) {
      sql += ` AND so.status IN (1, 2) AND (
        (so.priority = 1 AND so.create_time < NOW() - INTERVAL 2 HOUR)
        OR (so.priority = 2 AND so.create_time < NOW() - INTERVAL 4 HOUR)
      )`;
    }

    sql += ' ORDER BY so.create_time DESC LIMIT ?, ?';
    params.push(offset, safePageSize);
    const [rows] = await pool.query(sql, params);
    
    const countSql = sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*/, '');
    const [countResult] = await pool.query(countSql, params.slice(0, -2));
    
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: countResult[0].total } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取工单详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [rows] = await pool.query(`
      SELECT so.*, cu.company_name as customer_name, cu.contact_name as customer_contact, 
             cu.phone as customer_phone, cu.address as customer_address,
             c.contract_no, c.amount as contract_amount,
             u1.real_name as assignee_name, u2.real_name as create_by_name
      FROM crm_service_order so
      LEFT JOIN crm_customer cu ON so.customer_id = cu.id
      LEFT JOIN crm_contract c ON so.contract_id = c.id
      LEFT JOIN sys_user u1 ON so.assignee_id = u1.id
      LEFT JOIN sys_user u2 ON so.create_by = u2.id
      WHERE so.id = ? AND so.deleted_at IS NULL
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }

    // 权限检查
    if (!(await canManageService(req.user, rows[0]))) {
      return res.status(403).json({ code: 403, message: '无权查看该工单', data: null });
    }

    // 查询附件
    const [attachments] = await pool.query(
      'SELECT id, file_name, file_path, file_size, file_type, create_time FROM crm_attachment WHERE business_type = ? AND business_id = ? ORDER BY create_time DESC',
      ['service_order', id]
    );

    // 查询社媒沟通记录
    const [socialRecords] = await pool.query(
      `SELECT sc.*, ct.name as contact_name
       FROM crm_social_contact sc
       LEFT JOIN crm_contact ct ON sc.contact_id = ct.id
       WHERE sc.customer_id = ?
       ORDER BY sc.message_time DESC LIMIT 20`, [rows[0].customer_id]
    );

    res.json({ code: 200, message: '查询成功', data: { ...rows[0], attachments, social_records: socialRecords || [] } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 创建工单
router.post('/add', authenticateToken, checkPermission('service:add'), async (req, res) => {
  const { customer_id, contract_id, type, title, description, priority } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 校验客户必须是正式客户（status=2）
    const [customerCheck] = await connection.query(
      'SELECT id, status FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );
    if (customerCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }
    if (customerCheck[0].status !== 2) {
      await connection.rollback();
      return res.status(400).json({ code: 400, message: '只能为正式客户创建售后工单', data: null });
    }

    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query('SELECT COUNT(*) as cnt FROM crm_service_order WHERE order_no LIKE ? FOR UPDATE', [`SRV-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const orderNo = `SRV-${dateStr}-${seq}`;

    const [result] = await connection.query(
      'INSERT INTO crm_service_order (order_no, customer_id, contract_id, type, title, description, priority, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orderNo, customer_id, contract_id || null, type, title, description, priority || 3, req.user.userId]
    );

    // 绑定附件
    const { attachment_ids } = req.body;
    if (attachment_ids && attachment_ids.length > 0) {
      await connection.query(
        `UPDATE crm_attachment SET business_type = 'service_order', business_id = ? WHERE id IN (${attachment_ids.map(() => '?').join(',')})`,
        [result.insertId, ...attachment_ids]
      );
    }

    await connection.commit();

    res.json({ code: 200, message: '创建工单成功', data: { id: result.insertId, order_no: orderNo } });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ code: 500, message: '创建工单失败', data: null });
  } finally {
    connection.release();
  }
});

// 更新工单
router.post('/update', authenticateToken, checkPermission('service:edit'), async (req, res) => {
  const { id, customer_id, contract_id, type, title, description, priority } = req.body;

  try {
    // 查询工单并校验权限
    const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    if (!(await canManageService(req.user, orders[0]))) {
      return res.status(403).json({ code: 403, message: '无权修改该工单', data: null });
    }

    await pool.query(
      'UPDATE crm_service_order SET customer_id = ?, contract_id = ?, type = ?, title = ?, description = ?, priority = ? WHERE id = ?',
      [customer_id, contract_id || null, type, title, description, priority || 3, id]
    );

    // 绑定附件
    const { attachment_ids } = req.body;
    if (attachment_ids && attachment_ids.length > 0) {
      await pool.query(
        `UPDATE crm_attachment SET business_type = 'service_order', business_id = ? WHERE id IN (${attachment_ids.map(() => '?').join(',')})`,
        [id, ...attachment_ids]
      );
    }

    res.json({ code: 200, message: '修改工单成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '修改工单失败', data: null });
  }
});

// 删除工单
router.post('/delete', authenticateToken, checkPermission('service:delete'), async (req, res) => {
  const { id } = req.body;

  try {
    // 查询工单并校验权限
    const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    if (!(await canManageService(req.user, orders[0]))) {
      return res.status(403).json({ code: 403, message: '无权删除该工单', data: null });
    }

    await pool.query('UPDATE crm_service_order SET deleted_at = NOW() WHERE id = ?', [id]);

    res.json({ code: 200, message: '删除工单成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '删除工单失败', data: null });
  }
});

// 分配工程师
router.post('/assign', authenticateToken, checkPermission('service:edit'), async (req, res) => {
  const { id, assignee_id } = req.body;

  try {
    const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    if (!(await canManageService(req.user, orders[0]))) {
      return res.status(403).json({ code: 403, message: '无权操作该工单', data: null });
    }

    await pool.query(
      'UPDATE crm_service_order SET status = 2, assignee_id = ? WHERE id = ?',
      [assignee_id, id]
    );

    // 写入新工单通知
    const [assigneeInfo] = await pool.query('SELECT real_name FROM sys_user WHERE id = ?', [assignee_id]);
    const [orderInfo] = await pool.query('SELECT order_no, title FROM crm_service_order WHERE id = ?', [id]);
    await pool.query(
      `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_user_id)
       VALUES ('service_assigned', '新工单分配', ?, 'service_order', ?, ?, ?)`,
      [`新工单 #${orderInfo[0]?.order_no} "${orderInfo[0]?.title}" 已分配给您，请及时处理`, id, req.user.userId, assignee_id]
    );

    res.json({ code: 200, message: '分配成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '分配失败', data: null });
  }
});

// 批量分配工程师
router.post('/batch-assign', authenticateToken, checkPermission('service:edit'), async (req, res) => {
  try {
  const { ids, assignee_id } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择要分配的工单', data: null });
  }
  if (!assignee_id) {
    return res.status(400).json({ code: 400, message: '请选择工程师', data: null });
  }
  if (ids.length > 50) {
    return res.status(400).json({ code: 400, message: '单次批量分配不超过50条', data: null });
  }

  try {
    const placeholders = ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE crm_service_order SET status = 2, assignee_id = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL AND status = 1`,
      [assignee_id, ...ids]
    );

    // 批量写入新工单通知（去重：只写一条汇总通知）
    const [orders] = await pool.query(
      `SELECT order_no, title FROM crm_service_order WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids
    );
    const summary = orders.map(o => `#${o.order_no}`).join('、');
    await pool.query(
      `INSERT INTO crm_notification (type, title, content, business_type, business_id, from_user_id, to_user_id)
       VALUES ('service_assigned', '新工单分配', ?, 'service_order', ?, ?, ?)`,
      [`${ids.length}个工单 ${summary} 已批量分配给您，请及时处理`, ids[0], req.user.userId, assignee_id]
    );

    res.json({ code: 200, message: `已批量分配 ${ids.length} 个工单`, data: { count: ids.length } });
  } catch (error) {
    console.error('批量分配工单错误:', error);
    res.status(500).json({ code: 500, message: '批量分配失败', data: null });
  }
  } catch (error) {
    console.error('批量分配工单错误:', error);
    res.status(500).json({ code: 500, message: '批量分配失败', data: null });
  }
});

// 开始处理
router.post('/start', authenticateToken, checkPermission('service:edit'), async (req, res) => {
  const { id } = req.body;

  try {
    const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    if (!(await canManageService(req.user, orders[0]))) {
      return res.status(403).json({ code: 403, message: '无权操作该工单', data: null });
    }

    await pool.query('UPDATE crm_service_order SET status = 3 WHERE id = ?', [id]);
    res.json({ code: 200, message: '开始处理', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 完成处理（提交结果）
router.post('/finish', authenticateToken, checkPermission('service:edit'), async (req, res) => {
  const { id, finish_desc } = req.body;

  try {
    const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    if (!(await canManageService(req.user, orders[0]))) {
      return res.status(403).json({ code: 403, message: '无权操作该工单', data: null });
    }

    await pool.query(
      'UPDATE crm_service_order SET status = 4, finish_desc = ?, finish_time = NOW() WHERE id = ?',
      [finish_desc, id]
    );

    res.json({ code: 200, message: '处理完成，请等待客户确认', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 客户确认
router.post('/confirm', authenticateToken, checkPermission('service:edit'), async (req, res) => {
  const { id, satisfaction } = req.body;

  try {
    const [orders] = await pool.query('SELECT id, create_by, assignee_id FROM crm_service_order WHERE id = ? AND deleted_at IS NULL', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    if (!(await canManageService(req.user, orders[0]))) {
      return res.status(403).json({ code: 403, message: '无权操作该工单', data: null });
    }

    await pool.query(
      'UPDATE crm_service_order SET status = 5, satisfaction = ? WHERE id = ?',
      [satisfaction, id]
    );

    res.json({ code: 200, message: '确认完成', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 获取服务类型列表
router.get('/types', authenticateToken, (req, res) => {
  const types = [
    { value: '安装', label: '安装' },
    { value: '维修', label: '维修' },
    { value: '保养', label: '保养' },
    { value: '培训', label: '培训' },
    { value: '其他', label: '其他' }
  ];
  res.json({ code: 200, message: '查询成功', data: types });
});

// 获取状态列表
router.get('/status-list', authenticateToken, (req, res) => {
  const statusList = [
    { value: 1, label: '待分配' },
    { value: 2, label: '已分配' },
    { value: 3, label: '处理中' },
    { value: 4, label: '待确认' },
    { value: 5, label: '已完成' }
  ];
  res.json({ code: 200, message: '查询成功', data: statusList });
});

// 获取优先级列表
router.get('/priority-list', authenticateToken, (req, res) => {
  const priorityList = [
    { value: 1, label: '紧急' },
    { value: 2, label: '高' },
    { value: 3, label: '中' },
    { value: 4, label: '低' }
  ];
  res.json({ code: 200, message: '查询成功', data: priorityList });
});

module.exports = router;

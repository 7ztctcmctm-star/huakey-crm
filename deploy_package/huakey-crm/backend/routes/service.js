const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 获取工单列表
router.post('/list', authenticateToken, async (req, res) => {
  const { page = 1, pageSize = 10, status, type, priority, keyword } = req.body;
  const offset = (page - 1) * pageSize;
  
  let sql = `
    SELECT so.*, cu.company_name as customer_name, cu.contact_name as customer_contact, 
           cu.phone as customer_phone, c.contract_no, 
           u1.real_name as assignee_name, u2.real_name as create_by_name
    FROM crm_service_order so
    LEFT JOIN crm_customer cu ON so.customer_id = cu.id
    LEFT JOIN crm_contract c ON so.contract_id = c.id
    LEFT JOIN sys_user u1 ON so.assignee_id = u1.id
    LEFT JOIN sys_user u2 ON so.create_by = u2.id
    WHERE 1=1
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
  
  sql += ' ORDER BY so.create_time DESC LIMIT ?, ?';
  params.push(offset, pageSize);
  
  try {
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
      WHERE so.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    
    res.json({ code: 200, message: '查询成功', data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 创建工单
router.post('/add', authenticateToken, async (req, res) => {
  const { customer_id, contract_id, type, title, description, priority } = req.body;
  
  try {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await pool.query('SELECT COUNT(*) as cnt FROM crm_service_order WHERE order_no LIKE ?', [`SRV-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const orderNo = `SRV-${dateStr}-${seq}`;
    
    const [result] = await pool.query(
      'INSERT INTO crm_service_order (order_no, customer_id, contract_id, type, title, description, priority, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orderNo, customer_id, contract_id || null, type, title, description, priority || 3, req.user.userId]
    );
    
    res.json({ code: 200, message: '创建工单成功', data: { id: result.insertId, order_no: orderNo } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '创建工单失败', data: null });
  }
});

// 更新工单
router.post('/update', authenticateToken, async (req, res) => {
  const { id, customer_id, contract_id, type, title, description, priority } = req.body;
  
  try {
    await pool.query(
      'UPDATE crm_service_order SET customer_id = ?, contract_id = ?, type = ?, title = ?, description = ?, priority = ? WHERE id = ?',
      [customer_id, contract_id || null, type, title, description, priority || 3, id]
    );
    
    res.json({ code: 200, message: '修改工单成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '修改工单失败', data: null });
  }
});

// 删除工单
router.post('/delete', authenticateToken, async (req, res) => {
  const { id } = req.body;
  
  try {
    const [result] = await pool.query('DELETE FROM crm_service_order WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }
    
    res.json({ code: 200, message: '删除工单成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '删除工单失败', data: null });
  }
});

// 分配工程师
router.post('/assign', authenticateToken, async (req, res) => {
  const { id, assignee_id } = req.body;
  
  try {
    await pool.query(
      'UPDATE crm_service_order SET status = 2, assignee_id = ? WHERE id = ?',
      [assignee_id, id]
    );
    
    res.json({ code: 200, message: '分配成功', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '分配失败', data: null });
  }
});

// 开始处理
router.post('/start', authenticateToken, async (req, res) => {
  const { id } = req.body;
  
  try {
    await pool.query('UPDATE crm_service_order SET status = 3 WHERE id = ?', [id]);
    res.json({ code: 200, message: '开始处理', data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 完成处理（提交结果）
router.post('/finish', authenticateToken, async (req, res) => {
  const { id, finish_desc } = req.body;
  
  try {
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
router.post('/confirm', authenticateToken, async (req, res) => {
  const { id, satisfaction } = req.body;
  
  try {
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

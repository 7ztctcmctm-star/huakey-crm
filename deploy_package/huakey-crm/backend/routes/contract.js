const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const MODULE_NAME = '合同管理';

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

router.post('/list', authenticateToken, async (req, res) => {
  const { pageNum = 1, pageSize = 10, keyword = '', status = '', customer_id = '' } = req.body;
  const offset = (pageNum - 1) * pageSize;
  
  let sql = `SELECT c.*, cu.company_name as customer_name, u.real_name as create_by_name,
    (SELECT COALESCE(SUM(p.pay_amount), 0) FROM crm_payment p WHERE p.contract_id = c.id) as paid_amount,
    (SELECT COALESCE(SUM(pp.plan_amount), 0) FROM crm_payment_plan pp WHERE pp.contract_id = c.id) as plan_total
    FROM crm_contract c
    LEFT JOIN crm_customer cu ON c.customer_id = cu.id
    LEFT JOIN sys_user u ON c.create_by = u.id
    WHERE 1=1`;
  
  const params = [];
  
  if (keyword) {
    sql += ' AND (c.contract_no LIKE ? OR cu.company_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (customer_id) {
    sql += ' AND c.customer_id = ?';
    params.push(customer_id);
  }
  
  sql += ' ORDER BY c.create_time DESC LIMIT ?, ?';
  params.push(offset, pageSize);
  
  try {
    const [rows] = await pool.query(sql, params);
    
    const countSql = sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*LIMIT[\s\S]*/, '');
    const countParams = params.slice(0, -2);
    const [countResult] = await pool.query(countSql, countParams);
    
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: countResult[0].total } });
  } catch (error) {
    console.error('Contract list error:', error.message);
    res.status(500).json({ code: 500, message: '查询失败: ' + error.message, data: null });
  }
});

router.get('/detail/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [contract] = await pool.query(`
      SELECT c.*, cu.company_name as customer_name, cu.contact_name as contact, cu.phone, cu.address,
        u.real_name as create_by_name
      FROM crm_contract c
      LEFT JOIN crm_customer cu ON c.customer_id = cu.id
      LEFT JOIN sys_user u ON c.create_by = u.id
      WHERE c.id = ?
    `, [id]);
    
    if (!contract.length) {
      return res.status(404).json({ code: 404, message: '合同不存在', data: null });
    }
    
    const [plans] = await pool.query(`
      SELECT pp.*, COALESCE(SUM(p.pay_amount), 0) as paid_amount
      FROM crm_payment_plan pp
      LEFT JOIN crm_payment p ON pp.id = p.plan_id
      WHERE pp.contract_id = ?
      GROUP BY pp.id
      ORDER BY pp.plan_date
    `, [id]);
    
    const [payments] = await pool.query(`
      SELECT p.*, pp.plan_date, pp.plan_amount
      FROM crm_payment p
      LEFT JOIN crm_payment_plan pp ON p.plan_id = pp.id
      WHERE p.contract_id = ?
      ORDER BY p.pay_date DESC
    `, [id]);
    
    const paidTotal = payments.reduce((sum, p) => sum + parseFloat(p.pay_amount || 0), 0);
    const planTotal = plans.reduce((sum, p) => sum + parseFloat(p.plan_amount || 0), 0);
    
    res.json({
      code: 200,
      message: '查询成功',
      data: {
        ...contract[0],
        plans,
        payments,
        paid_amount: paidTotal,
        plan_total: planTotal
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, async (req, res) => {
  const { customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, remark, plans } = req.body;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const [count] = await connection.query('SELECT COUNT(*) as cnt FROM crm_contract WHERE contract_no LIKE ?', [`CON-${dateStr}-%`]);
    const seq = String(count[0].cnt + 1).padStart(3, '0');
    const contractNo = `CON-${dateStr}-${seq}`;
    
    const [result] = await connection.query(
      'INSERT INTO crm_contract (contract_no, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, remark, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [contractNo, customer_id, opportunity_id || null, amount, sign_date, delivery_date, payment_terms, remark, req.user.userId]
    );
    
    const contractId = result.insertId;
    
    if (plans && plans.length > 0) {
      const planValues = plans.map(p => [contractId, p.plan_date, p.plan_amount, p.remark || null]);
      await connection.query('INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES ?', [planValues]);
    }
    
    await connection.commit();
    res.json({ code: 200, message: '创建合同成功', data: { id: contractId, contract_no: contractNo } });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ code: 500, message: '创建合同失败', data: null });
  } finally {
    connection.release();
  }
});

router.post('/update', authenticateToken, async (req, res) => {
  const { id, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark, plans, delete_plan_ids } = req.body;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    await connection.query(
      'UPDATE crm_contract SET customer_id=?, opportunity_id=?, amount=?, sign_date=?, delivery_date=?, payment_terms=?, status=?, remark=? WHERE id=?',
      [customer_id, opportunity_id || null, amount, sign_date, delivery_date, payment_terms, status, remark, id]
    );
    
    if (delete_plan_ids && delete_plan_ids.length > 0) {
      await connection.query('DELETE FROM crm_payment_plan WHERE id IN (?)', [delete_plan_ids]);
    }
    
    if (plans && plans.length > 0) {
      for (const plan of plans) {
        if (plan.id) {
          await connection.query(
            'UPDATE crm_payment_plan SET plan_date=?, plan_amount=?, remark=? WHERE id=?',
            [plan.plan_date, plan.plan_amount, plan.remark || null, plan.id]
          );
        } else {
          await connection.query(
            'INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount, remark) VALUES (?, ?, ?, ?)',
            [id, plan.plan_date, plan.plan_amount, plan.remark || null]
          );
        }
      }
    }
    
    await connection.commit();
    res.json({ code: 200, message: '修改合同成功', data: null });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ code: 500, message: '修改合同失败', data: null });
  } finally {
    connection.release();
  }
});

router.post('/delete', authenticateToken, async (req, res) => {
  const { id } = req.body;
  
  try {
    const [contract] = await pool.query('SELECT status FROM crm_contract WHERE id=?', [id]);
    if (!contract.length) {
      return res.json({ code: 404, message: '合同不存在', data: null });
    }
    if (contract[0].status === 3) {
      return res.json({ code: 400, message: '已完成的合同不能删除', data: null });
    }
    
    await pool.query('DELETE FROM crm_contract WHERE id=?', [id]);
    res.json({ code: 200, message: '删除合同成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除合同失败', data: null });
  }
});

router.post('/payment/add', authenticateToken, async (req, res) => {
  const { contract_id, plan_id, pay_date, pay_amount, pay_method, remark } = req.body;
  
  try {
    console.log('收到回款登记请求:', { contract_id, plan_id, pay_date, pay_amount, pay_method, remark });
    
    await pool.query(
      'INSERT INTO crm_payment (contract_id, plan_id, pay_date, pay_amount, pay_method, remark) VALUES (?, ?, ?, ?, ?, ?)',
      [contract_id, plan_id || null, pay_date, pay_amount, pay_method, remark]
    );
    
    await pool.query('UPDATE crm_contract SET status=2 WHERE id=? AND status=1', [contract_id]);
    
    res.json({ code: 200, message: '登记回款成功', data: null });
  } catch (error) {
    console.error('登记回款失败:', error.message);
    console.error('错误详情:', error);
    console.error('请求体:', req.body);
    res.status(500).json({ code: 500, message: '登记回款失败: ' + error.message, data: null });
  }
});

router.post('/payment/update', authenticateToken, async (req, res) => {
  const { id, pay_date, pay_amount, pay_method, remark } = req.body;
  
  try {
    await pool.query(
      'UPDATE crm_payment SET pay_date=?, pay_amount=?, pay_method=?, remark=? WHERE id=?',
      [pay_date, pay_amount, pay_method, remark, id]
    );
    
    res.json({ code: 200, message: '修改回款记录成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '修改回款记录失败', data: null });
  }
});

router.post('/payment/delete', authenticateToken, async (req, res) => {
  const { id } = req.body;
  
  try {
    await pool.query('DELETE FROM crm_payment WHERE id=?', [id]);
    res.json({ code: 200, message: '删除回款记录成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除回款记录失败', data: null });
  }
});

router.get('/opportunity-list', authenticateToken, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM crm_opportunity WHERE stage != 5 AND stage != 6 ORDER BY name');
  res.json({ code: 200, message: '查询成功', data: rows });
});

module.exports = router;

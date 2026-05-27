const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const STAGE_MAP = {
  1: '询盘',
  2: '需求确认',
  3: '方案报价',
  4: '谈判',
  5: '成交',
  6: '失败'
};

const getDataPermission = async (user) => {
  if (user.roleId === 1 || user.roleId === 2) {
    return { type: 'all' };
  }

  if (user.roleId === 3) {
    const [users] = await pool.query(
      'SELECT dept_id FROM sys_user WHERE id = ?',
      [user.userId]
    );
    const deptId = users.length > 0 ? users[0].dept_id : null;
    if (deptId) {
      const [deptUserIds] = await pool.query(
        'SELECT id FROM sys_user WHERE dept_id = ?',
        [deptId]
      );
      const userIds = deptUserIds.map(u => u.id);
      return { type: 'dept', userIds: userIds.length > 0 ? userIds : [user.userId] };
    }
    return { type: 'self', userId: user.userId };
  }

  return { type: 'self', userId: user.userId };
};

const buildPermissionClause = (permission, tableAlias = 'o') => {
  if (permission.type === 'all') {
    return '1=1';
  }
  if (permission.type === 'dept') {
    return `${tableAlias}.owner_id IN (${permission.userIds.join(',')})`;
  }
  return `${tableAlias}.owner_id = ${permission.userId}`;
};

// 1. 商机列表
router.post('/list', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      name,
      customer_name,
      stage,
      owner_id
    } = req.body;

    const offset = (page - 1) * pageSize;
    const params = [];

    const permission = await getDataPermission(req.user);
    const permissionClause = buildPermissionClause(permission);

    let whereClause = `WHERE ${permissionClause}`;

    if (name) {
      whereClause += ' AND o.name LIKE ?';
      params.push(`%${name}%`);
    }
    if (customer_name) {
      whereClause += ' AND c.company_name LIKE ?';
      params.push(`%${customer_name}%`);
    }
    if (stage !== undefined && stage !== null && stage !== '') {
      whereClause += ' AND o.stage = ?';
      params.push(parseInt(stage));
    }
    if (owner_id) {
      whereClause += ' AND o.owner_id = ?';
      params.push(parseInt(owner_id));
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_opportunity o
      LEFT JOIN crm_customer c ON o.customer_id = c.id
      ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [list] = await pool.query(
      `SELECT 
        o.id, o.customer_id, o.name, o.expected_amount, o.expected_date,
        o.stage, o.win_rate, o.remark, o.owner_id, o.create_time, o.update_time,
        c.company_name as customer_name,
        u.real_name as owner_name
      FROM crm_opportunity o
      LEFT JOIN crm_customer c ON o.customer_id = c.id
      LEFT JOIN sys_user u ON o.owner_id = u.id
      ${whereClause}
      ORDER BY o.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取商机列表成功',
      data: {
        list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取商机列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取商机列表失败',
      data: null
    });
  }
});

// 2. 添加商机
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const {
      customer_id,
      name,
      expected_amount,
      expected_date,
      stage,
      win_rate,
      remark,
      owner_id
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }
    if (!name) {
      return res.status(400).json({ code: 400, message: '商机名称不能为空', data: null });
    }

    const [customers] = await pool.query(
      'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );
    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const finalOwnerId = owner_id || req.user.userId;

    const [result] = await pool.query(
      `INSERT INTO crm_opportunity 
        (customer_id, name, expected_amount, expected_date, stage, win_rate, remark, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer_id,
        name,
        expected_amount || 0,
        expected_date || null,
        stage || 1,
        win_rate !== undefined ? win_rate : 10,
        remark || null,
        finalOwnerId
      ]
    );

    res.json({
      code: 200,
      message: '添加商机成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('添加商机错误:', error);
    res.status(500).json({ code: 500, message: '添加商机失败', data: null });
  }
});

// 3. 修改商机
router.post('/update', authenticateToken, async (req, res) => {
  try {
    const {
      id,
      customer_id,
      name,
      expected_amount,
      expected_date,
      stage,
      win_rate,
      remark,
      owner_id
    } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });
    }

    const [rows] = await pool.query('SELECT * FROM crm_opportunity WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    }

    const updates = [];
    const params = [];

    if (customer_id !== undefined) {
      updates.push('customer_id = ?');
      params.push(customer_id);
    }
    if (name !== undefined) {
      if (!name) {
        return res.status(400).json({ code: 400, message: '商机名称不能为空', data: null });
      }
      updates.push('name = ?');
      params.push(name);
    }
    if (expected_amount !== undefined) {
      updates.push('expected_amount = ?');
      params.push(expected_amount);
    }
    if (expected_date !== undefined) {
      updates.push('expected_date = ?');
      params.push(expected_date);
    }
    if (stage !== undefined) {
      updates.push('stage = ?');
      params.push(stage);
    }
    if (win_rate !== undefined) {
      updates.push('win_rate = ?');
      params.push(win_rate);
    }
    if (remark !== undefined) {
      updates.push('remark = ?');
      params.push(remark);
    }
    if (owner_id !== undefined) {
      updates.push('owner_id = ?');
      params.push(owner_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null });
    }

    params.push(id);
    await pool.query(
      `UPDATE crm_opportunity SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ code: 200, message: '修改商机成功', data: null });
  } catch (error) {
    console.error('修改商机错误:', error);
    res.status(500).json({ code: 500, message: '修改商机失败', data: null });
  }
});

// 4. 推进阶段
router.post('/update-stage', authenticateToken, async (req, res) => {
  try {
    const { id, stage } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });
    }
    if (!stage || stage < 1 || stage > 6) {
      return res.status(400).json({ code: 400, message: '阶段值无效(1-6)', data: null });
    }

    const [rows] = await pool.query('SELECT * FROM crm_opportunity WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    }

    const oldStage = rows[0].stage;
    if (oldStage === 5 || oldStage === 6) {
      return res.status(400).json({
        code: 400,
        message: `商机已${oldStage === 5 ? '成交' : '失败'}，不可再推进`,
        data: null
      });
    }

    await pool.query(
      'UPDATE crm_opportunity SET stage = ?, update_time = NOW() WHERE id = ?',
      [stage, id]
    );

    res.json({
      code: 200,
      message: `阶段已从"${STAGE_MAP[oldStage]}"推进至"${STAGE_MAP[stage]}"`,
      data: null
    });
  } catch (error) {
    console.error('推进阶段错误:', error);
    res.status(500).json({ code: 500, message: '推进阶段失败', data: null });
  }
});

// 5. 删除商机
router.post('/delete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });
    }

    const [rows] = await pool.query('SELECT * FROM crm_opportunity WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    }

    await pool.query('DELETE FROM crm_opportunity WHERE id = ?', [id]);

    res.json({ code: 200, message: '删除商机成功', data: null });
  } catch (error) {
    console.error('删除商机错误:', error);
    res.status(500).json({ code: 500, message: '删除商机失败', data: null });
  }
});

// 6. 商机详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        o.id, o.customer_id, o.name, o.expected_amount, o.expected_date,
        o.stage, o.win_rate, o.remark, o.owner_id, o.create_time, o.update_time,
        c.company_name as customer_name,
        u.real_name as owner_name
      FROM crm_opportunity o
      LEFT JOIN crm_customer c ON o.customer_id = c.id
      LEFT JOIN sys_user u ON o.owner_id = u.id
      WHERE o.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    }

    res.json({
      code: 200,
      message: '获取商机详情成功',
      data: rows[0]
    });
  } catch (error) {
    console.error('获取商机详情错误:', error);
    res.status(500).json({ code: 500, message: '获取商机详情失败', data: null });
  }
});

// 7. 销售漏斗统计
router.get('/funnel', authenticateToken, async (req, res) => {
  try {
    const permission = await getDataPermission(req.user);
    const permissionClause = buildPermissionClause(permission);

    const [stageStats] = await pool.query(
      `SELECT 
        stage,
        COUNT(*) as count,
        COALESCE(SUM(expected_amount), 0) as total_amount
      FROM crm_opportunity o
      WHERE ${permissionClause}
      GROUP BY stage
      ORDER BY stage`,
      []
    );

    const [totalResult] = await pool.query(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(expected_amount), 0) as total_amount
      FROM crm_opportunity o
      WHERE ${permissionClause}`,
      []
    );

    const funnel = [];
    let cumulativeCount = 0;

    for (let s = 1; s <= 5; s++) {
      const stat = stageStats.find(item => item.stage === s) || { count: 0, total_amount: 0 };
      cumulativeCount += stat.count;
      funnel.push({
        stage: s,
        stage_name: STAGE_MAP[s],
        count: stat.count,
        amount: stat.total_amount,
        cumulative_count: cumulativeCount
      });
    }

    const failed = stageStats.find(item => item.stage === 6);
    const failedCount = failed ? failed.count : 0;
    const failedAmount = failed ? failed.total_amount : 0;

    res.json({
      code: 200,
      message: '获取销售漏斗成功',
      data: {
        total_count: totalResult[0].total_count,
        total_amount: totalResult[0].total_amount,
        funnel,
        failed: {
          count: failedCount,
          amount: failedAmount
        }
      }
    });
  } catch (error) {
    console.error('获取销售漏斗错误:', error);
    res.status(500).json({ code: 500, message: '获取销售漏斗失败', data: null });
  }
});

module.exports = router;

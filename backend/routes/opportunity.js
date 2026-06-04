const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
const { logFieldChanges } = require('../utils/fieldLog');

const MODULE_NAME = '商机管理';

const router = express.Router();

const STAGE_MAP = {
  1: '询盘',
  2: '需求确认',
  3: '方案报价',
  4: '谈判',
  5: '成交',
  6: '失败'
};

const opportunityListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  stage: Joi.number().integer().valid(1, 2, 3, 4, 5, 6).allow('', null),
  customer_id: Joi.number().integer().positive().allow('', null)
});

const addOpportunitySchema = Joi.object({
  name: Joi.string().required().max(200),
  customer_id: Joi.number().integer().positive().required(),
  expected_amount: Joi.number().precision(2).min(0).allow(null),
  expected_date: Joi.date().iso().allow(null),
  stage: Joi.number().integer().valid(1, 2, 3, 4, 5, 6).default(1),
  win_rate: Joi.number().integer().min(0).max(100).allow(null),
  remark: Joi.string().max(2000).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null)
});

const updateOpportunitySchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(200),
  customer_id: Joi.number().integer().positive(),
  expected_amount: Joi.number().precision(2).min(0).allow(null),
  expected_date: Joi.date().iso().allow(null),
  stage: Joi.number().integer().valid(1, 2, 3, 4, 5, 6),
  win_rate: Joi.number().integer().min(0).max(100).allow(null),
  remark: Joi.string().max(2000).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null)
});

const { getDataPermission, buildPermissionClause } = require('../utils/permission');

// 1. 商机列表
router.post('/list',
  authenticateToken,
  checkDataPermission('opportunity', 'owner_id'),
  validate(opportunityListSchema),
  async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      name,
      customer_name,
      customer_id,
      stage,
      owner_id
    } = req.body;

    const offset = (page - 1) * pageSize;
    const params = [];

    // 使用新的数据权限中间件（参数化查询）
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    params.push(...permParams);

    let whereClause = `WHERE ${permissionWhere} AND o.deleted_at IS NULL`;

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
    if (customer_id) {
      whereClause += ' AND o.customer_id = ?';
      params.push(parseInt(customer_id));
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
        u.real_name as owner_name,
        DATEDIFF(NOW(), o.update_time) as stagnant_days
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
router.post('/add', authenticateToken, checkPermission('opportunity:add'), validate(addOpportunitySchema), async (req, res) => {
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
      'SELECT id, customer_type FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );
    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }
    // 校验客户必须是正式客户
    if (customers[0].customer_type !== 'customer') {
      return res.status(400).json({ code: 400, message: '只能为正式客户创建商机，请先将客户转化为正式客户', data: null });
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
router.post('/update',
  authenticateToken,
  checkPermission('opportunity:edit'),
  checkDataPermission('opportunity', 'owner_id'),
  validate(updateOpportunitySchema),
  async (req, res) => {
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

    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');

    const [rows] = await pool.query(
      `SELECT o.id, o.customer_id, o.name, o.expected_amount, o.expected_date, o.stage, o.win_rate, o.remark, o.owner_id
       FROM crm_opportunity o WHERE o.id = ? AND o.deleted_at IS NULL AND ${permissionWhere}`,
      [id, ...permParams]
    );
    if (rows.length === 0) {
      return res.status(403).json({ code: 403, message: '无权修改该商机', data: null });
    }
    const oldData = rows[0];

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

    // 记录字段变更
    const oppFields = ['customer_id', 'name', 'expected_amount', 'expected_date', 'stage', 'win_rate', 'remark', 'owner_id'];
    const newData = { customer_id, name, expected_amount, expected_date, stage, win_rate, remark, owner_id };
    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑',
      oldData,
      newData,
      allowedFields: oppFields,
      description: `修改商机 "${oldData.name}" 字段变更`
    });

    res.json({ code: 200, message: '修改商机成功', data: null });
  } catch (error) {
    console.error('修改商机错误:', error);
    res.status(500).json({ code: 500, message: '修改商机失败', data: null });
  }
});

// 4. 推进阶段
router.post('/update-stage',
  authenticateToken,
  checkPermission('opportunity:edit'),
  checkDataPermission('opportunity', 'owner_id'),
  async (req, res) => {
  try {
    const { id, stage } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });
    }
    if (!stage || stage < 1 || stage > 6) {
      return res.status(400).json({ code: 400, message: '阶段值无效(1-6)', data: null });
    }

    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');

    const [rows] = await pool.query(
      `SELECT o.id, o.stage FROM crm_opportunity o WHERE o.id = ? AND o.deleted_at IS NULL AND ${permissionWhere}`,
      [id, ...permParams]
    );
    if (rows.length === 0) {
      return res.status(403).json({ code: 403, message: '无权修改该商机', data: null });
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

    // 记录阶段变更日志
    await pool.query(
      'INSERT INTO crm_opportunity_stage_log (opportunity_id, from_stage, to_stage, changed_by) VALUES (?, ?, ?, ?)',
      [id, oldStage, stage, req.user.userId]
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

// 4.1 获取商机阶段日志
router.get('/stage-log/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [logs] = await pool.query(
      `SELECT
        l.id, l.from_stage, l.to_stage, l.change_reason, l.changed_at,
        u.real_name as changed_by_name,
        TIMESTAMPDIFF(HOUR, l.changed_at,
          COALESCE(
            (SELECT MIN(changed_at) FROM crm_opportunity_stage_log
             WHERE opportunity_id = l.opportunity_id AND changed_at > l.changed_at),
            NOW()
          )
        ) as hours_in_stage
      FROM crm_opportunity_stage_log l
      LEFT JOIN sys_user u ON l.changed_by = u.id
      WHERE l.opportunity_id = ?
      ORDER BY l.changed_at DESC`,
      [id]
    );

    res.json({ code: 200, message: '查询成功', data: logs });
  } catch (error) {
    console.error('查询阶段日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 4.2 商机阶段停留时间统计
router.get('/stage-stats/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [stats] = await pool.query(
      `SELECT
        to_stage as stage,
        SUM(
          TIMESTAMPDIFF(HOUR, changed_at,
            COALESCE(
              (SELECT MIN(changed_at) FROM crm_opportunity_stage_log
               WHERE opportunity_id = ? AND changed_at > l.changed_at),
              NOW()
            )
          )
        ) as hours
      FROM crm_opportunity_stage_log l
      WHERE opportunity_id = ?
      GROUP BY to_stage
      ORDER BY stage`,
      [id, id]
    );

    const stages = stats.map(s => ({
      stage: s.stage,
      name: STAGE_MAP[s.stage] || '未知',
      hours: s.hours || 0
    }));

    const totalHours = stages.reduce((sum, s) => sum + s.hours, 0);

    res.json({
      code: 200, message: '查询成功',
      data: { stages, total_hours: totalHours }
    });
  } catch (error) {
    console.error('阶段统计错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 5. 删除商机
router.post('/delete', authenticateToken, checkPermission('opportunity:delete'), async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });
    }

    const [rows] = await pool.query('SELECT id, owner_id FROM crm_opportunity WHERE id = ? AND deleted_at IS NULL', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    }

    // 权限检查：管理员或负责人可删除
    const { manageAll, roleId, userId } = req.user;
    if (!manageAll && roleId !== 1 && roleId !== 2 && rows[0].owner_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该商机', data: null });
    }

    await pool.query('UPDATE crm_opportunity SET deleted_at = NOW() WHERE id = ?', [id]);

    res.json({ code: 200, message: '删除商机成功', data: null });
  } catch (error) {
    console.error('删除商机错误:', error);
    res.status(500).json({ code: 500, message: '删除商机失败', data: null });
  }
});

// 6. 商机详情
router.get('/detail/:id',
  authenticateToken,
  checkDataPermission('opportunity', 'owner_id'),
  async (req, res) => {
  try {
    const { id } = req.params;

    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');

    const [rows] = await pool.query(
      `SELECT
        o.id, o.customer_id, o.name, o.expected_amount, o.expected_date,
        o.stage, o.win_rate, o.remark, o.owner_id, o.create_time, o.update_time,
        c.company_name as customer_name,
        u.real_name as owner_name
      FROM crm_opportunity o
      LEFT JOIN crm_customer c ON o.customer_id = c.id
      LEFT JOIN sys_user u ON o.owner_id = u.id
      WHERE o.id = ? AND o.deleted_at IS NULL AND ${permissionWhere}`,
      [id, ...permParams]
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
router.get('/funnel',
  authenticateToken,
  checkDataPermission('opportunity', 'owner_id'),
  async (req, res) => {
  try {
    // 使用新的数据权限中间件（参数化查询）
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');

    const [stageStats] = await pool.query(
      `SELECT
        stage,
        COUNT(*) as count,
        COALESCE(SUM(expected_amount), 0) as total_amount
      FROM crm_opportunity o
      WHERE ${permissionWhere} AND o.deleted_at IS NULL
      GROUP BY stage
      ORDER BY stage`,
      permParams
    );

    const [totalResult] = await pool.query(
      `SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(expected_amount), 0) as total_amount
      FROM crm_opportunity o
      WHERE ${permissionWhere} AND o.deleted_at IS NULL`,
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

// 8. 商机阶段变更日志
router.get('/stage-log/:id',
  authenticateToken,
  checkDataPermission('opportunity', 'owner_id'),
  async (req, res) => {
  try {
    const { id } = req.params;

    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');

    const [logs] = await pool.query(
      `SELECT l.id, l.from_stage, l.to_stage, l.create_time,
        u.real_name as changed_by_name
      FROM crm_opportunity_stage_log l
      LEFT JOIN sys_user u ON l.changed_by = u.id
      INNER JOIN crm_opportunity o ON l.opportunity_id = o.id AND ${permissionWhere}
      WHERE l.opportunity_id = ?
      ORDER BY l.create_time DESC`,
      [...permParams, id]
    );

    res.json({
      code: 200, message: '查询成功',
      data: logs.map(l => ({
        ...l,
        from_stage_name: STAGE_MAP[l.from_stage],
        to_stage_name: STAGE_MAP[l.to_stage]
      }))
    });
  } catch (error) {
    console.error('获取阶段变更日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

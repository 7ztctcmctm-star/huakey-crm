const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const requireAdmin = require('../middleware/admin');

// ============ 工作流规则 ============

// 规则列表
router.get('/workflows', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT w.*, u.real_name as create_by_name,
        (SELECT COUNT(*) FROM crm_workflow_log wl WHERE wl.rule_id = w.id AND wl.create_time >= CURDATE()) as today_runs
      FROM crm_workflow_rule w LEFT JOIN sys_user u ON w.create_by = u.id
      WHERE w.deleted_at IS NULL ORDER BY w.create_time DESC
    `);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[自动化] 工作流列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建规则
router.post('/workflows', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, trigger_event, conditions, actions } = req.body;
    if (!name || !trigger_event || !actions) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const condStr = typeof conditions === 'string' ? conditions : JSON.stringify(conditions || []);
    const actStr = typeof actions === 'string' ? actions : JSON.stringify(actions);
    const [result] = await pool.query(
      'INSERT INTO crm_workflow_rule (name, description, trigger_event, conditions, actions, create_by) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || null, trigger_event, condStr, actStr, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[自动化] 创建工作流失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新规则
router.put('/workflows/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, trigger_event, conditions, actions, status } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (trigger_event !== undefined) { fields.push('trigger_event = ?'); values.push(trigger_event); }
    if (conditions !== undefined) { fields.push('conditions = ?'); values.push(typeof conditions === 'string' ? conditions : JSON.stringify(conditions)); }
    if (actions !== undefined) { fields.push('actions = ?'); values.push(typeof actions === 'string' ? actions : JSON.stringify(actions)); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_workflow_rule SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[自动化] 更新工作流失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除规则
router.delete('/workflows/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE crm_workflow_rule SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[自动化] 删除工作流失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 启用/禁用
router.post('/workflows/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [[rule]] = await pool.query('SELECT status FROM crm_workflow_rule WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!rule) return res.status(404).json({ code: 404, message: '规则不存在', data: null });
    const newStatus = rule.status === 1 ? 0 : 1;
    await pool.query('UPDATE crm_workflow_rule SET status = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ code: 200, message: newStatus ? '已启用' : '已禁用', data: { status: newStatus } });
  } catch (error) {
    console.error('[自动化] 切换状态失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 手动执行（测试）
router.post('/workflows/execute', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rule_id, target_type, target_id } = req.body;
    const [[rule]] = await pool.query('SELECT * FROM crm_workflow_rule WHERE id = ? AND deleted_at IS NULL', [rule_id]);
    if (!rule) return res.status(404).json({ code: 404, message: '规则不存在', data: null });

    const result = await executeActions(rule.id, target_type, target_id, JSON.parse(rule.actions || '[]'));
    res.json({ code: 200, message: '执行完成', data: result });
  } catch (error) {
    console.error('[自动化] 执行失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 执行动作
async function executeActions(ruleId, targetType, targetId, actions) {
  const results = [];
  for (const action of actions) {
    try {
      let detail = '';
      switch (action.type) {
        case 'assign':
          await pool.query('UPDATE crm_customer SET owner_id = ? WHERE id = ?', [action.params.user_id, targetId]);
          detail = `分配客户给用户${action.params.user_id}`;
          break;
        case 'notify':
          await pool.query(
            'INSERT INTO crm_notification (type, title, content, to_user_id, business_type, business_id) VALUES (?, ?, ?, ?, ?, ?)',
            ['workflow', action.params.title || '工作流通知', action.params.content || '', action.params.user_id || null, targetType, targetId]
          );
          detail = `发送通知: ${action.params.title}`;
          break;
        case 'tag':
          await pool.query('INSERT IGNORE INTO crm_customer_tag (customer_id, tag_id) VALUES (?, ?)', [targetId, action.params.tag_id]);
          detail = `添加标签${action.params.tag_id}`;
          break;
        case 'update_field': {
          const ALLOWED_FIELDS = ['level', 'status', 'industry', 'source', 'assignee', 'lifecycle_status', 'remark'];
          if (!ALLOWED_FIELDS.includes(action.params.field)) {
            detail = `字段 ${action.params.field} 不在白名单中，跳过`;
            break;
          }
          await pool.query(`UPDATE crm_customer SET ${action.params.field} = ? WHERE id = ?`, [action.params.value, targetId]);
          detail = `更新字段${action.params.field}=${action.params.value}`;
          break;
        }
        case 'create_followup':
          await pool.query(
            'INSERT INTO crm_follow_plan (customer_id, plan_time, plan_content, create_by) VALUES (?, ?, ?, ?)',
            [targetId, action.params.plan_time || new Date(), action.params.content || '自动创建', action.params.user_id || 1]
          );
          detail = `创建跟进计划`;
          break;
        default:
          detail = `未知动作类型: ${action.type}`;
      }
      await pool.query(
        'INSERT INTO crm_workflow_log (rule_id, trigger_event, target_type, target_id, action_type, action_result, action_detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ruleId, 'manual', targetType, targetId, action.type, 'success', detail]
      );
      results.push({ type: action.type, result: 'success', detail });
    } catch (err) {
      await pool.query(
        'INSERT INTO crm_workflow_log (rule_id, trigger_event, target_type, target_id, action_type, action_result, action_detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ruleId, 'manual', targetType, targetId, action.type, 'failed', err.message]
      );
      results.push({ type: action.type, result: 'failed', detail: err.message });
    }
  }
  // 更新规则统计
  await pool.query('UPDATE crm_workflow_rule SET run_count = run_count + 1, last_run_at = NOW() WHERE id = ?', [ruleId]);
  return results;
}

// 触发器入口
router.post('/workflows/trigger', authenticateToken, async (req, res) => {
  try {
    const { event, target_type, target_id } = req.body;
    if (!event) return res.status(400).json({ code: 400, message: '事件不能为空', data: null });

    const [rules] = await pool.query(
      'SELECT * FROM crm_workflow_rule WHERE trigger_event = ? AND status = 1 AND deleted_at IS NULL', [event]
    );

    let triggered = 0;
    for (const rule of rules) {
      // 检查条件（简化：条件匹配则执行）
      let conditionsMet = true;
      if (rule.conditions) {
        try {
          const conditions = JSON.parse(rule.conditions);
          if (conditions.length > 0 && target_type === 'customer') {
            const [[target]] = await pool.query('SELECT * FROM crm_customer WHERE id = ?', [target_id]);
            if (target) {
              for (const cond of conditions) {
                if (cond.operator === 'equals' && target[cond.field] !== cond.value) conditionsMet = false;
                if (cond.operator === 'not_equals' && target[cond.field] === cond.value) conditionsMet = false;
              }
            }
          }
        } catch { /* 条件解析失败，默认满足 */ }
      }

      if (conditionsMet) {
        const actions = JSON.parse(rule.actions || '[]');
        await executeActions(rule.id, target_type, target_id, actions);
        triggered++;
      }
    }

    res.json({ code: 200, message: '触发完成', data: { rules_checked: rules.length, triggered } });
  } catch (error) {
    console.error('[自动化] 触发失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 执行日志
router.get('/workflows/logs', authenticateToken, async (req, res) => {
  try {
    const { rule_id, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE 1=1';
    const params = [];
    if (rule_id) { where += ' AND wl.rule_id = ?'; params.push(rule_id); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_workflow_log wl ${where}`, params);
    const [rows] = await pool.query(`
      SELECT wl.*, w.name as rule_name
      FROM crm_workflow_log wl JOIN crm_workflow_rule w ON wl.rule_id = w.id
      ${where} ORDER BY wl.create_time DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[自动化] 日志查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 自动分配规则 ============

router.get('/assign-rules', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_assign_rule WHERE deleted_at IS NULL ORDER BY priority DESC, id');
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[自动化] 分配规则查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/assign-rules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rule_name, assign_type, source_value, region_value, user_ids, priority, is_active } = req.body;
    if (!rule_name || !assign_type) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const usersStr = typeof user_ids === 'string' ? user_ids : JSON.stringify(user_ids || []);
    const [result] = await pool.query(
      'INSERT INTO crm_assign_rule (rule_name, assign_type, source_value, region_value, user_ids, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [rule_name, assign_type, source_value || null, region_value || null, usersStr, priority || 0, is_active !== undefined ? is_active : 1]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[自动化] 创建分配规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/assign-rules/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rule_name, assign_type, source_value, region_value, user_ids, priority, is_active } = req.body;
    const fields = [], values = [];
    if (rule_name !== undefined) { fields.push('rule_name = ?'); values.push(rule_name); }
    if (assign_type !== undefined) { fields.push('assign_type = ?'); values.push(assign_type); }
    if (source_value !== undefined) { fields.push('source_value = ?'); values.push(source_value); }
    if (region_value !== undefined) { fields.push('region_value = ?'); values.push(region_value); }
    if (user_ids !== undefined) { fields.push('user_ids = ?'); values.push(typeof user_ids === 'string' ? user_ids : JSON.stringify(user_ids)); }
    if (priority !== undefined) { fields.push('priority = ?'); values.push(priority); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_assign_rule SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[自动化] 更新分配规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/assign-rules/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_assign_rule WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[自动化] 删除分配规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 执行自动分配
router.post('/assign-rules/apply', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { customer_id, customer_ids } = req.body;
    const ids = customer_ids || (customer_id ? [customer_id] : []);
    if (ids.length === 0) return res.status(400).json({ code: 400, message: '请选择客户', data: null });

    const [rules] = await pool.query('SELECT * FROM crm_assign_rule WHERE is_active = 1 ORDER BY priority DESC');
    const results = [];

    for (const cid of ids) {
      const [[customer]] = await pool.query('SELECT * FROM crm_customer WHERE id = ? AND deleted_at IS NULL', [cid]);
      if (!customer) { results.push({ id: cid, result: 'not_found' }); continue; }

      let assigned = false;
      for (const rule of rules) {
        let match = false;
        if (rule.assign_type === 'round_robin') { match = true; }
        else if (rule.assign_type === 'by_source' && customer.source === rule.source_value) { match = true; }
        else if (rule.assign_type === 'by_region' && customer.address && customer.address.includes(rule.region_value)) { match = true; }

        if (match) {
          let userIds = [];
          try { userIds = JSON.parse(rule.user_ids || '[]'); } catch { /* */ }
          if (userIds.length > 0) {
            // 轮询选择
            const idx = (rule.last_assigned_index || 0) % userIds.length;
            const selectedUser = userIds[idx];
            await pool.query('UPDATE crm_customer SET owner_id = ? WHERE id = ?', [selectedUser, cid]);
            await pool.query('UPDATE crm_assign_rule SET last_assigned_index = ? WHERE id = ?', [idx + 1, rule.id]);
            results.push({ id: cid, rule: rule.rule_name, user_id: selectedUser });
            assigned = true;
            break;
          }
        }
      }
      if (!assigned) results.push({ id: cid, result: 'no_match' });
    }

    res.json({ code: 200, message: '分配完成', data: results });
  } catch (error) {
    console.error('[自动化] 自动分配失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 智能提醒 ============

router.get('/smart-reminders', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_smart_reminder WHERE deleted_at IS NULL ORDER BY create_time DESC');
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[自动化] 智能提醒列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/smart-reminders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, reminder_type, config, notify_to, notify_method } = req.body;
    if (!name || !reminder_type || !config) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const configStr = typeof config === 'string' ? config : JSON.stringify(config);
    const [result] = await pool.query(
      'INSERT INTO crm_smart_reminder (name, reminder_type, config, notify_to, notify_method, create_by) VALUES (?, ?, ?, ?, ?, ?)',
      [name, reminder_type, configStr, notify_to || 'owner', notify_method || 'system', req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[自动化] 创建智能提醒失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/smart-reminders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, reminder_type, config, notify_to, notify_method, status } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (reminder_type !== undefined) { fields.push('reminder_type = ?'); values.push(reminder_type); }
    if (config !== undefined) { fields.push('config = ?'); values.push(typeof config === 'string' ? config : JSON.stringify(config)); }
    if (notify_to !== undefined) { fields.push('notify_to = ?'); values.push(notify_to); }
    if (notify_method !== undefined) { fields.push('notify_method = ?'); values.push(notify_method); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_smart_reminder SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[自动化] 更新智能提醒失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/smart-reminders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE crm_smart_reminder SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[自动化] 删除智能提醒失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 执行智能提醒扫描
router.post('/smart-reminders/run', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [rules] = await pool.query('SELECT * FROM crm_smart_reminder WHERE status = 1 AND deleted_at IS NULL');
    let totalFound = 0;

    for (const rule of rules) {
      const config = JSON.parse(rule.config || '{}');
      let matches = [];

      switch (rule.reminder_type) {
        case 'followup_gap':
          [matches] = await pool.query(`
            SELECT c.id, c.company_name, c.owner_id, c.last_follow_time,
                   DATEDIFF(CURDATE(), COALESCE(c.last_follow_time, c.create_time)) as days_gap
            FROM crm_customer c WHERE c.deleted_at IS NULL AND c.status = 1
              AND DATEDIFF(CURDATE(), COALESCE(c.last_follow_time, c.create_time)) >= ?
          `, [config.days || 7]);
          break;

        case 'contract_expire':
          [matches] = await pool.query(`
            SELECT c.id, c.contract_no, c.customer_id, cu.company_name, cu.owner_id,
                   DATEDIFF(c.delivery_date, CURDATE()) as days_left
            FROM crm_contract c JOIN crm_customer cu ON c.customer_id = cu.id
            WHERE c.deleted_at IS NULL AND c.status IN (1, 2)
              AND c.delivery_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
          `, [config.days_before || 30]);
          break;

        case 'payment_due':
          [matches] = await pool.query(`
            SELECT pp.id, pp.contract_id, pp.plan_date, pp.plan_amount,
                   c.customer_id, cu.company_name, cu.owner_id,
                   DATEDIFF(pp.plan_date, CURDATE()) as days_left
            FROM crm_payment_plan pp
            JOIN crm_contract c ON pp.contract_id = c.id
            JOIN crm_customer cu ON c.customer_id = cu.id
            WHERE pp.status != 'completed' AND c.deleted_at IS NULL
              AND pp.plan_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
          `, [config.days_before || 7]);
          break;

        case 'inactive':
          [matches] = await pool.query(`
            SELECT c.id, c.company_name, c.owner_id, c.last_follow_time,
                   DATEDIFF(CURDATE(), c.last_follow_time) as days_inactive
            FROM crm_customer c WHERE c.deleted_at IS NULL AND c.status = 1
              AND c.last_follow_time < DATE_SUB(CURDATE(), INTERVAL ? DAY)
          `, [config.days_no_contact || 30]);
          break;
      }

      for (const match of matches) {
        const userId = rule.notify_to === 'boss' ? 1 : (match.owner_id || 1);
        const targetType = rule.reminder_type === 'contract_expire' ? 'contract' : (rule.reminder_type === 'payment_due' ? 'payment' : 'customer');
        const targetId = match.id || match.contract_id || match.customer_id;

        try {
          await pool.query(
            'INSERT IGNORE INTO crm_smart_reminder_log (rule_id, target_type, target_id, remind_date, user_id) VALUES (?, ?, ?, CURDATE(), ?)',
            [rule.id, targetType, targetId, userId]
          );

          const [[{ affected }]] = await pool.query('SELECT ROW_COUNT() as affected');
          if (affected > 0) {
            const title = `${rule.name}`;
            const content = `客户: ${match.company_name || match.contract_no || targetId}，${match.days_gap || match.days_left || match.days_inactive}天`;
            await pool.query(
              'INSERT INTO crm_notification (type, title, content, to_user_id) VALUES (?, ?, ?, ?)',
              ['smart_reminder', title, content, userId]
            );
            totalFound++;
          }
        } catch { /* 重复提醒忽略 */ }
      }

      await pool.query('UPDATE crm_smart_reminder SET last_run_at = NOW() WHERE id = ?', [rule.id]);
    }

    res.json({ code: 200, message: `扫描完成，发现 ${totalFound} 条新提醒`, data: { found: totalFound } });
  } catch (error) {
    console.error('[自动化] 智能提醒扫描失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 我的待处理提醒
router.get('/smart-reminders/pending', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT rl.*, sr.name as rule_name, sr.reminder_type
      FROM crm_smart_reminder_log rl
      JOIN crm_smart_reminder sr ON rl.rule_id = sr.id
      WHERE rl.user_id = ? AND rl.status = 'pending'
      ORDER BY rl.create_time DESC LIMIT 50
    `, [req.user.userId]);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[自动化] 待处理提醒查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 标记已读
router.put('/smart-reminders/log/:id/seen', authenticateToken, async (req, res) => {
  try {
    await pool.query("UPDATE crm_smart_reminder_log SET status = 'seen' WHERE id = ? AND user_id = ?", [req.params.id, req.user.userId]);
    res.json({ code: 200, message: '已标记', data: null });
  } catch (error) {
    console.error('[自动化] 标记已读失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

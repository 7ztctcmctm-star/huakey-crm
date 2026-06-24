const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const requireAdmin = require('../middleware/admin');
const { requireManager } = require('../middleware/admin');

// 获取所有评分规则
router.get('/rules', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM crm_score_rule WHERE deleted_at IS NULL ORDER BY condition_type, name'
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[评分] 获取规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建评分规则
router.post('/rules', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const { name, condition_type, condition_field, condition_operator, condition_value, score } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '规则名称不能为空', data: null });
    }
    if (score === undefined || score === null) {
      return res.status(400).json({ code: 400, message: '分数不能为空', data: null });
    }
    const validTypes = ['source', 'action', 'interaction'];
    const safeType = validTypes.includes(condition_type) ? condition_type : 'source';

    const [result] = await pool.query(
      `INSERT INTO crm_score_rule (name, condition_type, condition_field, condition_operator, condition_value, score)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), safeType, condition_field || null, condition_operator || null, condition_value || null, parseInt(score)]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[评分] 创建规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新评分规则
router.put('/rules/:id', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, condition_type, condition_field, condition_operator, condition_value, score, status } = req.body;

    const [existing] = await pool.query('SELECT id FROM crm_score_rule WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ code: 404, message: '规则不存在', data: null });
    }

    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (condition_type !== undefined) { fields.push('condition_type = ?'); values.push(condition_type); }
    if (condition_field !== undefined) { fields.push('condition_field = ?'); values.push(condition_field); }
    if (condition_operator !== undefined) { fields.push('condition_operator = ?'); values.push(condition_operator); }
    if (condition_value !== undefined) { fields.push('condition_value = ?'); values.push(condition_value); }
    if (score !== undefined) { fields.push('score = ?'); values.push(parseInt(score)); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }

    if (fields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    }

    values.push(id);
    await pool.query(`UPDATE crm_score_rule SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[评分] 更新规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除评分规则
router.delete('/rules/:id', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE crm_score_rule SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[评分] 删除规则失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 计算单个客户评分
router.post('/calculate/:customerId', authenticateToken, checkPermission('scoring'), requireManager, async (req, res) => {
  try {
    const { customerId } = req.params;

    // 获取客户信息
    const [customers] = await pool.query(
      'SELECT id, source FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
      [customerId]
    );
    if (customers.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }
    const customer = customers[0];

    // 获取客户统计数据
    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM crm_follow_up WHERE customer_id = ?) as followup_count,
        (SELECT COUNT(*) FROM crm_quote WHERE customer_id = ? AND deleted_at IS NULL) as quote_count,
        (SELECT COUNT(*) FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL) as contract_count,
        (SELECT DATEDIFF(NOW(), MAX(create_time)) FROM crm_follow_up WHERE customer_id = ?) as last_followup_days
    `, [customerId, customerId, customerId, customerId]);

    // 获取所有启用的规则
    const [rules] = await pool.query('SELECT * FROM crm_score_rule WHERE status = 1');

    let totalScore = 0;
    const matchedRules = [];

    for (const rule of rules) {
      let matched = false;
      const fieldValue = getFieldValue(rule.condition_field, customer, stats);

      switch (rule.condition_operator) {
        case 'eq':
          matched = String(fieldValue) === String(rule.condition_value);
          break;
        case 'gt':
          matched = parseFloat(fieldValue) > parseFloat(rule.condition_value);
          break;
        case 'lt':
          matched = parseFloat(fieldValue) < parseFloat(rule.condition_value);
          break;
        case 'contains':
          matched = String(fieldValue).includes(String(rule.condition_value));
          break;
        default:
          matched = false;
      }

      if (matched) {
        totalScore += rule.score;
        matchedRules.push(rule);
      }
    }

    // 更新客户评分
    await pool.query('UPDATE crm_customer SET score = ? WHERE id = ?', [totalScore, customerId]);

    // 记录评分日志（先清除旧记录，再写入新记录）
    await pool.query('DELETE FROM crm_customer_score_log WHERE customer_id = ?', [customerId]);
    if (matchedRules.length > 0) {
      const logValues = matchedRules.map(r => [customerId, r.id, r.score, totalScore, `规则"${r.name}"命中`]);
      await pool.query(
        'INSERT INTO crm_customer_score_log (customer_id, rule_id, score, total_score, remark) VALUES ?',
        [logValues]
      );
    }

    res.json({
      code: 200, message: '评分计算完成',
      data: { customer_id: customerId, score: totalScore, matched_rules: matchedRules.map(r => r.name) }
    });
  } catch (error) {
    console.error('[评分] 计算评分失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量计算所有客户评分
router.post('/batch-calculate', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res) => {
  try {
    const [customers] = await pool.query('SELECT id FROM crm_customer WHERE deleted_at IS NULL');
    const [rules] = await pool.query('SELECT * FROM crm_score_rule WHERE status = 1');

    let processed = 0;
    for (const customer of customers) {
      const [[stats]] = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM crm_follow_up WHERE customer_id = ?) as followup_count,
          (SELECT COUNT(*) FROM crm_quote WHERE customer_id = ? AND deleted_at IS NULL) as quote_count,
          (SELECT COUNT(*) FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL) as contract_count,
          (SELECT DATEDIFF(NOW(), MAX(create_time)) FROM crm_follow_up WHERE customer_id = ?) as last_followup_days
      `, [customer.id, customer.id, customer.id, customer.id]);

      const [[custRow]] = await pool.query('SELECT source FROM crm_customer WHERE id = ?', [customer.id]);

      let totalScore = 0;
      const matchedRules = [];

      for (const rule of rules) {
        const fieldValue = getFieldValue(rule.condition_field, custRow, stats);
        let matched = false;

        switch (rule.condition_operator) {
          case 'eq': matched = String(fieldValue) === String(rule.condition_value); break;
          case 'gt': matched = parseFloat(fieldValue) > parseFloat(rule.condition_value); break;
          case 'lt': matched = parseFloat(fieldValue) < parseFloat(rule.condition_value); break;
          case 'contains': matched = String(fieldValue).includes(String(rule.condition_value)); break;
        }

        if (matched) {
          totalScore += rule.score;
          matchedRules.push(rule);
        }
      }

      await pool.query('UPDATE crm_customer SET score = ? WHERE id = ?', [totalScore, customer.id]);

      await pool.query('DELETE FROM crm_customer_score_log WHERE customer_id = ?', [customer.id]);
      if (matchedRules.length > 0) {
        const logValues = matchedRules.map(r => [customer.id, r.id, r.score, totalScore, `规则"${r.name}"命中`]);
        await pool.query(
          'INSERT INTO crm_customer_score_log (customer_id, rule_id, score, total_score, remark) VALUES ?',
          [logValues]
        );
      }
      processed++;
    }

    res.json({ code: 200, message: '批量评分完成', data: { processed } });
  } catch (error) {
    console.error('[评分] 批量评分失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 评分排行榜
router.get('/ranking', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, company_name, score, level, owner_id,
             (SELECT real_name FROM sys_user WHERE id = crm_customer.owner_id) as owner_name
      FROM crm_customer
      WHERE deleted_at IS NULL AND score > 0
      ORDER BY score DESC
      LIMIT 20
    `);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[评分] 排行榜查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 获取客户评分详情（含评分历史）
router.get('/customer/:customerId', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const { customerId } = req.params;
    const [[customer]] = await pool.query(
      'SELECT id, company_name, score FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
      [customerId]
    );
    if (!customer) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    }

    const [logs] = await pool.query(`
      SELECT l.*, r.name as rule_name, r.condition_type
      FROM crm_customer_score_log l
      LEFT JOIN crm_score_rule r ON l.rule_id = r.id
      WHERE l.customer_id = ?
      ORDER BY l.create_time DESC
      LIMIT 50
    `, [customerId]);

    res.json({ code: 200, message: '查询成功', data: { customer, logs } });
  } catch (error) {
    console.error('[评分] 客户评分详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 辅助函数：获取字段值
function getFieldValue(field, customer, stats) {
  switch (field) {
    case 'source': return customer.source || '';
    case 'followup_count': return stats.followup_count || 0;
    case 'quote_count': return stats.quote_count || 0;
    case 'contract_count': return stats.contract_count || 0;
    case 'last_followup_days': return stats.last_followup_days ?? 999;
    default: return '';
  }
}

module.exports = router;

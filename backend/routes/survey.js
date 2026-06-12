const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 管理员权限检查
const requireAdmin = (req, res, next) => {
  if (req.user.manageAll || req.user.roleId === 1) return next();
  return res.status(403).json({ code: 403, message: '需要管理员权限', data: null });
};

// 可选认证（公开接口也支持登录用户）
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch { /* */ }
  }
  next();
};

// ============ 模板管理 ============

// 模板列表
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM crm_survey_template WHERE deleted_at IS NULL');
    const [rows] = await pool.query(
      'SELECT * FROM crm_survey_template WHERE deleted_at IS NULL ORDER BY is_system DESC, create_time DESC LIMIT ? OFFSET ?',
      [parseInt(pageSize), offset]
    );
    res.json({ code: 200, message: '查询成功', data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('[调查] 模板列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建模板
router.post('/templates', authenticateToken, async (req, res) => {
  try {
    const { name, description, survey_type, questions } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '模板名称不能为空', data: null });
    if (!questions) return res.status(400).json({ code: 400, message: '问题配置不能为空', data: null });
    const questionsStr = typeof questions === 'string' ? questions : JSON.stringify(questions);
    const [result] = await pool.query(
      'INSERT INTO crm_survey_template (name, description, survey_type, questions, create_by) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), description || null, survey_type || 'csat', questionsStr, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[调查] 创建模板失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新模板
router.put('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.query('SELECT * FROM crm_survey_template WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) return res.status(404).json({ code: 404, message: '模板不存在', data: null });
    if (existing.is_system) return res.status(403).json({ code: 403, message: '不能修改系统预设模板', data: null });

    const { name, description, survey_type, questions } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (survey_type !== undefined) { fields.push('survey_type = ?'); values.push(survey_type); }
    if (questions !== undefined) { fields.push('questions = ?'); values.push(typeof questions === 'string' ? questions : JSON.stringify(questions)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(id);
    await pool.query(`UPDATE crm_survey_template SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[调查] 更新模板失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除模板
router.delete('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const [[existing]] = await pool.query('SELECT is_system FROM crm_survey_template WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!existing) return res.status(404).json({ code: 404, message: '模板不存在', data: null });
    if (existing.is_system) return res.status(403).json({ code: 403, message: '不能删除系统预设模板', data: null });
    await pool.query('UPDATE crm_survey_template SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[调查] 删除模板失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 初始化系统预设模板
router.post('/templates/init', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_survey_template WHERE is_system = 1 AND deleted_at IS NULL');
    if (cnt > 0) return res.json({ code: 200, message: '预设模板已存在', data: { count: cnt } });

    const templates = [
      { name: 'NPS净推荐值调查', survey_type: 'nps', questions: JSON.stringify([{ type: 'nps', question: '您有多大可能向朋友或同事推荐我们的产品/服务？', scale: '0-10' }, { type: 'text', question: '请告诉我们您给出这个分数的原因：' }]) },
      { name: '服务满意度调查', survey_type: 'csat', questions: JSON.stringify([{ type: 'rating', question: '您对我们的产品质量满意吗？', scale: '1-5' }, { type: 'rating', question: '您对我们的售后服务满意吗？', scale: '1-5' }, { type: 'rating', question: '您对我们的交货速度满意吗？', scale: '1-5' }, { type: 'text', question: '您有什么建议或意见？' }]) },
      { name: '综合满意度调查', survey_type: 'csat', questions: JSON.stringify([{ type: 'rating', question: '总体满意度', scale: '1-5' }, { type: 'rating', question: '产品性价比', scale: '1-5' }, { type: 'rating', question: '沟通响应速度', scale: '1-5' }, { type: 'nps', question: '推荐意愿', scale: '0-10' }, { type: 'text', question: '其他建议' }]) }
    ];

    for (const t of templates) {
      await pool.query(
        'INSERT INTO crm_survey_template (name, survey_type, questions, is_system) VALUES (?, ?, ?, 1)',
        [t.name, t.survey_type, t.questions]
      );
    }
    res.json({ code: 200, message: '初始化成功', data: { count: 3 } });
  } catch (error) {
    console.error('[调查] 初始化预设模板失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 活动管理 ============

// 活动列表
router.get('/campaigns', authenticateToken, async (req, res) => {
  try {
    const { status = '' } = req.query;
    let where = 'WHERE c.deleted_at IS NULL';
    const params = [];
    if (status) { where += ' AND c.status = ?'; params.push(status); }
    const [rows] = await pool.query(`
      SELECT c.*, t.name as template_name, t.survey_type, u.real_name as create_by_name
      FROM crm_survey_campaign c
      JOIN crm_survey_template t ON c.template_id = t.id
      LEFT JOIN sys_user u ON c.create_by = u.id
      ${where} ORDER BY c.create_time DESC
    `, params);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[调查] 活动列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 活动详情
router.get('/campaigns/:id', authenticateToken, async (req, res) => {
  try {
    const [[row]] = await pool.query(`
      SELECT c.*, t.name as template_name, t.survey_type, t.questions as template_questions
      FROM crm_survey_campaign c
      JOIN crm_survey_template t ON c.template_id = t.id
      WHERE c.id = ? AND c.deleted_at IS NULL
    `, [req.params.id]);
    if (!row) return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[调查] 活动详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建活动
router.post('/campaigns', authenticateToken, async (req, res) => {
  try {
    const { name, template_id, target_type, target_ids, send_method, start_date, end_date } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '活动名称不能为空', data: null });
    if (!template_id) return res.status(400).json({ code: 400, message: '请选择调查模板', data: null });
    const [result] = await pool.query(
      'INSERT INTO crm_survey_campaign (name, template_id, target_type, target_ids, send_method, start_date, end_date, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), template_id, target_type || 'all', target_ids ? (typeof target_ids === 'string' ? target_ids : JSON.stringify(target_ids)) : null, send_method || 'link', start_date || null, end_date || null, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[调查] 创建活动失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新活动
router.put('/campaigns/:id', authenticateToken, async (req, res) => {
  try {
    const [[existing]] = await pool.query('SELECT status FROM crm_survey_campaign WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!existing) return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    if (existing.status !== 'draft') return res.status(400).json({ code: 400, message: '只能编辑草稿状态的活动', data: null });

    const { name, template_id, target_type, target_ids, send_method, start_date, end_date } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (template_id !== undefined) { fields.push('template_id = ?'); values.push(template_id); }
    if (target_type !== undefined) { fields.push('target_type = ?'); values.push(target_type); }
    if (target_ids !== undefined) { fields.push('target_ids = ?'); values.push(typeof target_ids === 'string' ? target_ids : JSON.stringify(target_ids)); }
    if (send_method !== undefined) { fields.push('send_method = ?'); values.push(send_method); }
    if (start_date !== undefined) { fields.push('start_date = ?'); values.push(start_date); }
    if (end_date !== undefined) { fields.push('end_date = ?'); values.push(end_date); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_survey_campaign SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[调查] 更新活动失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 启动活动
router.post('/campaigns/:id/start', authenticateToken, async (req, res) => {
  try {
    const [[existing]] = await pool.query('SELECT status FROM crm_survey_campaign WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!existing) return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    if (existing.status !== 'draft') return res.status(400).json({ code: 400, message: '只有草稿状态的活动可以启动', data: null });

    // 计算目标客户数
    const [[campaign]] = await pool.query('SELECT target_type, target_ids FROM crm_survey_campaign WHERE id = ?', [req.params.id]);
    let totalSent = 0;
    if (campaign.target_type === 'all') {
      const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_customer WHERE deleted_at IS NULL AND status = 1");
      totalSent = cnt;
    } else if (campaign.target_ids) {
      try { totalSent = JSON.parse(campaign.target_ids).length; } catch { totalSent = 0; }
    }

    await pool.query("UPDATE crm_survey_campaign SET status = 'active', total_sent = ? WHERE id = ?", [totalSent, req.params.id]);
    res.json({ code: 200, message: '活动已启动', data: { total_sent: totalSent } });
  } catch (error) {
    console.error('[调查] 启动活动失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 关闭活动
router.post('/campaigns/:id/close', authenticateToken, async (req, res) => {
  try {
    const [[existing]] = await pool.query('SELECT status FROM crm_survey_campaign WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!existing) return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    if (existing.status !== 'active') return res.status(400).json({ code: 400, message: '只有进行中的活动可以关闭', data: null });
    await pool.query("UPDATE crm_survey_campaign SET status = 'closed' WHERE id = ?", [req.params.id]);
    res.json({ code: 200, message: '活动已关闭', data: null });
  } catch (error) {
    console.error('[调查] 关闭活动失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 回复接口 ============

// 提交回复（公开接口，不需要登录）
router.post('/respond/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { answers, customer_id, respondent_name, respondent_contact } = req.body;

    // 验证活动状态
    const [[campaign]] = await pool.query(
      "SELECT id, status, template_id FROM crm_survey_campaign WHERE id = ? AND status = 'active' AND deleted_at IS NULL",
      [campaign_id]
    );
    if (!campaign) return res.status(400).json({ code: 400, message: '调查活动不存在或已关闭', data: null });

    if (!answers) return res.status(400).json({ code: 400, message: '请填写回答', data: null });
    const answersStr = typeof answers === 'string' ? answers : JSON.stringify(answers);

    // 获取模板计算NPS/CSAT
    const [[template]] = await pool.query('SELECT questions FROM crm_survey_template WHERE id = ?', [campaign.template_id]);
    let questions = [];
    try { questions = JSON.parse(template.questions); } catch { /* */ }

    // 计算NPS和CSAT分数
    let answersObj;
    try {
      answersObj = typeof answers === 'string' ? JSON.parse(answers) : answers;
    } catch (e) {
      return res.status(400).json({ code: 400, message: 'answers 格式错误', data: null });
    }
    let npsScore = null, csatScores = [];

    questions.forEach((q, idx) => {
      const key = q.type === 'nps' ? 'nps_score' : (q.type === 'rating' ? `q${idx + 1}` : null);
      if (key && answersObj[key] !== undefined) {
        const val = parseInt(answersObj[key]);
        if (q.type === 'nps' && val >= 0 && val <= 10) npsScore = val;
        if (q.type === 'rating' && val >= 1 && val <= 5) csatScores.push(val);
      }
    });

    const csatScore = csatScores.length > 0 ? (csatScores.reduce((a, b) => a + b, 0) / csatScores.length).toFixed(1) : null;

    await pool.query(
      'INSERT INTO crm_survey_response (campaign_id, customer_id, answers, nps_score, csat_score, respondent_name, respondent_contact) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [campaign_id, customer_id || null, answersStr, npsScore, csatScore, respondent_name || null, respondent_contact || null]
    );

    // 更新回复数
    await pool.query('UPDATE crm_survey_campaign SET total_responded = total_responded + 1 WHERE id = ?', [campaign_id]);

    res.json({ code: 200, message: '感谢您的反馈！', data: null });
  } catch (error) {
    console.error('[调查] 提交回复失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 查看回复列表
router.get('/campaigns/:id/responses', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM crm_survey_response WHERE campaign_id = ?', [req.params.id]);
    const [rows] = await pool.query(`
      SELECT r.*, c.company_name
      FROM crm_survey_response r
      LEFT JOIN crm_customer c ON r.customer_id = c.id
      WHERE r.campaign_id = ? ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?
    `, [req.params.id, parseInt(pageSize), offset]);
    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[调查] 回复列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 分析接口 ============

// 整体满意度概览（必须在 :campaign_id 之前定义，否则 overview 会被当作参数）
router.get('/analytics/overview', authenticateToken, async (req, res) => {
  try {
    const [npsTrend] = await pool.query(`
      SELECT DATE_FORMAT(r.submitted_at, '%Y-%m') as month,
             AVG(r.nps_score) as avg_nps, COUNT(*) as count
      FROM crm_survey_response r
      JOIN crm_survey_campaign c ON r.campaign_id = c.id
      WHERE r.nps_score IS NOT NULL AND r.submitted_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month ORDER BY month
    `);

    const [csatTrend] = await pool.query(`
      SELECT DATE_FORMAT(r.submitted_at, '%Y-%m') as month,
             AVG(r.csat_score) as avg_csat, COUNT(*) as count
      FROM crm_survey_response r
      JOIN crm_survey_campaign c ON r.campaign_id = c.id
      WHERE r.csat_score IS NOT NULL AND r.submitted_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month ORDER BY month
    `);

    const [campaignStats] = await pool.query(`
      SELECT c.id, c.name, c.total_sent, c.total_responded,
             CASE WHEN c.total_sent > 0 THEN ROUND(c.total_responded / c.total_sent * 100) ELSE 0 END as response_rate
      FROM crm_survey_campaign c WHERE c.deleted_at IS NULL AND c.status != 'draft'
      ORDER BY c.create_time DESC LIMIT 10
    `);

    const [[latest]] = await pool.query(`
      SELECT c.*, t.survey_type FROM crm_survey_campaign c
      JOIN crm_survey_template t ON c.template_id = t.id
      WHERE c.deleted_at IS NULL AND c.status = 'closed'
      ORDER BY c.create_time DESC LIMIT 1
    `);

    let latestData = null;
    if (latest) {
      const [[{ avg_nps }]] = await pool.query('SELECT AVG(nps_score) as avg_nps FROM crm_survey_response WHERE campaign_id = ? AND nps_score IS NOT NULL', [latest.id]);
      const [[{ avg_csat }]] = await pool.query('SELECT AVG(csat_score) as avg_csat FROM crm_survey_response WHERE campaign_id = ? AND csat_score IS NOT NULL', [latest.id]);
      latestData = { name: latest.name, survey_type: latest.survey_type, total_responded: latest.total_responded, avg_nps: avg_nps ? Math.round(avg_nps) : null, avg_csat: avg_csat ? parseFloat(avg_csat).toFixed(1) : null };
    }

    const [[{ total_campaigns }]] = await pool.query("SELECT COUNT(*) as total_campaigns FROM crm_survey_campaign WHERE deleted_at IS NULL");
    const [[{ active_campaigns }]] = await pool.query("SELECT COUNT(*) as active_campaigns FROM crm_survey_campaign WHERE deleted_at IS NULL AND status = 'active'");
    const [[{ total_responses }]] = await pool.query("SELECT COUNT(*) as total_responses FROM crm_survey_response");
    const [[{ avg_nps_all }]] = await pool.query("SELECT AVG(nps_score) as avg_nps_all FROM crm_survey_response WHERE nps_score IS NOT NULL");

    res.json({
      code: 200, message: '查询成功',
      data: {
        stats: { total_campaigns, active_campaigns, total_responses, avg_nps: avg_nps_all ? Math.round(avg_nps_all) : 0 },
        npsTrend, csatTrend, campaignStats, latestData
      }
    });
  } catch (error) {
    console.error('[调查] 满意度概览查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 单个活动分析
router.get('/analytics/:campaign_id', authenticateToken, async (req, res) => {
  try {
    const { campaign_id } = req.params;

    // 获取活动和模板信息
    const [[campaign]] = await pool.query(`
      SELECT c.*, t.questions as template_questions, t.survey_type
      FROM crm_survey_campaign c JOIN crm_survey_template t ON c.template_id = t.id
      WHERE c.id = ? AND c.deleted_at IS NULL
    `, [campaign_id]);
    if (!campaign) return res.status(404).json({ code: 404, message: '活动不存在', data: null });

    // 回复率
    const responseRate = campaign.total_sent > 0 ? Math.round(campaign.total_responded / campaign.total_sent * 100) : 0;

    // NPS分析
    const [npsRows] = await pool.query('SELECT nps_score FROM crm_survey_response WHERE campaign_id = ? AND nps_score IS NOT NULL', [campaign_id]);
    const npsDistribution = Array(11).fill(0);
    npsRows.forEach(r => { if (r.nps_score >= 0 && r.nps_score <= 10) npsDistribution[r.nps_score]++; });
    const npsTotal = npsRows.length;
    const promoters = npsRows.filter(r => r.nps_score >= 9).length;
    const passives = npsRows.filter(r => r.nps_score >= 7 && r.nps_score <= 8).length;
    const detractors = npsRows.filter(r => r.nps_score <= 6).length;
    const npsValue = npsTotal > 0 ? Math.round((promoters / npsTotal - detractors / npsTotal) * 100) : 0;

    // CSAT分析
    const [csatRows] = await pool.query('SELECT csat_score FROM crm_survey_response WHERE campaign_id = ? AND csat_score IS NOT NULL', [campaign_id]);
    const csatDistribution = [0, 0, 0, 0, 0]; // 1-5星
    let csatSum = 0;
    csatRows.forEach(r => {
      const score = parseFloat(r.csat_score);
      csatSum += score;
      const rounded = Math.round(score);
      if (rounded >= 1 && rounded <= 5) csatDistribution[rounded - 1]++;
    });
    const csatAvg = csatRows.length > 0 ? (csatSum / csatRows.length).toFixed(1) : 0;

    // 文本回答
    const [textResponses] = await pool.query(`
      SELECT r.answers, r.respondent_name, r.submitted_at
      FROM crm_survey_response r WHERE r.campaign_id = ?
      ORDER BY r.submitted_at DESC LIMIT 50
    `, [campaign_id]);

    let questions = [];
    try { questions = JSON.parse(campaign.template_questions); } catch { /* */ }
    const textQuestions = questions.filter(q => q.type === 'text');
    const textAnswers = textResponses.map(r => {
      let ans = {};
      try { ans = JSON.parse(r.answers); } catch { /* */ }
      const texts = {};
      textQuestions.forEach((q, idx) => {
        const key = `q${questions.indexOf(q) + 1}_text`;
        if (ans[key]) texts[q.question] = ans[key];
      });
      return { name: r.respondent_name, time: r.submitted_at, texts };
    }).filter(r => Object.keys(r.texts).length > 0);

    res.json({
      code: 200, message: '查询成功',
      data: {
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status, survey_type: campaign.survey_type, total_sent: campaign.total_sent, total_responded: campaign.total_responded, response_rate: responseRate },
        nps: { value: npsValue, promoters, passives, detractors, distribution: npsDistribution, total: npsTotal },
        csat: { average: parseFloat(csatAvg), distribution: csatDistribution, total: csatRows.length },
        textAnswers
      }
    });
  } catch (error) {
    console.error('[调查] 活动分析查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

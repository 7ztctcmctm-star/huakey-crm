/**
 * 满意度调查服务层
 * 从 routes/survey.js 提取的业务逻辑：模板、活动、回复、分析
 */

// ============ 模板管理 ============

/**
 * 查询模板列表（分页）
 */
async function getTemplates(pool, { page = 1, pageSize = 20 }) {
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM crm_survey_template WHERE deleted_at IS NULL');
  const [rows] = await pool.query(
    `SELECT id, name, description, survey_type, questions, is_system, create_by, create_time, update_time, deleted_at
     FROM crm_survey_template WHERE deleted_at IS NULL ORDER BY is_system DESC, create_time DESC LIMIT ? OFFSET ?`,
    [parseInt(pageSize), offset]
  );
  return { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 创建模板
 */
async function createTemplate(pool, data, userId) {
  const { name, description, survey_type, questions } = data;
  const questionsStr = typeof questions === 'string' ? questions : JSON.stringify(questions);
  const [result] = await pool.query(
    'INSERT INTO crm_survey_template (name, description, survey_type, questions, create_by) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), description || null, survey_type || 'csat', questionsStr, userId]
  );
  return { id: result.insertId };
}

/**
 * 更新模板
 */
async function updateTemplate(pool, id, data) {
  const [[existing]] = await pool.query(
    `SELECT id, name, description, survey_type, questions, is_system, create_by, create_time, update_time, deleted_at
     FROM crm_survey_template WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (!existing) return { error: 'not_found' };
  if (existing.is_system) return { error: 'system_template' };

  const { name, description, survey_type, questions } = data;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (survey_type !== undefined) { fields.push('survey_type = ?'); values.push(survey_type); }
  if (questions !== undefined) { fields.push('questions = ?'); values.push(typeof questions === 'string' ? questions : JSON.stringify(questions)); }
  if (fields.length === 0) return { error: 'no_fields' };
  values.push(id);
  await pool.query(`UPDATE crm_survey_template SET ${fields.join(', ')} WHERE id = ?`, values);
  return { success: true };
}

/**
 * 删除模板
 */
async function deleteTemplate(pool, id) {
  const [[existing]] = await pool.query('SELECT is_system FROM crm_survey_template WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!existing) return { error: 'not_found' };
  if (existing.is_system) return { error: 'system_template' };
  await pool.query('UPDATE crm_survey_template SET deleted_at = NOW() WHERE id = ?', [id]);
  return { success: true };
}

/**
 * 初始化系统预设模板
 */
async function initTemplates(pool) {
  const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_survey_template WHERE is_system = 1 AND deleted_at IS NULL');
  if (cnt > 0) return { count: cnt };

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
  return { count: 3 };
}

// ============ 活动管理 ============

/**
 * 查询活动列表
 */
async function getCampaigns(pool, { status = '' }) {
  let where = 'WHERE c.deleted_at IS NULL';
  const params = [];
  if (status) { where += ' AND c.status = ?'; params.push(status); }
  const [rows] = await pool.query(`
    SELECT c.id, c.name, c.template_id, c.status, c.target_type, c.target_ids, c.send_method, c.total_sent, c.total_responded,
      c.start_date, c.end_date, c.create_by, c.create_time, c.update_time, c.deleted_at,
      t.name as template_name, t.survey_type, u.real_name as create_by_name
    FROM crm_survey_campaign c
    JOIN crm_survey_template t ON c.template_id = t.id
    LEFT JOIN sys_user u ON c.create_by = u.id
    ${where} ORDER BY c.create_time DESC
  `, params);
  return rows;
}

/**
 * 查询活动详情
 */
async function getCampaign(pool, id) {
  const [[row]] = await pool.query(`
    SELECT c.id, c.name, c.template_id, c.status, c.target_type, c.target_ids, c.send_method, c.total_sent, c.total_responded,
      c.start_date, c.end_date, c.create_by, c.create_time, c.update_time, c.deleted_at,
      t.name as template_name, t.survey_type, t.questions as template_questions
    FROM crm_survey_campaign c
    JOIN crm_survey_template t ON c.template_id = t.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `, [id]);
  return row || null;
}

/**
 * 创建活动
 */
async function createCampaign(pool, data, userId) {
  const { name, template_id, target_type, target_ids, send_method, start_date, end_date } = data;
  const [result] = await pool.query(
    'INSERT INTO crm_survey_campaign (name, template_id, target_type, target_ids, send_method, start_date, end_date, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name.trim(), template_id, target_type || 'all', target_ids ? (typeof target_ids === 'string' ? target_ids : JSON.stringify(target_ids)) : null, send_method || 'link', start_date || null, end_date || null, userId]
  );
  return { id: result.insertId };
}

/**
 * 更新活动
 */
async function updateCampaign(pool, id, data) {
  const [[existing]] = await pool.query('SELECT status FROM crm_survey_campaign WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!existing) return { error: 'not_found' };
  if (existing.status !== 'draft') return { error: 'not_draft' };

  const { name, template_id, target_type, target_ids, send_method, start_date, end_date } = data;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
  if (template_id !== undefined) { fields.push('template_id = ?'); values.push(template_id); }
  if (target_type !== undefined) { fields.push('target_type = ?'); values.push(target_type); }
  if (target_ids !== undefined) { fields.push('target_ids = ?'); values.push(typeof target_ids === 'string' ? target_ids : JSON.stringify(target_ids)); }
  if (send_method !== undefined) { fields.push('send_method = ?'); values.push(send_method); }
  if (start_date !== undefined) { fields.push('start_date = ?'); values.push(start_date); }
  if (end_date !== undefined) { fields.push('end_date = ?'); values.push(end_date); }
  if (fields.length === 0) return { error: 'no_fields' };
  values.push(id);
  await pool.query(`UPDATE crm_survey_campaign SET ${fields.join(', ')} WHERE id = ?`, values);
  return { success: true };
}

/**
 * 启动活动
 */
async function startCampaign(pool, id) {
  const [[existing]] = await pool.query('SELECT status FROM crm_survey_campaign WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!existing) return { error: 'not_found' };
  if (existing.status !== 'draft') return { error: 'not_draft' };

  const [[campaign]] = await pool.query('SELECT target_type, target_ids FROM crm_survey_campaign WHERE id = ?', [id]);
  let totalSent = 0;
  if (campaign.target_type === 'all') {
    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM crm_customer WHERE deleted_at IS NULL AND status = 'following'");
    totalSent = cnt;
  } else if (campaign.target_ids) {
    try { totalSent = JSON.parse(campaign.target_ids).length; } catch { totalSent = 0; }
  }

  await pool.query("UPDATE crm_survey_campaign SET status = 'active', total_sent = ? WHERE id = ?", [totalSent, id]);
  return { total_sent: totalSent };
}

/**
 * 关闭活动
 */
async function closeCampaign(pool, id) {
  const [[existing]] = await pool.query('SELECT status FROM crm_survey_campaign WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!existing) return { error: 'not_found' };
  if (existing.status !== 'active') return { error: 'not_active' };
  await pool.query("UPDATE crm_survey_campaign SET status = 'closed' WHERE id = ?", [id]);
  return { success: true };
}

// ============ 回复 ============

/**
 * 提交调查回复
 */
async function submitResponse(pool, campaignId, data) {
  const { answers, customer_id, respondent_name, respondent_contact } = data;

  const [[campaign]] = await pool.query(
    "SELECT id, status, template_id FROM crm_survey_campaign WHERE id = ? AND status = 'active' AND deleted_at IS NULL",
    [campaignId]
  );
  if (!campaign) return { error: 'not_active' };

  const answersStr = typeof answers === 'string' ? answers : JSON.stringify(answers);

  const [[template]] = await pool.query('SELECT questions FROM crm_survey_template WHERE id = ?', [campaign.template_id]);
  let questions = [];
  try { questions = JSON.parse(template.questions); } catch { /* */ }

  let answersObj;
  try {
    answersObj = typeof answers === 'string' ? JSON.parse(answers) : answers;
  } catch (e) {
    return { error: 'invalid_answers' };
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
    [campaignId, customer_id || null, answersStr, npsScore, csatScore, respondent_name || null, respondent_contact || null]
  );

  await pool.query('UPDATE crm_survey_campaign SET total_responded = total_responded + 1 WHERE id = ?', [campaignId]);
  return { success: true };
}

/**
 * 查询活动回复列表
 */
async function getCampaignResponses(pool, campaignId, { page = 1, pageSize = 20 }) {
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM crm_survey_response WHERE campaign_id = ?', [campaignId]);
  const [rows] = await pool.query(`
    SELECT r.id, r.campaign_id, r.customer_id, r.answers, r.nps_score, r.csat_score, r.respondent_name, r.respondent_contact, r.submitted_at,
      c.company_name
    FROM crm_survey_response r
    LEFT JOIN crm_customer c ON r.customer_id = c.id
    WHERE r.campaign_id = ? ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?
  `, [campaignId, parseInt(pageSize), offset]);
  return { list: rows, total };
}

// ============ 分析 ============

/**
 * 满意度概览
 */
async function getAnalyticsOverview(pool) {
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
    SELECT c.id, c.name, c.template_id, c.status, c.target_type, c.target_ids, c.send_method, c.total_sent, c.total_responded,
      c.start_date, c.end_date, c.create_by, c.create_time, c.update_time, c.deleted_at, t.survey_type
    FROM crm_survey_campaign c
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

  return {
    stats: { total_campaigns, active_campaigns, total_responses, avg_nps: avg_nps_all ? Math.round(avg_nps_all) : 0 },
    npsTrend, csatTrend, campaignStats, latestData
  };
}

/**
 * 单个活动分析
 */
async function getCampaignAnalytics(pool, campaignId) {
  const [[campaign]] = await pool.query(`
    SELECT c.id, c.name, c.template_id, c.status, c.target_type, c.target_ids, c.send_method, c.total_sent, c.total_responded,
      c.start_date, c.end_date, c.create_by, c.create_time, c.update_time, c.deleted_at,
      t.questions as template_questions, t.survey_type
    FROM crm_survey_campaign c JOIN crm_survey_template t ON c.template_id = t.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `, [campaignId]);
  if (!campaign) return null;

  const responseRate = campaign.total_sent > 0 ? Math.round(campaign.total_responded / campaign.total_sent * 100) : 0;

  const [npsRows] = await pool.query('SELECT nps_score FROM crm_survey_response WHERE campaign_id = ? AND nps_score IS NOT NULL', [campaignId]);
  const npsDistribution = Array(11).fill(0);
  npsRows.forEach(r => { if (r.nps_score >= 0 && r.nps_score <= 10) npsDistribution[r.nps_score]++; });
  const npsTotal = npsRows.length;
  const promoters = npsRows.filter(r => r.nps_score >= 9).length;
  const passives = npsRows.filter(r => r.nps_score >= 7 && r.nps_score <= 8).length;
  const detractors = npsRows.filter(r => r.nps_score <= 6).length;
  const npsValue = npsTotal > 0 ? Math.round((promoters / npsTotal - detractors / npsTotal) * 100) : 0;

  const [csatRows] = await pool.query('SELECT csat_score FROM crm_survey_response WHERE campaign_id = ? AND csat_score IS NOT NULL', [campaignId]);
  const csatDistribution = [0, 0, 0, 0, 0];
  let csatSum = 0;
  csatRows.forEach(r => {
    const score = parseFloat(r.csat_score);
    csatSum += score;
    const rounded = Math.round(score);
    if (rounded >= 1 && rounded <= 5) csatDistribution[rounded - 1]++;
  });
  const csatAvg = csatRows.length > 0 ? (csatSum / csatRows.length).toFixed(1) : 0;

  const [textResponses] = await pool.query(`
    SELECT r.answers, r.respondent_name, r.submitted_at
    FROM crm_survey_response r WHERE r.campaign_id = ?
    ORDER BY r.submitted_at DESC LIMIT 50
  `, [campaignId]);

  let questions = [];
  try { questions = JSON.parse(campaign.template_questions); } catch { /* */ }
  const textQuestions = questions.filter(q => q.type === 'text');
  const textAnswers = textResponses.map(r => {
    let ans = {};
    try { ans = JSON.parse(r.answers); } catch { /* */ }
    const texts = {};
    textQuestions.forEach((q) => {
      const key = `q${questions.indexOf(q) + 1}_text`;
      if (ans[key]) texts[q.question] = ans[key];
    });
    return { name: r.respondent_name, time: r.submitted_at, texts };
  }).filter(r => Object.keys(r.texts).length > 0);

  return {
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status, survey_type: campaign.survey_type, total_sent: campaign.total_sent, total_responded: campaign.total_responded, response_rate: responseRate },
    nps: { value: npsValue, promoters, passives, detractors, distribution: npsDistribution, total: npsTotal },
    csat: { average: parseFloat(csatAvg), distribution: csatDistribution, total: csatRows.length },
    textAnswers
  };
}

module.exports = {
  // 模板
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  initTemplates,
  // 活动
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  startCampaign,
  closeCampaign,
  // 回复
  submitResponse,
  getCampaignResponses,
  // 分析
  getAnalyticsOverview,
  getCampaignAnalytics
};

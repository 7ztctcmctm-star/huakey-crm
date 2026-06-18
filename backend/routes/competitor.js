const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// 竞争对手列表
router.get('/list', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const { industry, scale, status, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE c.deleted_at IS NULL';
    const params = [];
    if (industry) { where += ' AND c.industry = ?'; params.push(industry); }
    if (scale) { where += ' AND c.scale = ?'; params.push(scale); }
    if (status !== undefined && status !== '') { where += ' AND c.status = ?'; params.push(parseInt(status)); }
    if (keyword) { where += ' AND (c.name LIKE ? OR c.products LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_competitor c ${where}`, params);
    const [rows] = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.deleted_at IS NULL) as encounter_count,
        (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.encounter_type = 'won' AND e.deleted_at IS NULL) as win_count
      FROM crm_competitor c ${where} ORDER BY c.name LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('[竞品] 列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 竞争对手详情
router.get('/:id', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const [[row]] = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.deleted_at IS NULL) as encounter_count,
        (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.encounter_type = 'won' AND e.deleted_at IS NULL) as win_count
      FROM crm_competitor c WHERE c.id = ? AND c.deleted_at IS NULL
    `, [req.params.id]);
    if (!row) return res.status(404).json({ code: 404, message: '竞争对手不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[竞品] 详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建竞争对手
router.post('/add', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const { name, website, industry, scale, headquarters, strengths, weaknesses, products, price_range, market_share, description } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '名称不能为空', data: null });
    const strengthsStr = Array.isArray(strengths) ? JSON.stringify(strengths) : strengths;
    const weaknessesStr = Array.isArray(weaknesses) ? JSON.stringify(weaknesses) : weaknesses;
    const [result] = await pool.query(
      `INSERT INTO crm_competitor (name, website, industry, scale, headquarters, strengths, weaknesses, products, price_range, market_share, description, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, website || null, industry || null, scale || null, headquarters || null, strengthsStr, weaknessesStr, products || null, price_range || null, market_share || null, description || null, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[竞品] 创建失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新竞争对手
router.put('/:id', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const { name, website, industry, scale, headquarters, strengths, weaknesses, products, price_range, market_share, description, status } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (website !== undefined) { fields.push('website = ?'); values.push(website); }
    if (industry !== undefined) { fields.push('industry = ?'); values.push(industry); }
    if (scale !== undefined) { fields.push('scale = ?'); values.push(scale); }
    if (headquarters !== undefined) { fields.push('headquarters = ?'); values.push(headquarters); }
    if (strengths !== undefined) { fields.push('strengths = ?'); values.push(Array.isArray(strengths) ? JSON.stringify(strengths) : strengths); }
    if (weaknesses !== undefined) { fields.push('weaknesses = ?'); values.push(Array.isArray(weaknesses) ? JSON.stringify(weaknesses) : weaknesses); }
    if (products !== undefined) { fields.push('products = ?'); values.push(products); }
    if (price_range !== undefined) { fields.push('price_range = ?'); values.push(price_range); }
    if (market_share !== undefined) { fields.push('market_share = ?'); values.push(market_share); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_competitor SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[竞品] 更新失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除竞争对手
router.delete('/:id', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    await pool.query('UPDATE crm_competitor SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[竞品] 删除失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 交锋记录 ============

router.get('/:id/encounters', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, c.company_name as customer_name, u.real_name as create_by_name
      FROM crm_competitor_encounter e
      LEFT JOIN crm_customer c ON e.customer_id = c.id
      LEFT JOIN sys_user u ON e.create_by = u.id
      WHERE e.competitor_id = ? AND e.deleted_at IS NULL ORDER BY e.encounter_date DESC
    `, [req.params.id]);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[竞品] 交锋记录查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/encounters/add', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const { competitor_id, customer_id, opportunity_id, encounter_type, our_price, their_price, win_reason, our_advantage, their_advantage, lesson_learned, encounter_date } = req.body;
    if (!competitor_id || !encounter_type) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const [result] = await pool.query(
      `INSERT INTO crm_competitor_encounter (competitor_id, customer_id, opportunity_id, encounter_type, our_price, their_price, win_reason, our_advantage, their_advantage, lesson_learned, encounter_date, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [competitor_id, customer_id || null, opportunity_id || null, encounter_type, our_price || null, their_price || null, win_reason || null, our_advantage || null, their_advantage || null, lesson_learned || null, encounter_date || null, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[竞品] 创建交锋记录失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/encounters/:id', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const fields = [], values = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (['encounter_type', 'our_price', 'their_price', 'win_reason', 'our_advantage', 'their_advantage', 'lesson_learned', 'encounter_date'].includes(k)) {
        fields.push(`${k} = ?`); values.push(v);
      }
    }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_competitor_encounter SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[竞品] 更新交锋记录失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/encounters/:id', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    await pool.query('UPDATE crm_competitor_encounter SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[竞品] 删除交锋记录失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 情报 ============

router.get('/:id/intel', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.*, u.real_name as create_by_name
      FROM crm_competitor_intel i LEFT JOIN sys_user u ON i.create_by = u.id
      WHERE i.competitor_id = ? AND i.deleted_at IS NULL ORDER BY i.importance DESC, i.create_time DESC
    `, [req.params.id]);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[竞品] 情报查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/intel/add', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const { competitor_id, intel_type, title, content, source, importance } = req.body;
    if (!competitor_id || !intel_type || !title || !content) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const [result] = await pool.query(
      'INSERT INTO crm_competitor_intel (competitor_id, intel_type, title, content, source, importance, create_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [competitor_id, intel_type, title, content, source || null, importance || 'medium', req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[竞品] 创建情报失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/intel/:id', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const fields = [], values = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (['intel_type', 'title', 'content', 'source', 'importance', 'verified'].includes(k)) {
        fields.push(`${k} = ?`); values.push(v);
      }
    }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_competitor_intel SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[竞品] 更新情报失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/intel/:id', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    await pool.query('UPDATE crm_competitor_intel SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[竞品] 删除情报失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 分析总览 ============

router.get('/analysis/overview', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const [[{ total_competitors }]] = await pool.query('SELECT COUNT(*) as total_competitors FROM crm_competitor WHERE deleted_at IS NULL');
    const [[{ total_encounters }]] = await pool.query('SELECT COUNT(*) as total_encounters FROM crm_competitor_encounter WHERE deleted_at IS NULL');
    const [[{ total_won }]] = await pool.query("SELECT COUNT(*) as total_won FROM crm_competitor_encounter WHERE encounter_type = 'won' AND deleted_at IS NULL");
    const [[{ total_lost }]] = await pool.query("SELECT COUNT(*) as total_lost FROM crm_competitor_encounter WHERE encounter_type = 'lost' AND deleted_at IS NULL");
    const winRate = (total_won + total_lost) > 0 ? Math.round(total_won / (total_won + total_lost) * 100) : 0;

    // 各对手交锋次数
    const [encounterByComp] = await pool.query(`
      SELECT c.name, COUNT(e.id) as count,
             SUM(CASE WHEN e.encounter_type = 'won' THEN 1 ELSE 0 END) as wins,
             SUM(CASE WHEN e.encounter_type = 'lost' THEN 1 ELSE 0 END) as losses
      FROM crm_competitor c
      LEFT JOIN crm_competitor_encounter e ON c.id = e.competitor_id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id ORDER BY count DESC LIMIT 10
    `);

    // 赢单/丢单原因分析
    const [reasons] = await pool.query(`
      SELECT win_reason as name, COUNT(*) as value
      FROM crm_competitor_encounter
      WHERE deleted_at IS NULL AND encounter_type IN ('won', 'lost') AND win_reason IS NOT NULL AND win_reason != ''
      GROUP BY win_reason ORDER BY value DESC LIMIT 10
    `);

    // 最近交锋记录
    const [recentEncounters] = await pool.query(`
      SELECT e.*, c.name as competitor_name, cu.company_name as customer_name
      FROM crm_competitor_encounter e
      JOIN crm_competitor c ON e.competitor_id = c.id
      LEFT JOIN crm_customer cu ON e.customer_id = cu.id
      WHERE e.deleted_at IS NULL
      ORDER BY e.encounter_date DESC LIMIT 10
    `);

    res.json({
      code: 200, message: '查询成功',
      data: { total_competitors, total_encounters, win_rate: winRate, encounter_by_comp: encounterByComp, reasons, recent_encounters: recentEncounters }
    });
  } catch (error) {
    console.error('[竞品] 分析总览查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 竞争对手对比
router.get('/analysis/compare', authenticateToken, checkPermission('competitor'), async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ code: 400, message: '请选择竞争对手', data: null });
    const placeholders = ids.map(() => '?').join(',');

    const [competitors] = await pool.query(
      `SELECT * FROM crm_competitor WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids
    );

    // 批量查询统计数据（避免 N+1）
    const [stats] = await pool.query(
      `SELECT competitor_id,
         COUNT(*) as encounters,
         SUM(CASE WHEN encounter_type = 'won' THEN 1 ELSE 0 END) as wins,
         SUM(CASE WHEN encounter_type = 'lost' THEN 1 ELSE 0 END) as losses
       FROM crm_competitor_encounter
       WHERE competitor_id IN (${placeholders}) AND deleted_at IS NULL
       GROUP BY competitor_id`,
      ids
    );
    const statMap = {};
    stats.forEach(s => { statMap[s.competitor_id] = s; });

    const result = competitors.map(comp => {
      const s = statMap[comp.id] || { encounters: 0, wins: 0, losses: 0 };
      const winRate = (s.wins + s.losses) > 0 ? Math.round(s.wins / (s.wins + s.losses) * 100) : 0;
      let strengths = [], weaknesses = [];
      try { strengths = JSON.parse(comp.strengths || '[]'); } catch { /* */ }
      try { weaknesses = JSON.parse(comp.weaknesses || '[]'); } catch { /* */ }
      return { id: comp.id, name: comp.name, strengths, weaknesses, encounters: s.encounters, wins: s.wins, losses: s.losses, win_rate: winRate };
    });

    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('[竞品] 对比查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

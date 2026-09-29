/**
 * 竞品核心服务层
 * 从 routes/competitor.js 提取的业务逻辑
 */

const { buildDataPermissionWhere } = require('../middleware/permission');

// ============ 竞争对手 CRUD ============

async function listCompetitors(pool, params = {}, dataPermission) {
  const { industry, scale, status, keyword, page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE c.deleted_at IS NULL';
  const queryParams = [];
  if (industry) { where += ' AND c.industry = ?'; queryParams.push(industry); }
  if (scale) { where += ' AND c.scale = ?'; queryParams.push(scale); }
  if (status !== undefined && status !== '') { where += ' AND c.status = ?'; queryParams.push(parseInt(status)); }
  if (keyword) { where += ' AND (c.name LIKE ? OR c.products LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`); }

  // [2026-09-29 P0 安全修复] 强制数据权限过滤（默认 self，manager/boss 自动 all）
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  where += ` AND ${permClause}`;
  const allParams = [...permParams, ...queryParams];

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_competitor c ${where}`, allParams);
  const [rows] = await pool.query(`
    SELECT c.id, c.name, c.website, c.industry, c.scale, c.headquarters, c.strengths, c.weaknesses, c.products, c.price_range, c.market_share, c.description, c.status, c.create_by, c.create_time, c.update_time, c.deleted_at,
      (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.deleted_at IS NULL) as encounter_count,
      (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.encounter_type = 'won' AND e.deleted_at IS NULL) as win_count
    FROM crm_competitor c ${where} ORDER BY c.name LIMIT ? OFFSET ?
  `, [...allParams, parseInt(pageSize), offset]);

  return { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

async function getCompetitor(pool, id, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const [[row]] = await pool.query(`
    SELECT c.id, c.name, c.website, c.industry, c.scale, c.headquarters, c.strengths, c.weaknesses, c.products, c.price_range, c.market_share, c.description, c.status, c.create_by, c.create_time, c.update_time, c.deleted_at,
      (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.deleted_at IS NULL) as encounter_count,
      (SELECT COUNT(*) FROM crm_competitor_encounter e WHERE e.competitor_id = c.id AND e.encounter_type = 'won' AND e.deleted_at IS NULL) as win_count
    FROM crm_competitor c WHERE c.id = ? AND c.deleted_at IS NULL AND ${permClause}
  `, [id, ...permParams]);
  return row || null;
}

async function createCompetitor(pool, data, userId) {
  const { name, website, industry, scale, headquarters, strengths, weaknesses, products, price_range, market_share, description } = data;
  const strengthsStr = Array.isArray(strengths) ? JSON.stringify(strengths) : strengths;
  const weaknessesStr = Array.isArray(weaknesses) ? JSON.stringify(weaknesses) : weaknesses;
  const [result] = await pool.query(
    `INSERT INTO crm_competitor (name, website, industry, scale, headquarters, strengths, weaknesses, products, price_range, market_share, description, create_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, website || null, industry || null, scale || null, headquarters || null, strengthsStr, weaknessesStr, products || null, price_range || null, market_share || null, description || null, userId]
  );
  return { id: result.insertId };
}

async function updateCompetitor(pool, id, data, dataPermission) {
  const fields = [], values = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.website !== undefined) { fields.push('website = ?'); values.push(data.website); }
  if (data.industry !== undefined) { fields.push('industry = ?'); values.push(data.industry); }
  if (data.scale !== undefined) { fields.push('scale = ?'); values.push(data.scale); }
  if (data.headquarters !== undefined) { fields.push('headquarters = ?'); values.push(data.headquarters); }
  if (data.strengths !== undefined) { fields.push('strengths = ?'); values.push(Array.isArray(data.strengths) ? JSON.stringify(data.strengths) : data.strengths); }
  if (data.weaknesses !== undefined) { fields.push('weaknesses = ?'); values.push(Array.isArray(data.weaknesses) ? JSON.stringify(data.weaknesses) : data.weaknesses); }
  if (data.products !== undefined) { fields.push('products = ?'); values.push(data.products); }
  if (data.price_range !== undefined) { fields.push('price_range = ?'); values.push(data.price_range); }
  if (data.market_share !== undefined) { fields.push('market_share = ?'); values.push(data.market_share); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(parseInt(data.status)); }
  if (fields.length === 0) return;
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  values.push(id, ...permParams);
  await pool.query(`UPDATE crm_competitor SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL AND ${permClause}`, values);
}

async function deleteCompetitor(pool, id, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  await pool.query(`UPDATE crm_competitor SET deleted_at = NOW() WHERE id = ? AND ${permClause}`, [id, ...permParams]);
}

// ============ 交锋记录 ============

async function getEncounters(pool, competitorId, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const [rows] = await pool.query(`
    SELECT e.id, e.competitor_id, e.customer_id, e.opportunity_id, e.encounter_type, e.our_price, e.their_price, e.win_reason, e.our_advantage, e.their_advantage, e.lesson_learned, e.encounter_date, e.create_by, e.create_time, c.company_name as customer_name, u.real_name as create_by_name
    FROM crm_competitor_encounter e
    INNER JOIN crm_competitor parent ON e.competitor_id = parent.id
    LEFT JOIN crm_customer c ON e.customer_id = c.id
    LEFT JOIN sys_user u ON e.create_by = u.id
    WHERE e.competitor_id = ? AND e.deleted_at IS NULL AND parent.deleted_at IS NULL AND ${permClause}
    ORDER BY e.encounter_date DESC
  `, [competitorId, ...permParams]);
  return rows;
}

async function addEncounter(pool, data, userId, dataPermission) {
  // 先验证 parent competitor 权限
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const [[parentOk]] = await pool.query(
    `SELECT c.id FROM crm_competitor c WHERE c.id = ? AND c.deleted_at IS NULL AND ${permClause}`,
    [data.competitor_id, ...permParams]
  );
  if (!parentOk) {
    const err = new Error('无权访问该竞品');
    err.statusCode = 403;
    throw err;
  }

  const { competitor_id, customer_id, opportunity_id, encounter_type, our_price, their_price, win_reason, our_advantage, their_advantage, lesson_learned, encounter_date } = data;
  const [result] = await pool.query(
    `INSERT INTO crm_competitor_encounter (competitor_id, customer_id, opportunity_id, encounter_type, our_price, their_price, win_reason, our_advantage, their_advantage, lesson_learned, encounter_date, create_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [competitor_id, customer_id || null, opportunity_id || null, encounter_type, our_price || null, their_price || null, win_reason || null, our_advantage || null, their_advantage || null, lesson_learned || null, encounter_date || null, userId]
  );
  return { id: result.insertId };
}

async function updateEncounter(pool, id, data, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const fields = [], values = [];
  for (const [k, v] of Object.entries(data)) {
    if (['encounter_type', 'our_price', 'their_price', 'win_reason', 'our_advantage', 'their_advantage', 'lesson_learned', 'encounter_date'].includes(k)) {
      fields.push(`${k} = ?`); values.push(v);
    }
  }
  if (fields.length === 0) return;
  values.push(id, ...permParams);
  await pool.query(
    `UPDATE crm_competitor_encounter SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM crm_competitor c WHERE c.id = (SELECT competitor_id FROM crm_competitor_encounter WHERE id = ?) AND c.deleted_at IS NULL AND ${permClause})`,
    [...values, id, ...permParams]
  );
}

async function deleteEncounter(pool, id, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  await pool.query(
    `UPDATE crm_competitor_encounter SET deleted_at = NOW() WHERE id = ?
     AND EXISTS (SELECT 1 FROM crm_competitor c WHERE c.id = (SELECT competitor_id FROM crm_competitor_encounter WHERE id = ?) AND c.deleted_at IS NULL AND ${permClause})`,
    [id, ...permParams, id, ...permParams]
  );
}

// ============ 情报 ============

async function getIntel(pool, competitorId, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const [rows] = await pool.query(`
    SELECT i.id, i.competitor_id, i.intel_type, i.title, i.content, i.source, i.importance, i.verified, i.create_by, i.create_time, u.real_name as create_by_name
    FROM crm_competitor_intel i
    INNER JOIN crm_competitor parent ON i.competitor_id = parent.id
    LEFT JOIN sys_user u ON i.create_by = u.id
    WHERE i.competitor_id = ? AND i.deleted_at IS NULL AND parent.deleted_at IS NULL AND ${permClause}
    ORDER BY i.importance DESC, i.create_time DESC
  `, [competitorId, ...permParams]);
  return rows;
}

async function addIntel(pool, data, userId, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const [[parentOk]] = await pool.query(
    `SELECT c.id FROM crm_competitor c WHERE c.id = ? AND c.deleted_at IS NULL AND ${permClause}`,
    [data.competitor_id, ...permParams]
  );
  if (!parentOk) {
    const err = new Error('无权访问该竞品');
    err.statusCode = 403;
    throw err;
  }
  const { competitor_id, intel_type, title, content, source, importance } = data;
  const [result] = await pool.query(
    'INSERT INTO crm_competitor_intel (competitor_id, intel_type, title, content, source, importance, create_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [competitor_id, intel_type, title, content, source || null, importance || 'medium', userId]
  );
  return { id: result.insertId };
}

async function updateIntel(pool, id, data, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const fields = [], values = [];
  for (const [k, v] of Object.entries(data)) {
    if (['intel_type', 'title', 'content', 'source', 'importance', 'verified'].includes(k)) {
      fields.push(`${k} = ?`); values.push(v);
    }
  }
  if (fields.length === 0) return;
  values.push(id, ...permParams);
  await pool.query(
    `UPDATE crm_competitor_intel SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM crm_competitor c WHERE c.id = (SELECT competitor_id FROM crm_competitor_intel WHERE id = ?) AND c.deleted_at IS NULL AND ${permClause})`,
    [...values, id, ...permParams]
  );
}

async function deleteIntel(pool, id, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  await pool.query(
    `UPDATE crm_competitor_intel SET deleted_at = NOW() WHERE id = ?
     AND EXISTS (SELECT 1 FROM crm_competitor c WHERE c.id = (SELECT competitor_id FROM crm_competitor_intel WHERE id = ?) AND c.deleted_at IS NULL AND ${permClause})`,
    [id, ...permParams, id, ...permParams]
  );
}

// ============ 分析 ============

async function getAnalysisOverview(pool, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const [[{ total_competitors }]] = await pool.query(
    `SELECT COUNT(*) as total_competitors FROM crm_competitor c WHERE c.deleted_at IS NULL AND ${permClause}`, permParams
  );
  const [[{ total_encounters }]] = await pool.query(
    `SELECT COUNT(*) as total_encounters FROM crm_competitor_encounter e
     INNER JOIN crm_competitor c ON e.competitor_id = c.id
     WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL AND ${permClause}`, permParams
  );
  const [[{ total_won }]] = await pool.query(
    `SELECT COUNT(*) as total_won FROM crm_competitor_encounter e
     INNER JOIN crm_competitor c ON e.competitor_id = c.id
     WHERE e.encounter_type = 'won' AND e.deleted_at IS NULL AND c.deleted_at IS NULL AND ${permClause}`, permParams
  );
  const [[{ total_lost }]] = await pool.query(
    `SELECT COUNT(*) as total_lost FROM crm_competitor_encounter e
     INNER JOIN crm_competitor c ON e.competitor_id = c.id
     WHERE e.encounter_type = 'lost' AND e.deleted_at IS NULL AND c.deleted_at IS NULL AND ${permClause}`, permParams
  );
  const winRate = (total_won + total_lost) > 0 ? Math.round(total_won / (total_won + total_lost) * 100) : 0;

  const [encounterByComp] = await pool.query(`
    SELECT c.name, COUNT(e.id) as count,
           SUM(CASE WHEN e.encounter_type = 'won' THEN 1 ELSE 0 END) as wins,
           SUM(CASE WHEN e.encounter_type = 'lost' THEN 1 ELSE 0 END) as losses
    FROM crm_competitor c
    LEFT JOIN crm_competitor_encounter e ON c.id = e.competitor_id AND e.deleted_at IS NULL
    WHERE c.deleted_at IS NULL AND ${permClause}
    GROUP BY c.id ORDER BY count DESC LIMIT 10
  `, permParams);

  const [reasons] = await pool.query(`
    SELECT win_reason as name, COUNT(*) as value
    FROM crm_competitor_encounter e
    INNER JOIN crm_competitor c ON e.competitor_id = c.id
    WHERE e.deleted_at IS NULL AND e.encounter_type IN ('won', 'lost') AND e.win_reason IS NOT NULL AND e.win_reason != ''
      AND c.deleted_at IS NULL AND ${permClause}
    GROUP BY win_reason ORDER BY value DESC LIMIT 10
  `, permParams);

  const [recentEncounters] = await pool.query(`
    SELECT e.id, e.competitor_id, e.customer_id, e.opportunity_id, e.encounter_type, e.our_price, e.their_price, e.win_reason, e.our_advantage, e.their_advantage, e.lesson_learned, e.encounter_date, e.create_by, e.create_time, c.name as competitor_name, cu.company_name as customer_name
    FROM crm_competitor_encounter e
    JOIN crm_competitor c ON e.competitor_id = c.id
    LEFT JOIN crm_customer cu ON e.customer_id = cu.id
    WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL AND ${permClause}
    ORDER BY e.encounter_date DESC LIMIT 10
  `, permParams);

  return { total_competitors, total_encounters, win_rate: winRate, encounter_by_comp: encounterByComp, reasons, recent_encounters: recentEncounters };
}

async function getComparison(pool, ids, dataPermission) {
  const { clause: permClause, params: permParams } = await buildDataPermissionWhere(dataPermission, 'c');
  const placeholders = ids.map(() => '?').join(',');

  const [competitors] = await pool.query(
    `SELECT id, name, website, industry, scale, headquarters, strengths, weaknesses, products, price_range, market_share, description, status, create_by, create_time, update_time, deleted_at
     FROM crm_competitor c WHERE id IN (${placeholders}) AND deleted_at IS NULL AND ${permClause}`,
    [...ids, ...permParams]
  );
  const allowedIds = competitors.map(c => c.id);
  const idPlaceholders = allowedIds.map(() => '?').join(',') || 'NULL';

  const [stats] = await pool.query(
    `SELECT competitor_id,
       COUNT(*) as encounters,
       SUM(CASE WHEN encounter_type = 'won' THEN 1 ELSE 0 END) as wins,
       SUM(CASE WHEN encounter_type = 'lost' THEN 1 ELSE 0 END) as losses
     FROM crm_competitor_encounter
     WHERE competitor_id IN (${idPlaceholders}) AND deleted_at IS NULL
     GROUP BY competitor_id`,
    allowedIds.length ? allowedIds : [0]
  );
  const statMap = {};
  stats.forEach(s => { statMap[s.competitor_id] = s; });

  return competitors.map(comp => {
    const s = statMap[comp.id] || { encounters: 0, wins: 0, losses: 0 };
    const winRate = (s.wins + s.losses) > 0 ? Math.round(s.wins / (s.wins + s.losses) * 100) : 0;
    let strengths = [], weaknesses = [];
    try { strengths = JSON.parse(comp.strengths || '[]'); } catch { /* */ }
    try { weaknesses = JSON.parse(comp.weaknesses || '[]'); } catch { /* */ }
    return { id: comp.id, name: comp.name, strengths, weaknesses, encounters: s.encounters, wins: s.wins, losses: s.losses, win_rate: winRate };
  });
}

module.exports = {
  listCompetitors, getCompetitor, createCompetitor, updateCompetitor, deleteCompetitor,
  getEncounters, addEncounter, updateEncounter, deleteEncounter,
  getIntel, addIntel, updateIntel, deleteIntel,
  getAnalysisOverview, getComparison
};

/**
 * 数据分析服务层
 * 从 routes/analysis.js 提取的业务逻辑
 *
 * [数据范围修复 2026-09-20]
 * 分析域此前**完全没有数据范围**：路由只有 checkPermission('analysis') + requireManager，
 * 服务函数不接收用户，SQL 无归属过滤 ⇒ 一旦通过闸门即看到**全公司**分析数据。
 * 而 requireManager 只放行 manageAll/super_admin/roleId===1，会把持有 analysis 权限的
 * **部门经理**（manage_all=0）全部 403。
 * 现改为「路由 checkDataPermission('analysis') → 服务内 scopeFor 拼归属子句」，与报表域一致。
 * 归属列：crm_customer→owner_id · crm_contract→create_by · crm_opportunity→owner_id ·
 *         crm_follow_up→create_by · crm_sales_target→user_id · sys_user(排名)→id
 */

const { scopeFor } = require('../utils/dataScope');

/**
 * 销售预测（移动平均）
 */
async function getPrediction(pool, dataPermission) {
  const sc = await scopeFor(dataPermission, 'create_by', 'crm_contract');
  const [rows] = await pool.query(`
    SELECT DATE_FORMAT(sign_date, '%Y-%m') as month,
           COUNT(*) as count,
           COALESCE(SUM(amount), 0) as amount
    FROM crm_contract
    WHERE deleted_at IS NULL AND sign_date >= NOW() - INTERVAL 12 MONTH
      AND ${sc.clause}
    GROUP BY DATE_FORMAT(sign_date, '%Y-%m')
    ORDER BY month
  `, [...sc.params]);

  const history = [];
  const rowMap = {};
  rows.forEach(r => { rowMap[r.month] = parseFloat(r.amount); });

  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    history.push({ month: key, amount: rowMap[key] || 0 });
  }

  const amounts = history.map(h => h.amount);
  const prediction = [];
  const windowSize = 3;
  const extended = [...amounts];

  for (let i = 0; i < 3; i++) {
    const window = extended.slice(-windowSize);
    const avg = Math.round(window.reduce((a, b) => a + b, 0) / windowSize);
    extended.push(avg);

    const lastMonth = new Date(
      parseInt(history[history.length - 1].month.split('-')[0]),
      parseInt(history[history.length - 1].month.split('-')[1]) - 1 + i + 1,
      1
    );
    prediction.push({
      month: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`,
      amount: avg
    });
  }

  return { history, prediction };
}

/**
 * 客户流失预警
 */
async function getChurnAlert(pool, { page, pageSize }, dataPermission) {
  const offset = (page - 1) * pageSize;
  const overdueDays = 30;

  const scCount = await scopeFor(dataPermission, 'owner_id', 'crm_customer');
  const [countResult] = await pool.query(`
    SELECT COUNT(*) as total FROM crm_customer
    WHERE deleted_at IS NULL AND owner_id IS NOT NULL
      AND (last_follow_time IS NULL
        OR last_follow_time < NOW() - INTERVAL ? DAY)
      AND ${scCount.clause}
  `, [overdueDays, ...scCount.params]);

  const scList = await scopeFor(dataPermission, 'owner_id', 'c');
  const [list] = await pool.query(`
    SELECT c.id, c.company_name, pc.name as contact_name, pc.phone, c.level,
           c.last_follow_time, c.create_time, u.real_name as owner_name,
           DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
    FROM crm_customer c
    LEFT JOIN sys_user u ON c.owner_id = u.id
    LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
    WHERE c.deleted_at IS NULL AND c.owner_id IS NOT NULL
      AND (c.last_follow_time IS NULL
        OR c.last_follow_time < NOW() - INTERVAL ? DAY)
      AND ${scList.clause}
    ORDER BY overdue_days DESC
    LIMIT ? OFFSET ?
  `, [overdueDays, ...scList.params, parseInt(pageSize), parseInt(offset)]);

  return { list, total: countResult[0].total, overdueDays };
}

/**
 * 异常检测
 */
async function getAnomaly(pool, dataPermission) {
  const sc = await scopeFor(dataPermission, 'create_by', 'crm_contract');
  const [rows] = await pool.query(`
    SELECT DATE(create_time) as date,
           COUNT(*) as count,
           COALESCE(SUM(amount), 0) as amount
    FROM crm_contract
    WHERE deleted_at IS NULL AND create_time >= NOW() - INTERVAL 30 DAY
      AND ${sc.clause}
    GROUP BY DATE(create_time)
    ORDER BY date
  `, [...sc.params]);

  const daily = [];
  const rowMap = {};
  rows.forEach(r => {
    const key = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date);
    rowMap[key] = { count: r.count, amount: parseFloat(r.amount) };
  });

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily.push({
      date: key,
      count: rowMap[key]?.count || 0,
      amount: rowMap[key]?.amount || 0
    });
  }

  const amounts = daily.map(d => d.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / amounts.length;
  const std = Math.sqrt(variance);
  const threshold = 2;

  daily.forEach(d => {
    d.is_anomaly = std > 0 && Math.abs(d.amount - mean) > threshold * std;
  });

  return { daily, stats: { mean: Math.round(mean), std: Math.round(std) } };
}

/**
 * 客户评分
 */
async function getCustomerScore(pool, id, dataPermission) {
  const scFollow = await scopeFor(dataPermission, 'create_by', 'crm_follow_up');
  const [followResult] = await pool.query(
    `SELECT COUNT(*) as cnt FROM crm_follow_up WHERE customer_id = ? AND create_time >= NOW() - INTERVAL 90 DAY
       AND ${scFollow.clause}`,
    [id, ...scFollow.params]
  );

  const scOpp = await scopeFor(dataPermission, 'owner_id', 'crm_opportunity');
  const [oppResult] = await pool.query(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(expected_amount), 0) as amount FROM crm_opportunity WHERE customer_id = ? AND stage NOT IN (5, 6)
       AND ${scOpp.clause}`,
    [id, ...scOpp.params]
  );

  const scContract = await scopeFor(dataPermission, 'create_by', 'crm_contract');
  const [contractResult] = await pool.query(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as amount FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL AND status = 'signed'
       AND ${scContract.clause}`,
    [id, ...scContract.params]
  );

  const followCount = followResult[0].cnt;
  const oppCount = oppResult[0].cnt;
  const contractAmount = parseFloat(contractResult[0].amount);

  const followScore = Math.min(30, followCount * 3);
  const oppScore = Math.min(30, oppCount * 10);
  const contractScore = Math.min(40, contractAmount / 50000 * 40);
  const totalScore = Math.round(followScore + oppScore + contractScore);

  let level = 'D';
  if (totalScore >= 80) level = 'A';
  else if (totalScore >= 60) level = 'B';
  else if (totalScore >= 30) level = 'C';

  return {
    score: totalScore,
    level,
    factors: {
      follow_score: Math.round(followScore),
      opp_score: Math.round(oppScore),
      contract_score: Math.round(contractScore)
    }
  };
}

/**
 * 赢单率分析
 */
async function getWinRate(pool, dataPermission) {
  const sc = await scopeFor(dataPermission, 'owner_id', 'crm_opportunity');
  const [rows] = await pool.query(`
    SELECT stage, COUNT(*) as count
    FROM crm_opportunity
    WHERE ${sc.clause}
    GROUP BY stage
    ORDER BY stage ASC
  `, [...sc.params]);

  const stageNames = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' };
  const stageCounts = {};
  rows.forEach(r => { stageCounts[r.stage] = r.count; });

  const total = Object.values(stageCounts).reduce((a, b) => a + b, 0);
  const result = [];

  for (let i = 1; i <= 6; i++) {
    const count = stageCounts[i] || 0;
    result.push({
      stage: i,
      name: stageNames[i],
      count,
      ratio: total > 0 ? Math.round(count / total * 100) : 0
    });
  }

  return result;
}

/**
 * 销售漏斗
 */
async function getFunnel(pool, dataPermission) {
  const sc = await scopeFor(dataPermission, 'owner_id', 'crm_opportunity');
  const [rows] = await pool.query(`
    SELECT stage, COUNT(*) as count, COALESCE(SUM(expected_amount), 0) as amount
    FROM crm_opportunity
    WHERE ${sc.clause}
    GROUP BY stage ORDER BY stage
  `, [...sc.params]);

  const stageNames = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' };
  const stageMap = {};
  rows.forEach(r => { stageMap[r.stage] = { count: r.count, amount: parseFloat(r.amount) }; });

  const result = [];
  for (let i = 1; i <= 6; i++) {
    const d = stageMap[i] || { count: 0, amount: 0 };
    result.push({ stage: i, name: stageNames[i], count: d.count, amount: d.amount });
  }

  return result;
}

/**
 * 客户价值评分 RFM
 */
async function getRFM(pool, dataPermission) {
  const sc = await scopeFor(dataPermission, 'owner_id', 'c');
  const [rows] = await pool.query(`
    SELECT c.id, c.company_name,
      DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as recency,
      COALESCE(f.frequency, 0) as frequency,
      COALESCE(ct.monetary, 0) as monetary
    FROM crm_customer c
    LEFT JOIN (
      SELECT customer_id, COUNT(*) as frequency
      FROM crm_follow_up
      WHERE create_time >= NOW() - INTERVAL 90 DAY
      GROUP BY customer_id
    ) f ON f.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id, SUM(amount) as monetary
      FROM crm_contract
      WHERE deleted_at IS NULL AND status = 2
      GROUP BY customer_id
    ) ct ON ct.customer_id = c.id
    WHERE c.deleted_at IS NULL
      AND ${sc.clause}
    ORDER BY monetary DESC
    LIMIT 200
  `, [...sc.params]);

  const scoreR = (v) => v <= 7 ? 5 : v <= 14 ? 4 : v <= 30 ? 3 : v <= 60 ? 2 : 1;
  const scoreF = (v) => v >= 10 ? 5 : v >= 5 ? 4 : v >= 3 ? 3 : v >= 1 ? 2 : 1;
  const scoreM = (v) => v >= 500000 ? 5 : v >= 200000 ? 4 : v >= 100000 ? 3 : v >= 10000 ? 2 : 1;

  const summary = { A: 0, B: 0, C: 0, D: 0 };
  const list = rows.map(r => {
    const recency = parseInt(r.recency) || 0;
    const frequency = parseInt(r.frequency) || 0;
    const monetary = parseFloat(r.monetary) || 0;
    const r_score = scoreR(recency);
    const f_score = scoreF(frequency);
    const m_score = scoreM(monetary);
    const total_score = r_score + f_score + m_score;
    const level = total_score >= 12 ? 'A' : total_score >= 9 ? 'B' : total_score >= 6 ? 'C' : 'D';
    summary[level]++;
    return { id: r.id, company_name: r.company_name, recency, frequency, monetary, r_score, f_score, m_score, total_score, level };
  });

  return { list, summary };
}

/**
 * 销售排行榜
 */
async function getRanking(pool, dataPermission) {
  const sc = await scopeFor(dataPermission, 'id', 'u');
  const [rows] = await pool.query(`
    SELECT u.id, u.real_name,
      COUNT(DISTINCT c.id) as customer_count,
      COUNT(DISTINCT o.id) as opp_count,
      COALESCE(SUM(CASE WHEN o.stage = 5 THEN o.expected_amount ELSE 0 END), 0) as win_amount,
      COUNT(DISTINCT CASE WHEN o.stage = 5 THEN o.id END) as win_count
    FROM sys_user u
    LEFT JOIN crm_customer c ON c.owner_id = u.id AND c.deleted_at IS NULL
    LEFT JOIN crm_opportunity o ON o.owner_id = u.id
    WHERE u.status = 1
      AND ${sc.clause}
    GROUP BY u.id, u.real_name
    ORDER BY win_amount DESC
    LIMIT 20
  `, [...sc.params]);

  return rows.map(r => ({
    id: r.id,
    real_name: r.real_name,
    customer_count: parseInt(r.customer_count),
    opp_count: parseInt(r.opp_count),
    win_amount: parseFloat(r.win_amount),
    win_count: parseInt(r.win_count)
  }));
}

/**
 * 增强版销售预测
 */
async function getEnhancedPrediction(pool, monthsAhead, dataPermission) {
  const sc = await scopeFor(dataPermission, 'create_by', 'crm_contract');
  const [history] = await pool.query(`
    SELECT DATE_FORMAT(sign_date, '%Y-%m') as month, COUNT(*) as count,
           COALESCE(SUM(amount), 0) as amount
    FROM crm_contract WHERE deleted_at IS NULL AND sign_date >= DATE_SUB(NOW(), INTERVAL 24 MONTH)
      AND ${sc.clause}
    GROUP BY month ORDER BY month
  `, [...sc.params]);

  if (history.length < 3) return { history, predictions: [] };

  const amounts = history.map(h => parseFloat(h.amount));
  const n = amounts.length;

  const windowSize = Math.min(3, n);
  const movingAvg = amounts.slice(-windowSize).reduce((a, b) => a + b, 0) / windowSize;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += amounts[i]; sumXY += i * amounts[i]; sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  let seasonalFactors = [];
  if (n >= 12) {
    const overallAvg = sumY / n;
    for (let m = 0; m < 12; m++) {
      const monthValues = [];
      for (let i = m; i < n; i += 12) monthValues.push(amounts[i]);
      const monthAvg = monthValues.reduce((a, b) => a + b, 0) / monthValues.length;
      seasonalFactors.push(overallAvg > 0 ? monthAvg / overallAvg : 1);
    }
  }

  const predictions = [];
  const lastMonth = history[history.length - 1].month;
  const [year, month] = lastMonth.split('-').map(Number);

  for (let i = 1; i <= monthsAhead; i++) {
    const predMonth = new Date(year, month - 1 + i, 1);
    const monthStr = `${predMonth.getFullYear()}-${String(predMonth.getMonth() + 1).padStart(2, '0')}`;
    const idx = n + i - 1;

    const maPrediction = Math.round(movingAvg);
    const lrPrediction = Math.round(Math.max(0, intercept + slope * idx));

    let seasonalPrediction = maPrediction;
    if (seasonalFactors.length === 12) {
      const targetMonth = predMonth.getMonth();
      seasonalPrediction = Math.round(Math.max(0, (intercept + slope * idx) * seasonalFactors[targetMonth]));
    }

    const mean = sumY / n;
    const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    const margin = Math.round(1.96 * std / Math.sqrt(n));

    predictions.push({
      month: monthStr,
      moving_avg: maPrediction,
      linear_regression: lrPrediction,
      seasonal: seasonalPrediction,
      confidence_low: Math.max(0, Math.round((maPrediction + lrPrediction + seasonalPrediction) / 3 - margin)),
      confidence_high: Math.round((maPrediction + lrPrediction + seasonalPrediction) / 3 + margin)
    });
  }

  return {
    history,
    predictions,
    models: {
      moving_avg: { window: windowSize, last_value: Math.round(movingAvg) },
      linear_regression: { slope: slope.toFixed(2), intercept: intercept.toFixed(2) },
      seasonal: { has_seasonal: seasonalFactors.length === 12, factors: seasonalFactors.map(f => f.toFixed(2)) }
    }
  };
}

/**
 * 增强版智能建议
 */
async function getEnhancedSuggestions(pool, dataPermission) {
  const suggestions = [];

  // 商机跟进建议：停滞商机
  const scStaleOpps = await scopeFor(dataPermission, 'owner_id', 'o');
  const [staleOpps] = await pool.query(`
    SELECT o.id, o.name, o.stage, o.expected_amount, o.update_time, c.company_name,
           DATEDIFF(NOW(), o.update_time) as stale_days
    FROM crm_opportunity o
    JOIN crm_customer c ON o.customer_id = c.id
    WHERE o.deleted_at IS NULL AND o.stage NOT IN (5, 6)
      AND DATEDIFF(NOW(), o.update_time) > 14
      AND ${scStaleOpps.clause}
    ORDER BY o.expected_amount DESC LIMIT 5
  `, [...scStaleOpps.params]);
  staleOpps.forEach(o => {
    suggestions.push({
      type: 'opportunity', priority: o.stale_days > 30 ? 'high' : 'medium',
      title: `商机"${o.name}"已停滞${o.stale_days}天`,
      content: `客户${o.company_name}的商机（${o.expected_amount}元）在阶段${o.stage}停滞${o.stale_days}天，建议安排跟进。`,
      action: '跟进商机', ref_id: o.id
    });
  });

  // 客户挽回建议：流失预警客户
  const scChurn = await scopeFor(dataPermission, 'owner_id', 'crm_customer');
  const [churnCustomers] = await pool.query(`
    SELECT id, company_name, last_follow_time, level,
           DATEDIFF(NOW(), COALESCE(last_follow_time, create_time)) as idle_days
    FROM crm_customer WHERE deleted_at IS NULL AND status = 'following'
      AND (last_follow_time IS NULL OR last_follow_time < NOW() - INTERVAL 30 DAY)
      AND ${scChurn.clause}
    ORDER BY level, idle_days DESC LIMIT 5
  `, [...scChurn.params]);
  churnCustomers.forEach(c => {
    suggestions.push({
      type: 'customer', priority: c.level === 'A' ? 'high' : 'medium',
      title: `${c.level}级客户"${c.company_name}"${c.idle_days}天未跟进`,
      content: `建议安排回访或发送关怀邮件，防止客户流失。`,
      action: '安排回访', ref_id: c.id
    });
  });

  // 业绩冲刺建议
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const scMonth = await scopeFor(dataPermission, 'create_by', 'crm_contract');
  const [[{ monthAmount }]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as monthAmount FROM crm_contract WHERE deleted_at IS NULL AND sign_date >= ?
       AND ${scMonth.clause}`, [monthStart, ...scMonth.params]
  );
  const scTarget = await scopeFor(dataPermission, 'user_id', 'crm_sales_target');
  const [[{ targetAmount }]] = await pool.query(
    `SELECT COALESCE(SUM(target_amount), 0) as targetAmount FROM crm_sales_target WHERE year = ? AND month = ? AND deleted_at IS NULL
       AND ${scTarget.clause}`,
    [now.getFullYear(), now.getMonth() + 1, ...scTarget.params]
  );
  if (targetAmount > 0 && monthAmount < targetAmount) {
    const gap = targetAmount - monthAmount;
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    suggestions.push({
      type: 'performance', priority: daysLeft <= 7 ? 'high' : 'medium',
      title: `本月业绩差距 ¥${Math.round(gap).toLocaleString()}`,
      content: `当前完成 ¥${Math.round(monthAmount).toLocaleString()}，目标 ¥${Math.round(targetAmount).toLocaleString()}，剩余${daysLeft}天，日均需 ¥${Math.round(gap / Math.max(1, daysLeft)).toLocaleString()}。`,
      action: '查看商机', ref_id: null
    });
  }

  // 交叉销售建议
  const scCrossSell = await scopeFor(dataPermission, 'owner_id', 'c');
  const [crossSell] = await pool.query(`
    SELECT c.id, c.company_name, GROUP_CONCAT(DISTINCT p.name) as products
    FROM crm_customer c
    JOIN crm_contract ct ON c.id = ct.customer_id AND ct.deleted_at IS NULL
    LEFT JOIN crm_quote_item qi ON ct.id = qi.quote_id
    LEFT JOIN crm_product p ON qi.product_id = p.id
    WHERE c.deleted_at IS NULL AND c.status = 'signed'
      AND ${scCrossSell.clause}
      AND NOT EXISTS (SELECT 1 FROM crm_opportunity o WHERE o.customer_id = c.id AND o.stage NOT IN (5, 6) AND o.deleted_at IS NULL)
    GROUP BY c.id LIMIT 5
  `, [...scCrossSell.params]);
  crossSell.forEach(c => {
    suggestions.push({
      type: 'cross_sell', priority: 'low',
      title: `交叉销售机会：${c.company_name}`,
      content: `该客户曾采购${c.products || '产品'}，目前无活跃商机，可推荐相关产品。`,
      action: '创建商机', ref_id: c.id
    });
  });

  return suggestions;
}

module.exports = {
  getPrediction,
  getChurnAlert,
  getAnomaly,
  getCustomerScore,
  getWinRate,
  getFunnel,
  getRFM,
  getRanking,
  getEnhancedPrediction,
  getEnhancedSuggestions
};

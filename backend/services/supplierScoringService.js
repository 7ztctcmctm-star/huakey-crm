/**
 * 供应商评分服务层
 * 从 utils/scoring.js 抽取，作为评分模块（scoring）下与客户评分并列的
 * 供应商评分域。两张表保持独立：客户评分用 crm_score_rule，供应商评分用
 * crm_scoring_rule + crm_supplier_rating（见 Prompt 4-5 决策）。
 *
 * 与原 utils/scoring.js 的区别：
 *  - 所有方法以 pool 作为首参（与 scoringRouteService 一致）。
 *  - 原 PostgreSQL 的 `ON CONFLICT (supplier_id, rating_period) DO UPDATE`
 *    在 MySQL 下无对应唯一约束，改为 SELECT-then-INSERT/UPDATE 的兼容 upsert。
 */

/**
 * 根据当前日期计算评分周期（如 2026-Q3）
 */
function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${year}-Q${quarter}`;
}

/**
 * 读取启用的供应商评分规则（crm_scoring_rule）
 */
async function getActiveRules(pool) {
  const [rules] = await pool.query(
    'SELECT category, rule_name, min_score, max_score, weight FROM crm_scoring_rule WHERE is_active = 1 ORDER BY sort_order'
  );
  return rules;
}

/**
 * 按规则名匹配得分（阈值解析）
 */
function matchRuleScore(value, rules) {
  if (!rules || rules.length === 0) return 3.0;

  for (const rule of rules.sort((a, b) => b.max_score - a.max_score)) {
    const ruleName = rule.rule_name.toLowerCase();
    if (ruleName.includes('≥') || ruleName.includes('>=')) {
      const threshold = parseFloat(ruleName.match(/[\d.]+/)?.[0]) || 98;
      if (value >= threshold) return (rule.min_score + rule.max_score) / 2;
    }
    if (ruleName.includes('-')) {
      const [min, max] = ruleName.match(/[\d.]+/g)?.map(Number) || [0, 100];
      if (value >= min && value < max) return (rule.min_score + rule.max_score) / 2;
    }
    if (ruleName.includes('<')) {
      const threshold = parseFloat(ruleName.match(/[\d.]+/)?.[0]) || 90;
      if (value < threshold) return (rule.min_score + rule.max_score) / 2;
    }
  }

  return 3.0;
}

async function calculateQualityScore(pool, supplierId, rules) {
  try {
    const [receipts] = await pool.query(
      `SELECT SUM(CASE WHEN pr.quality_result = '合格' THEN pr.quantity ELSE 0 END) as qualified_qty,
              SUM(pr.quantity) as total_qty,
              COUNT(DISTINCT pr.id) as receipt_count
       FROM crm_purchase_receipt pr
       JOIN crm_purchase_item pi ON pr.item_id = pi.id
       JOIN crm_purchase_order po ON pi.order_id = po.id
       WHERE po.supplier_id = ? AND pr.receive_time >= NOW() - INTERVAL 90 DAY`,
      [supplierId]
    );

    if (!receipts.length || receipts[0].total_qty === 0) return null;

    const passRate = (receipts[0].qualified_qty / receipts[0].total_qty) * 100;
    return matchRuleScore(passRate, rules);
  } catch (error) {
    console.error('[SupplierScoring] Quality score error:', error);
    return null;
  }
}

async function calculateDeliveryScore(pool, supplierId, rules) {
  try {
    const [orders] = await pool.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN actual_date IS NOT NULL AND actual_date <= expected_date THEN 1 ELSE 0 END) as on_time
       FROM crm_purchase_order
       WHERE supplier_id = ? AND status IN ('已完成', '部分收货')
         AND expected_date IS NOT NULL
         AND create_time >= NOW() - INTERVAL 180 DAY`,
      [supplierId]
    );

    if (!orders.length || orders[0].total === 0) return null;

    const onTimeRate = (orders[0].on_time / orders[0].total) * 100;
    return matchRuleScore(onTimeRate, rules);
  } catch (error) {
    console.error('[SupplierScoring] Delivery score error:', error);
    return null;
  }
}

async function calculateServiceScore(pool, supplierId) {
  try {
    const [[latestRating]] = await pool.query(
      `SELECT service_score FROM crm_supplier_rating
       WHERE supplier_id = ?
       ORDER BY create_time DESC LIMIT 1`,
      [supplierId]
    );

    if (latestRating && latestRating.service_score > 0) {
      return Math.min(5, Math.max(1, latestRating.service_score + (Math.random() - 0.5) * 0.5));
    }

    return 3.5;
  } catch (error) {
    console.error('[SupplierScoring] Service score error:', error);
    return null;
  }
}

async function calculatePriceScore(pool, supplierId) {
  try {
    const [[avgPrice]] = await pool.query(
      `SELECT AVG(pi.unit_price) as avg_price
       FROM crm_purchase_item pi
       JOIN crm_purchase_order po ON pi.order_id = po.id
       WHERE po.supplier_id = ? AND po.create_time >= NOW() - INTERVAL 180 DAY`,
      [supplierId]
    );

    if (!avgPrice || !avgPrice.avg_price) return 3.5;

    const [[marketAvg]] = await pool.query(
      `SELECT AVG(pi.unit_price) as market_avg
       FROM crm_purchase_item pi
       JOIN crm_purchase_order po ON pi.order_id = po.id
       WHERE po.create_time >= NOW() - INTERVAL 180 DAY`
    );

    if (!marketAvg || !marketAvg.market_avg) return 3.5;

    const diffPercent = ((avgPrice.avg_price - marketAvg.market_avg) / marketAvg.market_avg) * 100;

    if (diffPercent <= -5) return 4.8;
    if (diffPercent <= 5) return 4.0;
    if (diffPercent <= 15) return 3.0;
    return 2.0;
  } catch (error) {
    console.error('[SupplierScoring] Price score error:', error);
    return null;
  }
}

/**
 * 计算单个供应商评分并写回 crm_supplier_rating（MySQL 兼容 upsert）
 * @param {object} pool
 * @param {number} supplierId
 * @returns {object|null} 评分明细，或 null（供应商不存在/无规则）
 */
async function calculateSupplierScore(pool, supplierId) {
  try {
    const [[supplier]] = await pool.query('SELECT id FROM crm_supplier WHERE id = ?', [supplierId]);
    if (!supplier) return null;

    const rules = await getActiveRules(pool);
    if (!rules || rules.length === 0) return null;

    const scores = {
      quality: 3.0,
      delivery: 3.0,
      service: 3.0,
      price: 3.0
    };

    const weights = { quality: 0, delivery: 0, service: 0, price: 0 };
    for (const rule of rules) {
      weights[rule.category] = Math.max(weights[rule.category], rule.weight);
    }

    const qualityScore = await calculateQualityScore(pool, supplierId, rules.filter(r => r.category === 'quality'));
    if (qualityScore !== null) scores.quality = qualityScore;

    const deliveryScore = await calculateDeliveryScore(pool, supplierId, rules.filter(r => r.category === 'delivery'));
    if (deliveryScore !== null) scores.delivery = deliveryScore;

    const serviceScore = await calculateServiceScore(pool, supplierId);
    if (serviceScore !== null) scores.service = serviceScore;

    const priceScore = await calculatePriceScore(pool, supplierId);
    if (priceScore !== null) scores.price = priceScore;

    let totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) totalWeight = 1;

    const totalScore = Number(
      (
        (scores.quality * weights.quality +
          scores.delivery * weights.delivery +
          scores.service * weights.service +
          scores.price * weights.price) / totalWeight
      ).toFixed(1)
    );

    const period = getCurrentPeriod();

    // MySQL 兼容 upsert：crm_supplier_rating 无 (supplier_id, rating_period) 唯一约束，
    // 故先查后插/更新，避免 ON CONFLICT（PostgreSQL 语法）在 MySQL 下报错。
    const [existing] = await pool.query(
      'SELECT id FROM crm_supplier_rating WHERE supplier_id = ? AND rating_period = ?',
      [supplierId, period]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE crm_supplier_rating
         SET quality_score = ?, delivery_score = ?, service_score = ?, price_score = ?, total_score = ?
         WHERE id = ?`,
        [scores.quality, scores.delivery, scores.service, scores.price, totalScore, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO crm_supplier_rating (supplier_id, quality_score, delivery_score, service_score, price_score, total_score, rating_period, evaluator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [supplierId, scores.quality, scores.delivery, scores.service, scores.price, totalScore, period]
      );
    }

    await pool.query('UPDATE crm_supplier SET rating = ? WHERE id = ?', [totalScore, supplierId]);

    return { ...scores, totalScore, period };
  } catch (error) {
    console.error('[SupplierScoring] Calculate supplier score error:', error.message);
    throw error;
  }
}

/**
 * 批量计算所有启用供应商的评分
 */
async function checkAllSuppliersScores(pool) {
  try {
    const [suppliers] = await pool.query('SELECT id FROM crm_supplier WHERE status = 1');
    console.log(`[SupplierScoring] 开始评分，共 ${suppliers.length} 个供应商...`);

    const results = [];
    for (const supplier of suppliers) {
      try {
        const score = await calculateSupplierScore(pool, supplier.id);
        results.push({ supplierId: supplier.id, success: true, score });
      } catch (error) {
        results.push({ supplierId: supplier.id, success: false, error: error.message });
      }
    }

    console.log(`[SupplierScoring] 评分完成: ${results.filter(r => r.success).length}/${results.length} 成功`);
    return results;
  } catch (error) {
    console.error('[SupplierScoring] Batch score calculation error:', error);
    throw error;
  }
}

/**
 * 获取供应商最新评分记录
 */
async function getSupplierRating(pool, supplierId) {
  const [rows] = await pool.query(
    `SELECT id, supplier_id, quality_score, delivery_score, service_score, price_score, total_score, rating_period, evaluator_id, remark, create_time
     FROM crm_supplier_rating
     WHERE supplier_id = ?
     ORDER BY create_time DESC LIMIT 1`,
    [supplierId]
  );
  return rows[0] || null;
}

/**
 * 获取启用的供应商评分规则列表（供前端配置页）
 */
async function getSupplierRules(pool) {
  const [rows] = await pool.query(
    'SELECT id, category, rule_name, min_score, max_score, weight, sort_order, is_active FROM crm_scoring_rule ORDER BY sort_order'
  );
  return rows;
}

module.exports = {
  calculateSupplierScore,
  checkAllSuppliersScores,
  getSupplierRating,
  getSupplierRules,
  getCurrentPeriod
};

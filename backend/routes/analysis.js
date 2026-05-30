const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 1. 销售预测（简单移动平均法）
router.get('/prediction', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT TO_CHAR(sign_date, 'YYYY-MM') as month,
             COUNT(*) as count,
             COALESCE(SUM(amount), 0) as amount
      FROM crm_contract
      WHERE deleted_at IS NULL AND sign_date >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(sign_date, 'YYYY-MM')
      ORDER BY month
    `);

    // 填充缺失月份
    const history = [];
    const rowMap = {};
    rows.forEach(r => { rowMap[r.month] = parseFloat(r.amount); });

    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      history.push({ month: key, amount: rowMap[key] || 0 });
    }

    // 3个月窗口移动平均预测未来3个月
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

    res.json({ code: 200, message: '查询成功', data: { history, prediction } });
  } catch (error) {
    console.error('销售预测错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 2. 客户流失预警
router.get('/churn-alert', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const overdueDays = 30;

    const [countResult] = await pool.query(`
      SELECT COUNT(*) as total FROM crm_customer
      WHERE status != 0 AND owner_id IS NOT NULL
        AND (last_follow_time IS NULL
          OR last_follow_time < NOW() - (? * INTERVAL '1 day'))
    `, [overdueDays]);

    const [list] = await pool.query(`
      SELECT c.id, c.company_name, c.contact_name, c.phone, c.level,
             c.last_follow_time, c.create_time, u.real_name as owner_name,
             EXTRACT(DAY FROM NOW() - COALESCE(c.last_follow_time, c.create_time)) as overdue_days
      FROM crm_customer c
      LEFT JOIN sys_user u ON c.owner_id = u.id
      WHERE c.status != 0 AND c.owner_id IS NOT NULL
        AND (c.last_follow_time IS NULL
          OR c.last_follow_time < NOW() - (? * INTERVAL '1 day'))
      ORDER BY overdue_days DESC
      LIMIT ? OFFSET ?
    `, [overdueDays, parseInt(pageSize), parseInt(offset)]);

    res.json({
      code: 200, message: '查询成功',
      data: { list, total: countResult[0].total, overdueDays }
    });
  } catch (error) {
    console.error('流失预警错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 3. 异常检测
router.get('/anomaly', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DATE(create_time) as date,
             COUNT(*) as count,
             COALESCE(SUM(amount), 0) as amount
      FROM crm_contract
      WHERE deleted_at IS NULL AND create_time >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(create_time)
      ORDER BY date
    `);

    // 填充缺失日期
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

    // 计算均值和标准差
    const amounts = daily.map(d => d.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / amounts.length;
    const std = Math.sqrt(variance);
    const threshold = 2;

    daily.forEach(d => {
      d.is_anomaly = std > 0 && Math.abs(d.amount - mean) > threshold * std;
    });

    res.json({
      code: 200, message: '查询成功',
      data: { daily, stats: { mean: Math.round(mean), std: Math.round(std) } }
    });
  } catch (error) {
    console.error('异常检测错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 4. 客户评分
router.get('/customer-score/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 跟进频次（近90天）
    const [followResult] = await pool.query(
      `SELECT COUNT(*) as cnt FROM crm_follow_up WHERE customer_id = ? AND create_time >= NOW() - INTERVAL '90 days'`,
      [id]
    );

    // 商机数量（活跃）
    const [oppResult] = await pool.query(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(expected_amount), 0) as amount FROM crm_opportunity WHERE customer_id = ? AND stage NOT IN (5, 6)",
      [id]
    );

    // 合同金额
    const [contractResult] = await pool.query(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as amount FROM crm_contract WHERE customer_id = ? AND deleted_at IS NULL AND status = 2",
      [id]
    );

    const followCount = followResult[0].cnt;
    const oppCount = oppResult[0].cnt;
    const contractAmount = parseFloat(contractResult[0].amount);

    // 评分模型：跟进(30分) + 商机(30分) + 合同(40分)
    const followScore = Math.min(30, followCount * 3); // 每次跟进3分，10次满分
    const oppScore = Math.min(30, oppCount * 10); // 每个商机10分，3个满分
    const contractScore = Math.min(40, contractAmount / 50000 * 40); // 50万满分
    const totalScore = Math.round(followScore + oppScore + contractScore);

    let level = 'D';
    if (totalScore >= 80) level = 'A';
    else if (totalScore >= 60) level = 'B';
    else if (totalScore >= 30) level = 'C';

    res.json({
      code: 200, message: '查询成功',
      data: {
        score: totalScore,
        level,
        factors: {
          follow_score: Math.round(followScore),
          opp_score: Math.round(oppScore),
          contract_score: Math.round(contractScore)
        }
      }
    });
  } catch (error) {
    console.error('客户评分错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 5. 赢单率分析
router.get('/win-rate', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT stage, COUNT(*) as count
      FROM crm_opportunity
      GROUP BY stage
      ORDER BY stage ASC
    `);

    const stageNames = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' };
    const stageCounts = {};
    rows.forEach(r => { stageCounts[r.stage] = r.count; });

    const total = Object.values(stageCounts).reduce((a, b) => a + b, 0);
    const result = [];

    for (let i = 1; i <= 6; i++) {
      const count = stageCounts[i] || 0;
      const nextCount = i < 6 ? (stageCounts[i + 1] || 0) : 0;
      const winRate = i < 6 && count > 0
        ? Math.round((stageCounts[5] || 0) / count * 100)
        : (i === 5 ? 100 : 0);

      result.push({
        stage: i,
        name: stageNames[i],
        count,
        ratio: total > 0 ? Math.round(count / total * 100) : 0
      });
    }

    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('赢单率分析错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

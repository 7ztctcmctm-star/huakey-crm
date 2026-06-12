const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');
const { chatCompletion, getProviderStatus } = require('../utils/llmClient');

// AI查询使用主数据库连接池（PG 已兼容）
const readOnlyPool = pool;

if (!process.env.DB_RO_USER) {
  console.warn('[AI] 未配置DB_RO_*环境变量，AI查询将使用主数据库账号。建议配置只读数据库账号以降低安全风险。');
}

router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { messages, context } = req.body;

    const systemPrompt = '你是铧旗CRM的AI助手。当前页面: ' + (context || '未知') + '。用简洁中文回答，不超过200字。';
    const safeMessages = (messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const reply = await chatCompletion(safeMessages, {
      maxTokens: 200,
      temperature: 0.7,
      signal: controller.signal,
      system: systemPrompt
    });
    clearTimeout(timeout);

    res.json({
      code: 200,
      message: 'success',
      data: { reply: reply || '(模型未生成回复，请重试)' }
    });
  } catch (error) {
    const msg = error.name === 'AbortError'
      ? 'AI 响应超时，请重试'
      : 'AI 调用失败，请稍后重试';
    const code = 503;
    res.status(code).json({ code, message: msg, data: null });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = await getProviderStatus();
    res.json({ code: 200, data: status });
  } catch (error) {
    console.error('[AI助手] 获取状态失败:', error.message);
    res.json({ code: 200, data: { online: false, provider: 'unknown', model: '', models: [] } });
  }
});

// Text-to-SQL：自然语言 → SQL → 执行 → AI格式化结果
const DB_SCHEMA = `
数据库表（所有表在 huakey_crm 库）：
- crm_customer(客户): id, company_name, contact_name, phone, email, industry, source, level(A/B/C/D), owner_id, status(1=潜在/2=成交/3=流失), pool_status(0=归属/1=公海), lead_level(高/中/低), follow_status, last_follow_time, create_time
- sys_user(用户): id, username, real_name, role_id, dept_id
- sys_dept(部门): id, name
- sys_role(角色): id, name, code
- crm_opportunity(商机): id, customer_id, name, expected_amount, stage(1-6), win_rate, owner_id
- crm_contract(合同): id, contract_no, customer_id, amount, sign_date, status
- crm_product(产品): id, name, code, category, price, cost_price, stock
- crm_follow_up(跟进): id, customer_id, content, follow_type, create_by, create_time
- crm_supplier(供应商): id, name, type(生产/贸易/服务), level(核心/重点/普通/备用), rating, status(1=合作中/2=暂停/3=终止)
- crm_purchase_order(采购单): id, order_no, supplier_id, title, status, total_with_tax, create_time
- crm_ai_suggestion(AI建议): id, type(customer/opportunity/pricing/follow_up), ref_id, suggestion, confidence, is_accepted, create_time
- sys_email_log(邮件日志): id, to_email, subject, status(sent/failed), create_time
`.trim();

router.post('/query', authenticateToken, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ code: 400, message: '请输入问题', data: null });

    // 第一步：AI 生成 SQL
    const sqlSystemPrompt = `你是一个严格的SQL生成器。规则：1.只输出一条SQL 2.不要markdown/解释/换行 3.尽量简单，不要JOIN除非用户明确提到多张表 4.用COUNT(*)统计数量 5.表结构:\n${DB_SCHEMA}\n\n示例问"客户总数"→输出:SELECT COUNT(*) FROM crm_customer WHERE status != 0`;
    const sqlPrompt = [
      { role: 'user', content: '写SQL查询: ' + question }
    ];

    let sql = await chatCompletion(sqlPrompt, {
      maxTokens: 150,
      temperature: 0.1,
      signal: AbortSignal.timeout(30000),
      system: sqlSystemPrompt
    });
    sql = sql.trim();

    // 清理SQL（去掉markdown代码块、换行，暂时保留分号用于多语句检测）
    sql = sql.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').replace(/```/g, '')
             .replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // 白名单安全校验：禁止多条语句（分号分隔）
    if ((sql.match(/;/g) || []).length > 0) {
      return res.json({ code: 200, data: { sql: '', answer: '不支持多条语句。', rows: [] } });
    }
    // 现在去掉分号
    sql = sql.replace(/;/g, '').trim();

    if (!sql.toUpperCase().startsWith('SELECT')) {
      // AI 可能输出了非SQL内容，尝试提取SELECT语句
      const match = sql.match(/SELECT[\s\S]+?(?:;|$)/i);
      sql = match ? match[0] : '';
    }
    if (!sql || !sql.toUpperCase().startsWith('SELECT')) {
      return res.json({ code: 200, data: { sql: '', answer: '抱歉，无法理解该问题，请换个问法。', rows: [] } });
    }

    // 禁止危险操作和信息泄露
    const blocked = /\b(UNION|INTO\s+(OUTFILE|DUMPFILE)|LOAD\s+DATA|INFORMATION_SCHEMA|SLEEP|BENCHMARK|WAITFOR\s+DELAY|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;
    if (blocked.test(sql)) {
      return res.json({ code: 200, data: { sql: '', answer: '此操作不被允许（仅支持查询）。', rows: [] } });
    }

    // 禁止查询系统敏感表
    const sensitiveTables = /\b(sys_user|sys_role|sys_permission|sys_config|sys_backup_record)\b/i;
    if (sensitiveTables.test(sql)) {
      return res.json({ code: 200, data: { sql: '', answer: '不允许查询系统表。', rows: [] } });
    }

    // 第二步：执行 SQL（使用只读连接池）
    let rows;
    try {
      [rows] = await readOnlyPool.query(sql + ' LIMIT 50');
    } catch (dbError) {
      console.error('[AI查询] SQL执行失败:', sql, dbError.message);
      return res.json({ code: 200, data: { sql, answer: '生成的SQL有误，请换个问法。', rows: [] } });
    }

    if (!rows || rows.length === 0) {
      return res.json({ code: 200, data: { sql, answer: '查询结果为空。', rows: [] } });
    }

    // 第三步：AI 格式化结果
    const resultStr = JSON.stringify(rows.slice(0, 20));
    const fmtPrompt = [
      { role: 'user', content: `问题: ${question}\nSQL: ${sql}\n结果(${rows.length}条): ${resultStr}` }
    ];

    const answer = (await chatCompletion(fmtPrompt, {
      maxTokens: 200,
      temperature: 0.7,
      signal: AbortSignal.timeout(30000),
      system: '将以下查询结果用简洁中文总结，不超过200字。'
    })) || '查询完成';

    res.json({ code: 200, data: { sql, answer, rows: rows.slice(0, 20), total: rows.length } });
  } catch (error) {
    const msg = error.name === 'TimeoutError' ? '查询超时' : 'AI调用失败';
    res.status(503).json({ code: 503, message: msg, data: null });
  }
});

// 更新 DB_SCHEMA 加入新表
const DB_SCHEMA_EXTENDED = DB_SCHEMA + `
- crm_ai_suggestion(AI建议): id, type(customer/opportunity/pricing/follow_up), ref_id, suggestion, confidence, is_accepted(0/1), feedback, create_by, create_time
- sys_email_log(邮件日志): id, to_email, subject, body, type, status(sent/failed), error_msg, ref_type, ref_id, send_by, create_time
`;

// AI建议列表
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const { type, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = '1=1';
    const params = [];
    if (type) {
      whereClause += ' AND s.type = ?';
      params.push(type);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM crm_ai_suggestion s WHERE ${whereClause}`, params
    );

    const [list] = await pool.query(
      `SELECT s.*, u.real_name as creator_name
       FROM crm_ai_suggestion s
       LEFT JOIN sys_user u ON s.create_by = u.id
       WHERE ${whereClause}
       ORDER BY s.create_time DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    // 补充关联数据
    for (const item of list) {
      if (item.type === 'follow_up' || item.type === 'customer') {
        const [customer] = await pool.query('SELECT company_name FROM crm_customer WHERE id = ?', [item.ref_id]);
        item.ref_name = customer[0]?.company_name || '未知客户';
      } else if (item.type === 'opportunity' || item.type === 'pricing') {
        const [opp] = await pool.query('SELECT name, expected_amount, customer_id FROM crm_opportunity WHERE id = ?', [item.ref_id]);
        item.ref_name = opp[0]?.name || '未知商机';
        item.expected_amount = opp[0]?.expected_amount;
      }
    }

    res.json({
      code: 200, message: '查询成功',
      data: { list, total: countResult[0].total }
    });
  } catch (error) {
    console.error('[AI助手] AI建议查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 标记建议采纳/反馈
router.post('/suggestion/feedback', authenticateToken, async (req, res) => {
  try {
    const { id, is_accepted, feedback } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '建议ID不能为空', data: null });

    const fields = [];
    const params = [];
    if (is_accepted !== undefined) { fields.push('is_accepted = ?'); params.push(is_accepted); }
    if (feedback !== undefined) { fields.push('feedback = ?'); params.push(feedback); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });

    params.push(id);
    await pool.query(`UPDATE crm_ai_suggestion SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[AI助手] AI建议反馈错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 生成AI建议
router.post('/generate-suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    let created = 0;

    // 1. 客户跟进超期建议
    const [overdueCustomers] = await pool.query(`
      SELECT c.id, c.company_name, c.last_follow_time,
             DATEDIFF(NOW(), COALESCE(c.last_follow_time, c.create_time)) as overdue_days
      FROM crm_customer c
      WHERE c.status != 0 AND c.owner_id IS NOT NULL
        AND (c.last_follow_time IS NULL OR c.last_follow_time < NOW() - INTERVAL 30 DAY)
      LIMIT 20
    `);

    for (const c of overdueCustomers) {
      const [exists] = await pool.query(
        "SELECT id FROM crm_ai_suggestion WHERE type = 'follow_up' AND ref_id = ? AND create_time >= NOW() - INTERVAL 24 HOUR",
        [c.id]
      );
      if (exists.length === 0) {
        await pool.query(
          `INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by)
           VALUES ('follow_up', ?, ?, ?, ?)`,
          [c.id, `客户"${c.company_name}"已${c.overdue_days}天未跟进，建议立即安排回访或联系沟通。`, 0.85, userId]
        );
        created++;
      }
    }

    // 2. 商机停滞建议
    const [staleOpps] = await pool.query(`
      SELECT o.id, o.name, o.expected_amount, o.stage, o.update_time,
             DATEDIFF(NOW(), o.update_time) as stale_days, c.company_name
      FROM crm_opportunity o
      LEFT JOIN crm_customer c ON o.customer_id = c.id
      WHERE o.stage NOT IN (5, 6) AND o.update_time < NOW() - INTERVAL 14 DAY
      LIMIT 20
    `);

    for (const o of staleOpps) {
      const [exists] = await pool.query(
        "SELECT id FROM crm_ai_suggestion WHERE type = 'opportunity' AND ref_id = ? AND create_time >= NOW() - INTERVAL 24 HOUR",
        [o.id]
      );
      if (exists.length === 0) {
        await pool.query(
          `INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by)
           VALUES ('opportunity', ?, ?, ?, ?)`,
          [o.id, `商机"${o.name}"（${o.company_name}）在当前阶段已停滞${o.stale_days}天，建议推进或重新评估。`, 0.75, userId]
        );
        created++;
      }
    }

    // 3. 高金额低赢率商机建议
    const [lowWinOpps] = await pool.query(`
      SELECT o.id, o.name, o.expected_amount, o.win_rate, c.company_name
      FROM crm_opportunity o
      LEFT JOIN crm_customer c ON o.customer_id = c.id
      WHERE o.stage NOT IN (5, 6) AND o.expected_amount >= 100000 AND (o.win_rate IS NULL OR o.win_rate < 30)
      LIMIT 10
    `);

    for (const o of lowWinOpps) {
      const [exists] = await pool.query(
        "SELECT id FROM crm_ai_suggestion WHERE type = 'pricing' AND ref_id = ? AND create_time >= NOW() - INTERVAL 24 HOUR",
        [o.id]
      );
      if (exists.length === 0) {
        await pool.query(
          `INSERT INTO crm_ai_suggestion (type, ref_id, suggestion, confidence, create_by)
           VALUES ('pricing', ?, ?, ?, ?)`,
          [o.id, `商机"${o.name}"（${o.company_name}）预期金额¥${Number(o.expected_amount).toLocaleString()}但赢率仅${o.win_rate || 0}%，建议重新评估定价策略或加强需求沟通。`, 0.70, userId]
        );
        created++;
      }
    }

    res.json({ code: 200, message: `生成完成，新增${created}条建议`, data: { created } });
  } catch (error) {
    console.error('生成AI建议错误:', error);
    res.status(500).json({ code: 500, message: '生成建议失败', data: null });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const pool = require('../config/database');
const { readOnlyPool } = require('../config/database');
const { chatCompletion } = require('../utils/llmClient');
const aiService = require('../services/aiRouteService');
const logger = require('../config/logger');

if (!process.env.DB_RO_HOST) {
  console.warn('[AI] 未配置DB_RO_*环境变量，AI查询将使用主数据库账号。建议配置只读数据库账号以降低安全风险。');
}

// --- Joi schemas ---

const chatSchema = Joi.object({
  messages: Joi.array().items(
    Joi.object({
      role: Joi.string().valid('user', 'assistant').required(),
      content: Joi.string().allow('').required()
    })
  ).default([]),
  context: Joi.string().allow('', null).optional()
});

const querySchema = Joi.object({
  question: Joi.string().trim().min(1).max(500).required()
});

const suggestionFeedbackSchema = Joi.object({
  id: Joi.number().integer().required(),
  is_accepted: Joi.boolean().optional(),
  feedback: Joi.string().allow('', null).optional().max(1000)
});

const emptySchema = Joi.object({});

router.post('/chat', authenticateToken, checkPermission('ai'), validate(chatSchema), async (req, res) => {
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

router.get('/status', authenticateToken, checkPermission('ai'), async (req, res) => {
  try {
    const status = await aiService.getAiStatus(pool);
    res.json({ code: 200, message: 'success', data: status });
  } catch (error) {
    logger.error('[AI助手] 获取状态失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.json({ code: 200, message: 'success', data: { online: false, provider: 'unknown', model: '', models: [] } });
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

router.post('/query', authenticateToken, checkPermission('ai'), validate(querySchema), async (req, res) => {
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
      return res.json({ code: 200, message: 'success', data: { sql: '', answer: '不支持多条语句。', rows: [] } });
    }
    // 现在去掉分号
    sql = sql.replace(/;/g, '').trim();

    if (!sql.toUpperCase().startsWith('SELECT')) {
      // AI 可能输出了非SQL内容，尝试提取SELECT语句
      const match = sql.match(/SELECT[\s\S]+?(?:;|$)/i);
      sql = match ? match[0] : '';
    }
    if (!sql || !sql.toUpperCase().startsWith('SELECT')) {
      return res.json({ code: 200, message: 'success', data: { sql: '', answer: '抱歉，无法理解该问题，请换个问法。', rows: [] } });
    }

    // 禁止危险操作和信息泄露
    const blocked = /\b(UNION|INTO\s+(OUTFILE|DUMPFILE)|LOAD\s+DATA|INFORMATION_SCHEMA|SLEEP|BENCHMARK|WAITFOR\s+DELAY|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;
    if (blocked.test(sql)) {
      return res.json({ code: 200, message: 'success', data: { sql: '', answer: '此操作不被允许（仅支持查询）。', rows: [] } });
    }

    // 禁止查询系统敏感表
    const sensitiveTables = /\b(sys_user|sys_role|sys_permission|sys_config|sys_backup_record)\b/i;
    if (sensitiveTables.test(sql)) {
      return res.json({ code: 200, message: 'success', data: { sql: '', answer: '不允许查询系统表。', rows: [] } });
    }

    // 第二步：执行 SQL（使用只读连接池）
    let rows;
    try {
      // 安全处理 LIMIT：如果SQL已有LIMIT则不追加，否则用子查询包裹
      const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
      const safeSql = hasLimit ? sql : `SELECT * FROM (${sql}) AS _ai_query LIMIT 50`;
      rows = await aiService.executeReadOnlyQuery(readOnlyPool, safeSql);
    } catch (dbError) {
      logger.error('[AI查询] SQL执行失败:', { sql: sql, error: dbError.message, traceId: req.traceId || 'N/A' });
      return res.json({ code: 200, message: 'success', data: { sql, answer: '生成的SQL有误，请换个问法。', rows: [] } });
    }

    if (!rows || rows.length === 0) {
      return res.json({ code: 200, message: 'success', data: { sql, answer: '查询结果为空。', rows: [] } });
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

    res.json({ code: 200, message: 'success', data: { sql, answer, rows: rows.slice(0, 20), total: rows.length } });
  } catch (error) {
    const msg = error.name === 'TimeoutError' ? '查询超时' : 'AI调用失败';
    res.status(503).json({ code: 503, message: msg, data: null });
  }
});

// AI建议列表
router.get('/suggestions', authenticateToken, checkPermission('ai'), async (req, res) => {
  try {
    const result = await aiService.getAiSuggestions(pool, req.query);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[AI助手] AI建议查询错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 标记建议采纳/反馈
router.post('/suggestion/feedback', authenticateToken, checkPermission('ai'), validate(suggestionFeedbackSchema), async (req, res) => {
  try {
    const { id, is_accepted, feedback } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '建议ID不能为空', data: null });

    const result = await aiService.submitFeedback(pool, id, is_accepted, feedback);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[AI助手] AI建议反馈错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 生成AI建议
router.post('/generate-suggestions', authenticateToken, checkPermission('ai'), validate(emptySchema), async (req, res) => {
  try {
    const result = await aiService.generateSuggestions(pool, req.user.userId);
    res.json({ code: 200, message: `生成完成，新增${result.created}条建议`, data: result });
  } catch (error) {
    logger.error('生成AI建议错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '生成建议失败', data: null });
  }
});

module.exports = router;

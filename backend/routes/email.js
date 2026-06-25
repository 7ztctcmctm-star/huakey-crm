const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const emailService = require('../services/emailService');

// Joi schemas
const accountSchema = Joi.object({
  email: Joi.string().email().required().max(200),
  password: Joi.string().required().max(500),
  display_name: Joi.string().max(100).allow('', null),
  imap_host: Joi.string().max(200).allow('', null),
  imap_port: Joi.number().integer().min(1).max(65535).allow(null),
  smtp_host: Joi.string().max(200).allow('', null),
  smtp_port: Joi.number().integer().min(1).max(65535).allow(null),
  use_ssl: Joi.number().integer().valid(0, 1).allow(null)
});

const sendSchema = Joi.object({
  account_id: Joi.number().integer().positive().required(),
  to: Joi.alternatives().try(
    Joi.string().email().max(200),
    Joi.array().items(Joi.string().email().max(200)).min(1)
  ).required(),
  cc: Joi.alternatives().try(
    Joi.string().email().max(200),
    Joi.array().items(Joi.string().email().max(200))
  ).allow('', null),
  subject: Joi.string().required().max(500),
  body_html: Joi.string().max(50000).allow('', null),
  reply_to_id: Joi.number().integer().positive().allow(null)
});

const replySchema = Joi.object({
  body_html: Joi.string().max(50000).allow('', null),
  account_id: Joi.number().integer().positive().allow(null)
});

const linkCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

// 1. 配置邮件账号
router.post('/account', authenticateToken, checkPermission('email'), validate(accountSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ code: 400, message: '邮箱和密码不能为空', data: null });

    const result = await emailService.createAccount(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '配置成功', data: result });
  } catch (error) {
    console.error('[邮件] 配置账号失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 2. 我的邮件账号列表
router.get('/accounts', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    const rows = await emailService.listAccounts(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[邮件] 查询账号失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 3. 删除账号
router.delete('/account/:id', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    await emailService.deleteAccount(pool, req.params.id, req.user.userId);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[邮件] 删除账号失败:', error);
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 4. 测试连接
router.post('/account/:id/test', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    const results = await emailService.testConnection(pool, req.params.id, req.user.userId);
    res.json({ code: 200, message: results.smtp ? '连接测试成功' : 'SMTP连接失败', data: results });
  } catch (error) {
    console.error('[邮件] 测试连接失败:', error);
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 5. 邮件列表
router.get('/list', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    const data = await emailService.listEmails(pool, req.query, req.user.userId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[邮件] 查询邮件列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 6. 邮件详情
router.get('/:id', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    const email = await emailService.getEmailDetail(pool, req.params.id);
    if (!email) return res.status(404).json({ code: 404, message: '邮件不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: email });
  } catch (error) {
    console.error('[邮件] 查询邮件详情失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 7. 发送邮件
router.post('/send', authenticateToken, checkPermission('email:send'), validate(sendSchema), async (req, res) => {
  try {
    const { account_id, to, subject } = req.body;
    if (!account_id || !to || !subject) return res.status(400).json({ code: 400, message: '参数不完整', data: null });

    const result = await emailService.sendEmail(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '发送成功', data: result });
  } catch (error) {
    console.error('[邮件] 发送失败:', error);
    console.error('[邮件] 发送失败:', error.message);
    res.status(500).json({ code: 500, message: '发送失败，请检查邮箱配置', data: null });
  }
});

// 8. 回复邮件
router.post('/reply/:id', authenticateToken, checkPermission('email:send'), validate(replySchema), async (req, res) => {
  try {
    const { body_html, account_id } = req.body;
    const email = await emailService.getEmailDetail(pool, req.params.id);
    if (!email) return res.status(404).json({ code: 404, message: '原邮件不存在', data: null });

    const to = email.direction === 'in' ? email.from_address : JSON.parse(email.to_addresses || '[]')[0];
    const subject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;

    const result = await emailService.sendEmail(pool, {
      account_id: account_id || email.account_id,
      to,
      subject,
      body_html,
      reply_to_id: req.params.id
    }, req.user.userId);

    res.json({ code: 200, message: '回复成功', data: result });
  } catch (error) {
    console.error('[邮件] 回复失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 9. 标记已读
router.put('/:id/read', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    await emailService.markAsRead(pool, req.params.id);
    res.json({ code: 200, message: '已标记已读', data: null });
  } catch (error) {
    console.error('[邮件] 标记已读失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 10. 标记星标
router.put('/:id/star', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    const result = await emailService.toggleStar(pool, req.params.id);
    res.json({ code: 200, message: result.is_starred ? '已星标' : '已取消星标', data: result });
  } catch (error) {
    console.error('[邮件] 星标操作失败:', error);
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 11. 手动关联客户
router.post('/:id/link-customer', authenticateToken, checkPermission('email'), validate(linkCustomerSchema), async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });

    await emailService.linkCustomer(pool, req.params.id, customer_id);
    res.json({ code: 200, message: '关联成功', data: null });
  } catch (error) {
    console.error('[邮件] 关联客户失败:', error);
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 12. 手动同步邮件
router.post('/sync/:account_id', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    await emailService.syncEmails(pool, req.params.account_id, req.user.userId);
    res.json({ code: 200, message: '同步完成（完整IMAP同步需配置IMAP服务）', data: null });
  } catch (error) {
    console.error('[邮件] 同步失败:', error);
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '同步失败', data: null });
  }
});

// 13. 邮件统计
router.get('/stats/overview', authenticateToken, checkPermission('email'), async (req, res) => {
  try {
    const data = await emailService.getEmailStats(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[邮件] 统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

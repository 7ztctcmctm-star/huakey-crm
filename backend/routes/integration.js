const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// 获取集成配置列表
router.get('/list', authenticateToken, checkPermission('system'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sys_integration ORDER BY id ASC');
    // 脱敏处理
    rows.forEach(row => {
      if (row.type === 'email' && row.config) {
        try {
          const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
          if (cfg.pass) cfg.pass = '***';
          row.config = cfg;
        } catch (e) { /* keep original */ }
      }
    });
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('集成配置查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 更新集成配置
router.post('/update', authenticateToken, checkPermission('system'), async (req, res) => {
  try {
    const { id, config } = req.body;
    if (!id || !config) {
      return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    }

    // 如果密码字段是 ***，保留原密码
    if (config.pass === '***') {
      const [existing] = await pool.query('SELECT config FROM sys_integration WHERE id = ?', [id]);
      if (existing.length > 0) {
        const oldCfg = typeof existing[0].config === 'string' ? JSON.parse(existing[0].config) : existing[0].config;
        config.pass = oldCfg.pass || '';
      }
    }

    const configStr = JSON.stringify(config);
    const hasAllFields = config.host && config.user && config.from;
    const status = hasAllFields ? 'active' : 'inactive';

    await pool.query(
      'UPDATE sys_integration SET config = ?, status = ? WHERE id = ?',
      [configStr, status, id]
    );

    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('集成配置更新错误:', error);
    res.status(500).json({ code: 500, message: '更新失败', data: null });
  }
});

// 测试邮件连接
router.post('/test', authenticateToken, checkPermission('system'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT config FROM sys_integration WHERE type = 'email' AND status = 'active' LIMIT 1"
    );

    if (rows.length === 0) {
      return res.status(400).json({ code: 400, message: '邮件未配置，请先保存配置', data: null });
    }

    const cfg = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;

    if (!cfg.host || !cfg.user || !cfg.pass) {
      return res.status(400).json({ code: 400, message: '邮件配置不完整', data: null });
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port || 465,
      secure: cfg.secure !== false,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false }
    });

    await transporter.verify();
    await transporter.close();

    await pool.query("UPDATE sys_integration SET status = 'active' WHERE type = 'email'");
    res.json({ code: 200, message: '连接测试成功', data: { success: true } });
  } catch (error) {
    console.error('邮件测试失败:', error.message);
    await pool.query("UPDATE sys_integration SET status = 'error' WHERE type = 'email'").catch(() => {});
    res.json({ code: 200, message: '连接测试失败: ' + error.message, data: { success: false, error: error.message } });
  }
});

// 发送邮件
router.post('/send-email', authenticateToken, async (req, res) => {
  try {
    const { to, subject, body, ref_type, ref_id } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ code: 400, message: '收件人、主题和内容不能为空', data: null });
    }

    const [rows] = await pool.query(
      "SELECT config FROM sys_integration WHERE type = 'email' AND status = 'active' LIMIT 1"
    );

    if (rows.length === 0) {
      return res.status(400).json({ code: 400, message: '邮件服务未配置', data: null });
    }

    const cfg = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port || 465,
      secure: cfg.secure !== false,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false }
    });

    try {
      await transporter.sendMail({
        from: cfg.from || cfg.user,
        to,
        subject,
        html: body
      });
      await transporter.close();

      await pool.query(
        'INSERT INTO sys_email_log (to_email, subject, body, type, status, ref_type, ref_id, send_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [to, subject, body, ref_type || null, 'sent', ref_type || null, ref_id || null, req.user.userId]
      );

      res.json({ code: 200, message: '邮件发送成功', data: null });
    } catch (sendError) {
      await pool.query(
        'INSERT INTO sys_email_log (to_email, subject, body, type, status, error_msg, ref_type, ref_id, send_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [to, subject, body, ref_type || null, 'failed', sendError.message, ref_type || null, ref_id || null, req.user.userId]
      );
      res.status(500).json({ code: 500, message: '邮件发送失败: ' + sendError.message, data: null });
    }
  } catch (error) {
    console.error('邮件发送错误:', error);
    res.status(500).json({ code: 500, message: '邮件发送失败', data: null });
  }
});

// 邮件日志列表
router.get('/email-log', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM sys_email_log');
    const [list] = await pool.query(
      `SELECT el.*, u.real_name as sender_name
       FROM sys_email_log el
       LEFT JOIN sys_user u ON el.send_by = u.id
       ORDER BY el.create_time DESC
       LIMIT ? OFFSET ?`,
      [parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200, message: '查询成功',
      data: { list, total: countResult[0].total }
    });
  } catch (error) {
    console.error('邮件日志查询错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

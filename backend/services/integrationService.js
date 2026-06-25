/**
 * 集成配置路由服务层
 * 从 routes/integration.js 提取的业务逻辑，供路由层复用
 */

/**
 * 获取集成配置列表（含脱敏）
 * @param {object} pool
 * @returns {Array}
 */
async function listIntegrations(pool) {
  const [rows] = await pool.query('SELECT * FROM sys_integration ORDER BY id ASC');

  rows.forEach(row => {
    if (row.config) {
      try {
        const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
        const sensitiveKeys = ['pass', 'password', 'secret', 'key', 'token', 'apikey', 'api_key', 'apiSecret', 'api_secret'];
        for (const k of Object.keys(cfg)) {
          if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) {
            cfg[k] = '***';
          }
        }
        row.config = cfg;
      } catch (e) {
        // 解析失败保持原值
      }
    }
  });

  return rows;
}

/**
 * 更新集成配置
 * @param {object} pool
 * @param {object} data - { id, config }
 */
async function updateIntegration(pool, data) {
  const { id, config } = data;
  if (!id || !config) {
    const err = new Error('参数不完整');
    err.code = 400;
    throw err;
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
}

/**
 * 测试邮件连接
 * @param {object} pool
 * @returns {{ success: boolean, message: string }}
 */
async function testIntegration(pool) {
  const [rows] = await pool.query(
    "SELECT config FROM sys_integration WHERE type = 'email' AND status = 'active' LIMIT 1"
  );

  if (rows.length === 0) {
    const err = new Error('邮件未配置，请先保存配置');
    err.code = 400;
    throw err;
  }

  const cfg = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;

  if (!cfg.host || !cfg.user || !cfg.pass) {
    const err = new Error('邮件配置不完整');
    err.code = 400;
    throw err;
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 465,
    secure: cfg.secure !== false,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false }
  });

  try {
    await transporter.verify();
    await transporter.close();
    await pool.query("UPDATE sys_integration SET status = 'active' WHERE type = 'email'");
    return { success: true, message: '连接测试成功' };
  } catch (error) {
    console.error('邮件测试失败:', error.message);
    await pool.query("UPDATE sys_integration SET status = 'error' WHERE type = 'email'").catch(() => {});
    return { success: false, message: '连接测试失败，请检查配置' };
  }
}

/**
 * 发送邮件
 * @param {object} pool
 * @param {object} data - { to, subject, body, ref_type, ref_id }
 * @param {number} userId - 发送人ID
 */
async function sendTestEmail(pool, data, userId) {
  const { to, subject, body, ref_type, ref_id } = data;
  if (!to || !subject || !body) {
    const err = new Error('收件人、主题和内容不能为空');
    err.code = 400;
    throw err;
  }

  const [rows] = await pool.query(
    "SELECT config FROM sys_integration WHERE type = 'email' AND status = 'active' LIMIT 1"
  );

  if (rows.length === 0) {
    const err = new Error('邮件服务未配置');
    err.code = 400;
    throw err;
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
    const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeBody = `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(body)}</pre>`;

    await transporter.sendMail({
      from: cfg.from || cfg.user,
      to,
      subject,
      html: safeBody
    });
    await transporter.close();

    await pool.query(
      'INSERT INTO sys_email_log (to_email, subject, body, type, status, ref_type, ref_id, send_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [to, subject, body, ref_type || null, 'sent', ref_type || null, ref_id || null, userId]
    );
  } catch (sendError) {
    await pool.query(
      'INSERT INTO sys_email_log (to_email, subject, body, type, status, error_msg, ref_type, ref_id, send_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [to, subject, body, ref_type || null, 'failed', sendError.message, ref_type || null, ref_id || null, userId]
    );
    const err = new Error('邮件发送失败: ' + sendError.message);
    err.code = 500;
    throw err;
  }
}

/**
 * 获取邮件日志列表
 * @param {object} pool
 * @param {object} params - { page, pageSize }
 * @returns {{ list: Array, total: number }}
 */
async function getEmailLog(pool, params = {}) {
  const { page = 1, pageSize = 20 } = params;
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

  return { list, total: countResult[0].total };
}

module.exports = {
  listIntegrations,
  updateIntegration,
  testIntegration,
  sendTestEmail,
  getEmailLog
};

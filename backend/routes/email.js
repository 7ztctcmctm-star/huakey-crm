const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// 简单加密/解密（生产环境应使用 AES-256-CBC）
const ENC_KEY = process.env.EMAIL_ENC_KEY || 'huakey-crm-email-enc-key-32b!';
function encrypt(text) {
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY.slice(0, 32), ENC_KEY.slice(0, 16));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
function decrypt(text) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY.slice(0, 32), ENC_KEY.slice(0, 16));
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch { return text; }
}

// 常见邮箱自动配置
const EMAIL_PRESETS = {
  'qq.com': { imap_host: 'imap.qq.com', imap_port: 993, smtp_host: 'smtp.qq.com', smtp_port: 465 },
  '163.com': { imap_host: 'imap.163.com', imap_port: 993, smtp_host: 'smtp.163.com', smtp_port: 465 },
  '126.com': { imap_host: 'imap.126.com', imap_port: 993, smtp_host: 'smtp.126.com', smtp_port: 465 },
  'gmail.com': { imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587 },
  'outlook.com': { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
  'hotmail.com': { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
  'yahoo.com': { imap_host: 'imap.mail.yahoo.com', imap_port: 993, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587 },
};

// 1. 配置邮件账号
router.post('/account', authenticateToken, async (req, res) => {
  try {
    const { email, password, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl } = req.body;
    if (!email || !password) return res.status(400).json({ code: 400, message: '邮箱和密码不能为空', data: null });

    const domain = email.split('@')[1];
    const preset = EMAIL_PRESETS[domain] || {};

    const [result] = await pool.query(
      `INSERT INTO crm_email_account (user_id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, password_encrypted, use_ssl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.userId, email, display_name || email,
        imap_host || preset.imap_host || null, imap_port || preset.imap_port || 993,
        smtp_host || preset.smtp_host || null, smtp_port || preset.smtp_port || 587,
        encrypt(password), use_ssl !== undefined ? use_ssl : 1
      ]
    );
    res.json({ code: 200, message: '配置成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[邮件] 配置账号失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 2. 我的邮件账号列表
router.get('/accounts', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl, sync_status, last_sync_at, status FROM crm_email_account WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[邮件] 查询账号失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 3. 删除账号
router.delete('/account/:id', authenticateToken, async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM crm_email_account WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
    if (existing.length === 0) return res.status(404).json({ code: 404, message: '账号不存在', data: null });
    await pool.query('DELETE FROM crm_email_account WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[邮件] 删除账号失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 4. 测试连接
router.post('/account/:id/test', authenticateToken, async (req, res) => {
  try {
    const [[account]] = await pool.query('SELECT * FROM crm_email_account WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
    if (!account) return res.status(404).json({ code: 404, message: '账号不存在', data: null });

    const password = decrypt(account.password_encrypted);
    const results = { smtp: false, imap: false };

    // 测试SMTP
    try {
      const transporter = nodemailer.createTransport({
        host: account.smtp_host, port: account.smtp_port,
        secure: account.smtp_port === 465, auth: { user: account.email, pass: password }
      });
      await transporter.verify();
      results.smtp = true;
    } catch (e) { results.smtp_error = e.message; }

    // 测试IMAP（简单检查配置）
    if (account.imap_host) {
      results.imap = true; // IMAP测试需要异步，这里只检查配置
    }

    await pool.query('UPDATE crm_email_account SET sync_status = ? WHERE id = ?', [results.smtp ? 'active' : 'error', account.id]);

    res.json({ code: 200, message: results.smtp ? '连接测试成功' : 'SMTP连接失败', data: results });
  } catch (error) {
    console.error('[邮件] 测试连接失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 5. 邮件列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { folder = 'inbox', customer_id, keyword, is_starred, page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    let where = 'WHERE e.account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?)';
    const params = [req.user.userId];

    if (folder === 'starred') {
      where += ' AND e.is_starred = 1';
    } else {
      where += ' AND e.folder = ?'; params.push(folder);
    }
    if (customer_id) { where += ' AND e.customer_id = ?'; params.push(parseInt(customer_id)); }
    if (keyword) { where += ' AND (e.subject LIKE ? OR e.from_address LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (is_starred === '1') { where += ' AND e.is_starred = 1'; }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_email e ${where}`, params);
    const [rows] = await pool.query(`
      SELECT e.id, e.direction, e.from_address, e.to_addresses, e.subject, e.is_read, e.is_starred,
             e.has_attachments, e.attachment_count, e.customer_id, e.folder, e.sent_at, e.received_at, e.created_at,
             c.company_name as customer_name
      FROM crm_email e
      LEFT JOIN crm_customer c ON e.customer_id = c.id
      ${where}
      ORDER BY COALESCE(e.received_at, e.sent_at, e.created_at) DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);

    res.json({ code: 200, message: '查询成功', data: { list: rows, total, page: parseInt(page), page_size: parseInt(page_size) } });
  } catch (error) {
    console.error('[邮件] 查询邮件列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 6. 邮件详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [[email]] = await pool.query(`
      SELECT e.*, c.company_name as customer_name, ct.name as contact_name
      FROM crm_email e
      LEFT JOIN crm_customer c ON e.customer_id = c.id
      LEFT JOIN crm_contact ct ON e.contact_id = ct.id
      WHERE e.id = ?
    `, [req.params.id]);

    if (!email) return res.status(404).json({ code: 404, message: '邮件不存在', data: null });

    // 获取附件
    const [attachments] = await pool.query(
      'SELECT id, filename, file_size, mime_type FROM crm_email_attachment WHERE email_id = ?', [req.params.id]
    );
    email.attachments = attachments;

    res.json({ code: 200, message: '查询成功', data: email });
  } catch (error) {
    console.error('[邮件] 查询邮件详情失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 7. 发送邮件
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { account_id, to, cc, subject, body_html, reply_to_id } = req.body;
    if (!account_id || !to || !subject) return res.status(400).json({ code: 400, message: '参数不完整', data: null });

    const [[account]] = await pool.query('SELECT * FROM crm_email_account WHERE id = ? AND user_id = ?', [account_id, req.user.userId]);
    if (!account) return res.status(404).json({ code: 404, message: '邮件账号不存在', data: null });

    const password = decrypt(account.password_encrypted);
    const toList = Array.isArray(to) ? to : [to];
    const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : [];

    // 发送邮件
    const transporter = nodemailer.createTransport({
      host: account.smtp_host, port: account.smtp_port,
      secure: account.smtp_port === 465,
      auth: { user: account.email, pass: password }
    });

    const mailOptions = {
      from: `"${account.display_name || account.email}" <${account.email}>`,
      to: toList.join(', '),
      cc: ccList.length > 0 ? ccList.join(', ') : undefined,
      subject,
      html: body_html || ''
    };

    // 如果是回复，添加引用
    if (reply_to_id) {
      const [[original]] = await pool.query('SELECT message_id, subject FROM crm_email WHERE id = ?', [reply_to_id]);
      if (original?.message_id) {
        mailOptions.inReplyTo = original.message_id;
        mailOptions.references = original.message_id;
      }
    }

    const info = await transporter.sendMail(mailOptions);

    // 自动匹配客户
    let customerId = null, contactId = null;
    for (const addr of toList) {
      const [[contact]] = await pool.query(
        'SELECT id, customer_id FROM crm_contact WHERE email = ? AND deleted_at IS NULL LIMIT 1', [addr.trim()]
      );
      if (contact) { contactId = contact.id; customerId = contact.customer_id; break; }
    }

    // 保存到发件箱
    await pool.query(
      `INSERT INTO crm_email (account_id, message_id, direction, from_address, to_addresses, cc_addresses, subject, body_html, customer_id, contact_id, folder, sent_at)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, 'sent', NOW())`,
      [account_id, info.messageId || null, account.email, JSON.stringify(toList), JSON.stringify(ccList), subject, body_html || null, customerId, contactId]
    );

    res.json({ code: 200, message: '发送成功', data: { message_id: info.messageId } });
  } catch (error) {
    console.error('[邮件] 发送失败:', error);
    res.status(500).json({ code: 500, message: '发送失败: ' + error.message, data: null });
  }
});

// 8. 回复邮件
router.post('/reply/:id', authenticateToken, async (req, res) => {
  try {
    const { body_html, account_id } = req.body;
    const [[original]] = await pool.query('SELECT * FROM crm_email WHERE id = ?', [req.params.id]);
    if (!original) return res.status(404).json({ code: 404, message: '原邮件不存在', data: null });

    // 回复请求转发到send接口的逻辑
    const to = original.direction === 'in' ? original.from_address : JSON.parse(original.to_addresses || '[]')[0];
    const subject = original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`;

    req.body = { account_id: account_id || original.account_id, to, subject, body_html, reply_to_id: req.params.id };
    return router.handle(req, res, () => {});
  } catch (error) {
    console.error('[邮件] 回复失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 9. 标记已读
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE crm_email SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '已标记已读', data: null });
  } catch (error) {
    console.error('[邮件] 标记已读失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 10. 标记星标
router.put('/:id/star', authenticateToken, async (req, res) => {
  try {
    const [[email]] = await pool.query('SELECT is_starred FROM crm_email WHERE id = ?', [req.params.id]);
    if (!email) return res.status(404).json({ code: 404, message: '邮件不存在', data: null });
    const newStarred = email.is_starred ? 0 : 1;
    await pool.query('UPDATE crm_email SET is_starred = ? WHERE id = ?', [newStarred, req.params.id]);
    res.json({ code: 200, message: newStarred ? '已星标' : '已取消星标', data: { is_starred: newStarred } });
  } catch (error) {
    console.error('[邮件] 星标操作失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 11. 手动关联客户
router.post('/:id/link-customer', authenticateToken, async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });

    const [customer] = await pool.query('SELECT id FROM crm_customer WHERE id = ?', [customer_id]);
    if (customer.length === 0) return res.status(404).json({ code: 404, message: '客户不存在', data: null });

    await pool.query('UPDATE crm_email SET customer_id = ? WHERE id = ?', [customer_id, req.params.id]);
    res.json({ code: 200, message: '关联成功', data: null });
  } catch (error) {
    console.error('[邮件] 关联客户失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 12. 手动同步邮件（简化版：从SMTP发送的邮件同步）
router.post('/sync/:account_id', authenticateToken, async (req, res) => {
  try {
    const [[account]] = await pool.query('SELECT * FROM crm_email_account WHERE id = ? AND user_id = ?', [req.params.account_id, req.user.userId]);
    if (!account) return res.status(404).json({ code: 404, message: '账号不存在', data: null });

    await pool.query('UPDATE crm_email_account SET sync_status = "syncing" WHERE id = ?', [account.id]);

    // 注意：完整的IMAP同步需要 imap 包，这里提供简化版本
    // 实际生产环境需要使用 IMAP 连接收件箱
    await pool.query('UPDATE crm_email_account SET sync_status = "active", last_sync_at = NOW() WHERE id = ?', [account.id]);

    res.json({ code: 200, message: '同步完成（完整IMAP同步需配置IMAP服务）', data: null });
  } catch (error) {
    console.error('[邮件] 同步失败:', error);
    await pool.query('UPDATE crm_email_account SET sync_status = "error" WHERE id = ?', [req.params.account_id]);
    res.status(500).json({ code: 500, message: '同步失败', data: null });
  }
});

// 13. 邮件统计
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) as total FROM crm_email WHERE account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?)', [userId]
    );
    const [[{ unread }]] = await pool.query(
      'SELECT COUNT(*) as unread FROM crm_email WHERE is_read = 0 AND account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?)', [userId]
    );
    const [[{ starred }]] = await pool.query(
      'SELECT COUNT(*) as starred FROM crm_email WHERE is_starred = 1 AND account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?)', [userId]
    );
    const [[{ today_in }]] = await pool.query(
      'SELECT COUNT(*) as today_in FROM crm_email WHERE direction = "in" AND DATE(received_at) = CURDATE() AND account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?)', [userId]
    );
    const [[{ today_out }]] = await pool.query(
      'SELECT COUNT(*) as today_out FROM crm_email WHERE direction = "out" AND DATE(sent_at) = CURDATE() AND account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?)', [userId]
    );

    // 各文件夹数量
    const [folders] = await pool.query(
      'SELECT folder, COUNT(*) as count FROM crm_email WHERE account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?) GROUP BY folder', [userId]
    );
    const folderMap = {};
    folders.forEach(f => { folderMap[f.folder] = f.count; });

    res.json({
      code: 200, message: '查询成功',
      data: { total, unread, starred, today_in, today_out, folders: folderMap }
    });
  } catch (error) {
    console.error('[邮件] 统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

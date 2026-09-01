/**
 * 邮件服务层
 * 从 routes/email.js 提取的业务逻辑，供路由层复用
 */

const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// 简单加密/解密（生产环境应使用 AES-256-CBC）
const ENC_KEY = process.env.EMAIL_ENC_KEY;

function encrypt(text) {
  if (!ENC_KEY) throw new AppError(ErrorCodes.INTERNAL_ERROR, 'EMAIL_ENC_KEY 未配置，无法加密邮箱密码');
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY.slice(0, 32), ENC_KEY.slice(0, 16));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(text) {
  if (!ENC_KEY) { console.warn('[Email] EMAIL_ENC_KEY未配置，密码将明文返回'); return text; }
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

/**
 * 配置邮件账号
 * @param {object} pool
 * @param {object} params - { email, password, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl }
 * @param {number} userId
 * @returns {{ id: number }}
 */
async function createAccount(pool, params, userId) {
  const { email, password, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl } = params;

  const domain = email.split('@')[1];
  const preset = EMAIL_PRESETS[domain] || {};

  const [result] = await pool.query(
    `INSERT INTO crm_email_account (user_id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, password_encrypted, use_ssl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, email, display_name || email,
      imap_host || preset.imap_host || null, imap_port || preset.imap_port || 993,
      smtp_host || preset.smtp_host || null, smtp_port || preset.smtp_port || 587,
      encrypt(password), use_ssl !== undefined ? use_ssl : 1
    ]
  );

  return { id: result.insertId };
}

/**
 * 更新邮件账号（仅限本人账号，password 可选更新）
 * @param {object} pool
 * @param {number} id
 * @param {object} params - { email, password, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl }
 * @param {number} userId
 * @returns {{ id: number }}
 */
async function updateAccount(pool, id, params, userId) {
  const { email, password, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl } = params;

  const [existing] = await pool.query('SELECT id FROM crm_email_account WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId]);
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '账号不存在');
  }

  const updates = ['display_name = ?', 'imap_host = ?', 'imap_port = ?', 'smtp_host = ?', 'smtp_port = ?', 'use_ssl = ?'];
  const values = [
    display_name || null,
    imap_host || null,
    imap_port || null,
    smtp_host || null,
    smtp_port || null,
    use_ssl !== undefined ? use_ssl : 1
  ];
  if (email) { updates.push('email = ?'); values.push(email); }
  if (password) { updates.push('password_encrypted = ?'); values.push(encrypt(password)); }
  values.push(id);

  await pool.query(`UPDATE crm_email_account SET ${updates.join(', ')} WHERE id = ?`, values);
  return { id };
}

/**
 * 获取用户的邮件账号列表
 * @param {object} pool
 * @param {number} userId
 * @returns {Array}
 */
async function listAccounts(pool, userId) {
  const [rows] = await pool.query(
    'SELECT id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, use_ssl, sync_status, last_sync_at, status FROM crm_email_account WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

/**
 * 删除邮件账号（软删除）
 * @param {object} pool
 * @param {number} id
 * @param {number} userId
 */
async function deleteAccount(pool, id, userId) {
  const [existing] = await pool.query('SELECT id FROM crm_email_account WHERE id = ? AND user_id = ?', [id, userId]);
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '账号不存在')
  }
  await pool.query('UPDATE crm_email_account SET deleted_at = NOW() WHERE id = ?', [id]);
}

/**
 * 测试邮件连接
 * @param {object} pool
 * @param {number} id
 * @param {number} userId
 * @returns {{ smtp: boolean, imap: boolean, smtp_error?: string }}
 */
async function testConnection(pool, id, userId) {
  const [[account]] = await pool.query(
    'SELECT id, user_id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, password_encrypted, use_ssl, sync_status, last_sync_at, status, created_at, updated_at FROM crm_email_account WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  if (!account) {
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '账号不存在')
  }

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
    results.imap = true;
  }

  await pool.query('UPDATE crm_email_account SET sync_status = ? WHERE id = ?', [results.smtp ? 'active' : 'error', account.id]);

  return results;
}

/**
 * 邮件列表
 * @param {object} pool
 * @param {object} params - { folder, customer_id, keyword, is_starred, page, pageSize }
 * @param {number} userId
 * @returns {{ list: Array, total: number, page: number, pageSize: number }}
 */
async function listEmails(pool, params, userId) {
  const { folder = 'inbox', customer_id, keyword, is_starred, page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE e.account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?)';
  const queryParams = [userId];

  if (folder === 'starred') {
    where += ' AND e.is_starred = 1';
  } else {
    where += ' AND e.folder = ?'; queryParams.push(folder);
  }
  if (customer_id) { where += ' AND e.customer_id = ?'; queryParams.push(parseInt(customer_id)); }
  if (keyword) { where += ' AND (e.subject LIKE ? OR e.from_address LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`); }
  if (is_starred === '1') { where += ' AND e.is_starred = 1'; }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_email e ${where}`, queryParams);
  const [rows] = await pool.query(`
    SELECT e.id, e.direction, e.from_address, e.to_addresses, e.subject, e.is_read, e.is_starred,
           e.has_attachments, e.attachment_count, e.customer_id, e.folder, e.sent_at, e.received_at, e.created_at,
           c.company_name as customer_name
    FROM crm_email e
    LEFT JOIN crm_customer c ON e.customer_id = c.id
    ${where}
    ORDER BY COALESCE(e.received_at, e.sent_at, e.created_at) DESC
    LIMIT ? OFFSET ?
  `, [...queryParams, parseInt(pageSize), offset]);

  return { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

/**
 * 邮件详情
 * @param {object} pool
 * @param {number} id
 * @returns {object|null}
 */
async function getEmailDetail(pool, id) {
  const [[email]] = await pool.query(`
    SELECT e.id, e.account_id, e.message_id, e.direction, e.from_address, e.to_addresses, e.cc_addresses,
           e.subject, e.body_text, e.body_html, e.has_attachments, e.attachment_count,
           e.customer_id, e.contact_id, e.is_read, e.is_starred, e.folder, e.sent_at, e.received_at, e.created_at,
           c.company_name as customer_name, ct.name as contact_name
    FROM crm_email e
    LEFT JOIN crm_customer c ON e.customer_id = c.id
    LEFT JOIN crm_contact ct ON e.contact_id = ct.id
    WHERE e.id = ?
  `, [id]);

  if (!email) return null;

  const [attachments] = await pool.query(
    'SELECT id, filename, file_size, mime_type FROM crm_email_attachment WHERE email_id = ?', [id]
  );
  email.attachments = attachments;

  return email;
}

/**
 * 发送邮件
 * @param {object} pool
 * @param {object} params - { account_id, to, cc, subject, body_html, reply_to_id }
 * @param {number} userId
 * @returns {{ message_id: string }}
 */
async function sendEmail(pool, params, userId) {
  const { account_id, to, cc, subject, body_html, reply_to_id } = params;

  const [[account]] = await pool.query(
    'SELECT id, user_id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, password_encrypted, use_ssl, sync_status, last_sync_at, status, created_at, updated_at FROM crm_email_account WHERE id = ? AND user_id = ?',
    [account_id, userId]
  );
  if (!account) {
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '邮件账号不存在')
  }

  const password = decrypt(account.password_encrypted);
  const toList = Array.isArray(to) ? to : [to];
  const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : [];

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

  return { message_id: info.messageId };
}

/**
 * 标记已读
 * @param {object} pool
 * @param {number} id
 */
async function markAsRead(pool, id) {
  await pool.query('UPDATE crm_email SET is_read = 1 WHERE id = ?', [id]);
}

/**
 * 切换星标
 * @param {object} pool
 * @param {number} id
 * @returns {{ is_starred: number }}
 */
async function toggleStar(pool, id) {
  const [[email]] = await pool.query('SELECT is_starred FROM crm_email WHERE id = ?', [id]);
  if (!email) {
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '邮件不存在')
  }
  const newStarred = email.is_starred ? 0 : 1;
  await pool.query('UPDATE crm_email SET is_starred = ? WHERE id = ?', [newStarred, id]);
  return { is_starred: newStarred };
}

/**
 * 手动关联客户
 * @param {object} pool
 * @param {number} emailId
 * @param {number} customerId
 */
async function linkCustomer(pool, emailId, customerId) {
  const [customer] = await pool.query('SELECT id FROM crm_customer WHERE id = ?', [customerId]);
  if (customer.length === 0) {
    throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, '客户不存在')
  }
  await pool.query('UPDATE crm_email SET customer_id = ? WHERE id = ?', [customerId, emailId]);
}

/**
 * 手动同步邮件
 * @param {object} pool
 * @param {number} accountId
 * @param {number} userId
 */
async function syncEmails(pool, accountId, userId) {
  const [[account]] = await pool.query(
    'SELECT id, user_id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, password_encrypted, use_ssl, sync_status, last_sync_at, status, created_at, updated_at FROM crm_email_account WHERE id = ? AND user_id = ?',
    [accountId, userId]
  );
  if (!account) {
    throw new AppError(ErrorCodes.RECORD_NOT_FOUND, '账号不存在')
  }

  try {
    await pool.query('UPDATE crm_email_account SET sync_status = "syncing" WHERE id = ?', [account.id]);

    // 注意：完整的IMAP同步需要 imap 包，这里提供简化版本
    await pool.query('UPDATE crm_email_account SET sync_status = "active", last_sync_at = NOW() WHERE id = ?', [account.id]);
  } catch (error) {
    await pool.query('UPDATE crm_email_account SET sync_status = "error" WHERE id = ?', [accountId]).catch(() => {});
    throw error;
  }
}

/**
 * 邮件统计
 * @param {object} pool
 * @param {number} userId
 * @returns {object}
 */
async function getEmailStats(pool, userId) {
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

  const [folders] = await pool.query(
    'SELECT folder, COUNT(*) as count FROM crm_email WHERE account_id IN (SELECT id FROM crm_email_account WHERE user_id = ?) GROUP BY folder', [userId]
  );
  const folderMap = {};
  folders.forEach(f => { folderMap[f.folder] = f.count; });

  return { total, unread, starred, today_in, today_out, folders: folderMap };
}

module.exports = {
  encrypt,
  decrypt,
  createAccount,
  updateAccount,
  listAccounts,
  deleteAccount,
  testConnection,
  listEmails,
  getEmailDetail,
  sendEmail,
  markAsRead,
  toggleStar,
  linkCustomer,
  syncEmails,
  getEmailStats
};

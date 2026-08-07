/**
 * API平台核心服务层
 * 从 routes/api-platform.js 提取的数据库操作
 */

// ============ API Key CRUD ============

async function listKeys(pool) {
  const [rows] = await pool.query('SELECT id, name, api_key, permissions, rate_limit, status, last_used_at, expires_at, create_time FROM crm_api_key WHERE deleted_at IS NULL ORDER BY create_time DESC');
  return rows;
}

async function createKey(pool, data) {
  const { name, api_key, api_secret, permissions, rate_limit, expires_at, create_by } = data;
  const [result] = await pool.query(
    'INSERT INTO crm_api_key (name, api_key, api_secret, permissions, rate_limit, expires_at, create_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, api_key, api_secret, permissions, rate_limit || 100, expires_at || null, create_by]
  );
  return { id: result.insertId };
}

async function updateKey(pool, id, fields, values) {
  values.push(id);
  await pool.query(`UPDATE crm_api_key SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
}

async function deleteKey(pool, id) {
  await pool.query('UPDATE crm_api_key SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function regenerateKey(pool, id, newKey, newSecret) {
  await pool.query('UPDATE crm_api_key SET api_key = ?, api_secret = ? WHERE id = ? AND deleted_at IS NULL', [newKey, newSecret, id]);
}

// ============ Webhook CRUD ============

async function listWebhooks(pool) {
  const [rows] = await pool.query('SELECT id, name, url, events, secret, status, last_triggered_at, fail_count, create_by, create_time, update_time, deleted_at FROM crm_webhook WHERE deleted_at IS NULL ORDER BY create_time DESC');
  return rows;
}

async function createWebhook(pool, data) {
  const { name, url, events, secret, create_by } = data;
  const [result] = await pool.query(
    'INSERT INTO crm_webhook (name, url, events, secret, create_by) VALUES (?, ?, ?, ?, ?)',
    [name, url, events, secret, create_by]
  );
  return { id: result.insertId };
}

async function updateWebhook(pool, id, fields, values) {
  values.push(id);
  await pool.query(`UPDATE crm_webhook SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
}

async function deleteWebhook(pool, id) {
  await pool.query('UPDATE crm_webhook SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getWebhookById(pool, id) {
  const [[webhook]] = await pool.query('SELECT id, name, url, events, secret, status, last_triggered_at, fail_count, create_by, create_time, update_time, deleted_at FROM crm_webhook WHERE id = ? AND deleted_at IS NULL', [id]);
  return webhook || null;
}

// ============ Webhook 日志 ============

async function getWebhookLogs(pool, webhookId) {
  const [rows] = await pool.query(
    'SELECT id, webhook_id, event_type, payload, response_status, response_body, status, create_time FROM crm_webhook_log WHERE webhook_id = ? ORDER BY create_time DESC LIMIT 50',
    [webhookId]
  );
  return rows;
}

async function insertWebhookLog(pool, data) {
  const { webhook_id, event_type, payload, response_status, response_body, status } = data;
  await pool.query(
    'INSERT INTO crm_webhook_log (webhook_id, event_type, payload, response_status, response_body, status) VALUES (?, ?, ?, ?, ?, ?)',
    [webhook_id, event_type, payload, response_status || null, response_body || null, status]
  );
}

async function updateWebhookTrigger(pool, id, success) {
  if (success) {
    await pool.query('UPDATE crm_webhook SET last_triggered_at = NOW(), fail_count = 0 WHERE id = ?', [id]);
  } else {
    await pool.query('UPDATE crm_webhook SET fail_count = fail_count + 1 WHERE id = ?', [id]);
  }
}

module.exports = {
  listKeys, createKey, updateKey, deleteKey, regenerateKey,
  listWebhooks, createWebhook, updateWebhook, deleteWebhook, getWebhookById,
  getWebhookLogs, insertWebhookLog, updateWebhookTrigger
};

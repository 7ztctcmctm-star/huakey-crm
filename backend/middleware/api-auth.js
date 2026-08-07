const pool = require('../config/database');

// API Key 认证中间件（用于外部API调用）
const apiAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ code: 401, message: '缺少 X-API-Key 请求头', data: null });
  }

  try {
    const [[key]] = await pool.query(
      'SELECT id, name, status, expires_at, permissions FROM crm_api_key WHERE api_key = ? AND deleted_at IS NULL',
      [apiKey]
    );

    if (!key) {
      return res.status(401).json({ code: 401, message: 'API Key 无效', data: null });
    }

    if (!key.status) {
      return res.status(403).json({ code: 403, message: 'API Key 已禁用', data: null });
    }

    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(403).json({ code: 403, message: 'API Key 已过期', data: null });
    }

    // 更新最后使用时间
    await pool.query('UPDATE crm_api_key SET last_used_at = NOW() WHERE id = ?', [key.id]);

    // 解析权限
    let permissions = [];
    try { permissions = JSON.parse(key.permissions || '[]'); } catch { /* */ }

    req.apiKey = { id: key.id, name: key.name, permissions };
    next();
  } catch (error) {
    console.error('[API认证] 验证失败:', error);
    res.status(500).json({ code: 500, message: '认证服务异常', data: null });
  }
};

// 检查API权限
const requireApiPermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ code: 401, message: '未认证', data: null });
    }
    if (req.apiKey.permissions.includes('*') || req.apiKey.permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ code: 403, message: `无权限: ${permission}`, data: null });
  };
};

module.exports = { apiAuth, requireApiPermission };

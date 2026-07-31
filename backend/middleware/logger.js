const pool = require('../config/database');
const { maskLogParams } = require('../utils/mask');
const logger = require('../config/logger');

// 统一操作日志表，废弃旧操作日志表双写方案
const LOG_TABLE = 'sys_log';

const LogLevel = {
  SUCCESS: 1,
  FAIL: 0
};

const ModuleType = {
  CUSTOMER: '客户管理',
  OPPORTUNITY: '商机管理',
  QUOTATION: '报价管理',
  CONTRACT: '合同管理',
  PAYMENT: '回款管理',
  SERVICE: '售后服务',
  USER: '用户管理',
  SYSTEM: '系统管理'
};

// 根据字段名对单个值进行脱敏（用于 changedFields 数组中的 old/new 值）
function maskFieldValue(fieldName, value) {
  if (value === undefined || value === null) return value;
  const wrapped = { [fieldName]: value };
  const masked = maskLogParams(wrapped);
  return masked[fieldName];
}

async function logAction({ module, action, method, url, params, ipAddress, userId, userName, description, status = 1, errorMsg = null, changedFields = null, oldValue = null, newValue = null }) {
  try {
    // 脱敏处理
    const maskedParams = params && typeof params === 'object' ? maskLogParams(params) : params;

    let paramsStr = null;
    if (maskedParams) {
      if (typeof maskedParams === 'object') {
        try {
          paramsStr = JSON.stringify(maskedParams);
          if (paramsStr.length > 2000) {
            paramsStr = paramsStr.substring(0, 2000) + '...[truncated]';
          }
        } catch (e) {
          paramsStr = String(maskedParams);
        }
      } else {
        paramsStr = String(maskedParams);
      }
    }

    if (paramsStr && paramsStr.length > 2000) {
      paramsStr = paramsStr.substring(0, 2000) + '...[truncated]';
    }

    // 字段级变更日志脱敏：按字段名对 old/new 值脱敏
    const maskedChangedFields = changedFields
      ? changedFields.map(item => ({
          ...item,
          old: maskFieldValue(item.field, item.old),
          new: maskFieldValue(item.field, item.new)
        }))
      : null;
    const maskedOldValue = oldValue && typeof oldValue === 'object' ? maskLogParams(oldValue) : oldValue;
    const maskedNewValue = newValue && typeof newValue === 'object' ? maskLogParams(newValue) : newValue;

    const changedFieldsStr = maskedChangedFields ? JSON.stringify(maskedChangedFields).substring(0, 2000) : null;
    const oldValueStr = maskedOldValue ? JSON.stringify(maskedOldValue).substring(0, 2000) : null;
    const newValueStr = maskedNewValue ? JSON.stringify(maskedNewValue).substring(0, 2000) : null;

    await pool.query(
      `INSERT INTO \`${LOG_TABLE}\` (module, action, method, url, params, ip_address, user_id, user_name, description, status, error_msg, changed_fields, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [module, action, method || 'POST', url, paramsStr, ipAddress, userId, userName, description, status, errorMsg, changedFieldsStr, oldValueStr, newValueStr]
    );
  } catch (error) {
    logger.error('记录操作日志失败', { error: error.stack || error.message });
  }
}

function getIpAddress(req) {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         '0.0.0.0';
}

function extractUserInfo(req) {
  return {
    userId: req.user?.id || req.user?.userId || null,
    userName: req.user?.real_name || req.user?.realName || req.user?.username || null
  };
}

function logMiddleware(module) {
  return async (req, res, next) => {
    const traceId = req.traceId || 'N/A';
    const originalJson = res.json.bind(res);

    res.json = function(data) {
      const { userId, userName } = extractUserInfo(req);
      const action = `${module}_${req.method === 'POST' ? 'create' : req.method === 'PUT' || req.method === 'UPDATE' ? 'update' : 'delete'}`;
      const status = data?.code === 200 ? LogLevel.SUCCESS : LogLevel.FAIL;

      logAction({
        module,
        action,
        method: req.method,
        url: req.originalUrl,
        params: req.method === 'GET' ? req.query : req.body,
        ipAddress: getIpAddress(req),
        userId,
        userName,
        description: `${module} - ${req.method} ${req.originalUrl} [traceId=${traceId}]`,
        status,
        errorMsg: status === LogLevel.FAIL ? (data?.message || JSON.stringify(data)) : null
      }).catch(err => console.error(`[traceId=${traceId}] 日志记录失败:`, err));

      return originalJson(data);
    };

    next();
  };
}

const MODULE_MAP = {
  'customer': '客户管理',
  'follow-up': '客户管理',
  'leads': '线索管理',
  'opportunity': '商机管理',
  'quote': '报价管理',
  'contract': '合同管理',
  'service': '售后服务',
  'user': '用户管理',
  'auth': '认证管理',
  'report': '数据报表',
  'product': '产品管理',
  'supplier': '供应商管理',
  'team-dashboard': '团队看板',
  'reminder': '提醒管理',
  'ai': 'AI助手',
  'dept': '部门管理',
  'role': '角色管理',
  'log': '操作日志'
};

const ACTION_MAP = {
  'list': '查询列表',
  'detail': '查看详情',
  'add': '新增',
  'create': '新增',
  'update': '编辑',
  'edit': '编辑',
  'delete': '删除',
  'remove': '删除',
  'login': '登录',
  'logout': '登出',
  'register': '注册',
  'profile': '获取用户信息',
  'pool': '客户池',
  'modules': '模块列表',
  'clear': '清理',
  'dashboard-stats': '仪表盘统计',
  'import': '导入',
  'export': '导出'
};

function getModuleFromUrl(url) {
  const match = url.match(/^\/api\/([^\/\?]+)/);
  if (!match) return '系统管理';
  const segment = match[1].toLowerCase();
  return MODULE_MAP[segment] || '系统管理';
}

function getActionFromUrl(url, method) {
  if (method === 'GET') {
    const segments = url.replace(/^\/api\/[^\/]+\/?/, '').split('/').filter(Boolean);
    const last = segments[segments.length - 1] || 'list';
    return ACTION_MAP[last] || '查询';
  }
  if (method === 'POST') {
    if (url.includes('/add') || url.includes('/create')) return '新增';
    if (url.includes('/update') || url.includes('/edit')) return '编辑';
    if (url.includes('/delete') || url.includes('/remove')) return '删除';
    if (url.includes('/list')) return '查询列表';
    if (url.includes('/login')) return '登录';
    if (url.includes('/logout')) return '登出';
    if (url.includes('/register')) return '注册';
    if (url.includes('/clear')) return '清理';
    if (url.includes('/import')) return '导入';
    if (url.includes('/export')) return '导出';
    return '操作';
  }
  if (method === 'PUT' || method === 'PATCH') return '编辑';
  if (method === 'DELETE') return '删除';
  return '请求';
}

// 全局自动日志中间件
function globalLogMiddleware(req, res, next) {
  const start = Date.now();

  // 响应完成时记录访问日志
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.http('API request', {
      req,
      statusCode: res.statusCode,
      durationMs
    });
  });

  // 跳过日志相关请求，避免无限循环
  if (req.originalUrl.startsWith('/api/log')) {
    return next();
  }
  // 跳过健康检查和根路径（兼容旧 /api/ 和新 /api/v1/ 前缀）
  if (req.originalUrl === '/api/v1/health' || req.originalUrl === '/api/health' || req.originalUrl === '/api/v1/' || req.originalUrl === '/api/') {
    return next();
  }
  // 跳过登录/登出（auth路由已自行记录详细日志）
  if (req.originalUrl === '/api/auth/login' || req.originalUrl === '/api/auth/logout') {
    return next();
  }

  const traceId = req.traceId || 'N/A';
  const startTime = Date.now();
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    const responseTime = Date.now() - startTime;
    const module = getModuleFromUrl(req.originalUrl);
    const action = getActionFromUrl(req.originalUrl, req.method);
    const status = (data && data.code === 200) ? 1 : 0;
    const { userId, userName } = extractUserInfo(req);

    logAction({
      module,
      action,
      method: req.method,
      url: req.originalUrl,
      params: req.method === 'GET' ? req.query : req.body,
      ipAddress: getIpAddress(req),
      userId,
      userName,
      description: `${module} - ${action} [${responseTime}ms] [traceId=${traceId}]`,
      status,
      errorMsg: status === 0 ? (data?.message || '操作失败') : null
    }).catch(err => logger.error(`[traceId=${traceId}] 日志记录失败`, { error: err.stack || err.message }));

    return originalJson(data);
  };

  next();
}

function createRouteLogger(moduleName) {
  return (req, action, description, status, errorMsg) =>
    logAction({
      module: moduleName,
      action,
      method: req.method,
      url: req.originalUrl,
      params: req.method === 'GET' ? req.query : req.body,
      ipAddress: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '0.0.0.0',
      userId: req.user?.userId || req.user?.id || null,
      userName: req.user?.real_name || req.user?.username || null,
      description, status, errorMsg
    });
}

module.exports = {
  logAction,
  createRouteLogger,
  getIpAddress,
  extractUserInfo,
  logMiddleware,
  globalLogMiddleware,
  LogLevel,
  ModuleType
};
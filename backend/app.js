const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const app = express();
const pkg = require('./package.json');
const logger = require('./config/logger');
const { appErrorHandler, globalErrorHandler } = require('./middleware/errorHandler');

// [性能优化] 响应压缩（放在最前面）
app.use(compression({
  threshold: 1024,
  level: 6
}));
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Vercel Serverless 环境需要 trust proxy
if (isProduction || process.env.VERCEL) {
  app.set('trust proxy', 1);
}

// 安全头配置
// 说明: NAS 部署走 HTTP，禁用依赖 HTTPS 的特性（HSTS/COOP/OAC/CSP-upgrade）
if (isProduction) {
  // 生产环境（HTTP）：仅保留基础安全头，禁用 HTTPS 依赖特性
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // helmet 8.x 默认会自动合并 upgrade-insecure-requests / base-uri / form-action / script-src-attr
        // HTTP 部署下必须显式置 null 移除 upgrade-insecure-requests，否则浏览器会把所有 HTTP 资源升级为 HTTPS 导致加载失败
        upgradeInsecureRequests: null,
      }
    },
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
    hsts: false,
  }));
} else {
  // 开发环境：轻量安全头
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "http://localhost:5000"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      }
    },
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
    hsts: false,
  }));
}

// 慢查询日志（拦截 pool.query，必须在路由加载之前执行）
require('./config/slowQuery');

// 注入 Trace ID（需放在 CORS 之前，确保所有响应都带 X-Trace-Id）
const traceIdMiddleware = require('./middleware/traceId');
app.use(traceIdMiddleware);

// 错误告警
const { alertError } = require('./utils/alert');

// Prometheus 指标中间件（记录每个请求的 Counter + Histogram）
const { metricsMiddleware, startPoolMetricsCollection } = require('./config/metrics');
app.use(metricsMiddleware);

// CORS 配置：生产环境必须显式设置 CORS_ORIGIN，开发环境限制为本地前端
// 支持逗号分隔的多 Origin（如 https://a.example.com,https://b.example.com）
const corsOriginRaw = isProduction
  ? process.env.CORS_ORIGIN
  : 'http://localhost:5173';

// 解析逗号分隔的多 Origin；cors 中间件 origin 支持字符串/数组
const corsOrigin = corsOriginRaw
  ? corsOriginRaw.split(',').map(item => item.trim()).filter(Boolean)
  : false;

/**
 * 生产环境安全配置校验
 * 启动前强制检查，避免使用不安全的默认值上线
 */
function validateProductionSecurity() {
  if (!isProduction) return;

  const fatal = (msg) => {
    console.error(`FATAL: ${msg}`); // 启动前尚未加载 logger
    process.exit(1);
  };

  // CORS_ORIGIN 必须设置且不能指向本地开发地址
  // corsOrigin 为数组（单个 Origin 时长度为 1），逐项校验
  if (!corsOrigin || corsOrigin.length === 0) {
    fatal('生产环境必须设置 CORS_ORIGIN 环境变量');
  }
  const bannedLocal = corsOrigin.find(o => {
    const lower = o.toLowerCase();
    return lower.includes('localhost') || lower.includes('127.0.0.1');
  });
  if (bannedLocal) {
    fatal(`生产环境 CORS_ORIGIN 不能设置为 localhost 或 127.0.0.1（当前值: ${bannedLocal}）`);
  }

  // 禁止生产环境跳过验证码
  if (process.env.SKIP_CAPTCHA === 'true') {
    fatal('生产环境禁止设置 SKIP_CAPTCHA=true');
  }

  // 禁止生产环境开启 Swagger
  if (process.env.ENABLE_SWAGGER === 'true') {
    fatal('生产环境禁止设置 ENABLE_SWAGGER=true');
  }

  // 禁止生产环境关闭 TLS 证书校验
  if (process.env.TLS_REJECT_UNAUTHORIZED === 'false') {
    fatal('生产环境禁止设置 TLS_REJECT_UNAUTHORIZED=false');
  }

  // JWT_SECRET 必须为 64 字节 hex（128 字符）
  const jwtSecret = process.env.JWT_SECRET || '';
  if (!/^[a-f0-9]{128}$/i.test(jwtSecret)) {
    fatal('生产环境 JWT_SECRET 必须是 64 字节随机十六进制字符串（128 字符）');
  }
}

validateProductionSecurity();

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));
app.use(cookieParser());

// CSRF 防护中间件（double-submit cookie）
// 注意：必须在 cookieParser 之后，业务路由之前挂载
const { csrfProtection } = require('./middleware/csrf');
app.use(csrfProtection);

// JSON body 限制 1MB（文件上传走 multipart，不受此限制）
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 加载日志中间件
const { globalLogMiddleware } = require('./middleware/logger');

// 加载限流中间件
const { apiLimiter } = require('./middleware/rateLimiter');

// 统一响应格式中间件
const responseFormat = require('./middleware/responseFormat');

// 模块注册器（试点：product、report）
// [2026-09-14 阶段4] customer 模块已下线：老树 /api/v1/customer/* 不再挂载。
// 其能力路由（contact/assign/import/detailExtras）现由下方 apiRouter.use('/customers', ...) 直接挂载。
const registry = require('./core/ModuleRegistry');
require('./routes/product/module');
require('./routes/report/module');
require('./routes/dataManagement/module'); // 数据管理域（质量检查剥离，Prompt 4-5）

// 加载路由
// auth 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/auth');
// user 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/user');
// follow-up 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/followUp');
// opportunity 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/opportunity');
// quote 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/quote');
// contract 文件缺失（预存问题，暂不迁移）
const contractRoutes = require('./routes/contract');
// service 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/service');
require('./routes/role');
require('./routes/dept');
require('./routes/log');
const teamDashboardRoutes = require('./routes/teamDashboard');
const reminderRoutes = require('./routes/reminder');
// notification 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/notification');
// ai 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/ai');
// supplier 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/supplier');
// purchase 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/purchase');
require('./routes/config');
const targetRoutes = require('./routes/target');
require('./routes/permission');
// recycle 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/recycle');
// backup 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/backup');
// analysis 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/analysis');
const integrationRoutes = require('./routes/integration');
const uploadRoutes = require('./routes/upload');
const searchRoutes = require('./routes/search');
const tagRoutes = require('./routes/tag');
const contractTemplateRoutes = require('./routes/contractTemplate');
const followupTemplateRoutes = require('./routes/followupTemplate');
const scoringRoutes = require('./routes/scoring');
// approval 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/approval');
const knowledgeRoutes = require('./routes/knowledge');
const surveyRoutes = require('./routes/survey');
const inventoryRoutes = require('./routes/inventory');
const sseRoutes = require('./routes/sse');
// procurement-plan 通过 ModuleRegistry 注册（require 触发 register），不再赋值给变量
require('./routes/procurement-plan');
const financeEnhancedRoutes = require('./routes/finance-enhanced');
// hr 通过 ModuleRegistry 注册（require 触发 register），不再赋值给变量
require('./routes/hr');
// automation 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/automation');
// calendar 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/calendar');
// social 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/social');
// api-platform 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/api-platform');
// competitor 通过 ModuleRegistry 注册（2026-09-21 迁移）
require('./routes/competitor');
// currency 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/currency');
// email 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/email');
// invoice 通过 ModuleRegistry 注册（2026-09-24 迁移）
require('./routes/invoice');

// API 路由前缀 /api
const apiRouter = express.Router();

// 全局API限流
apiRouter.use(apiLimiter);

// 全局操作日志中间件（自动记录所有API请求）
apiRouter.use(globalLogMiddleware);

// 统一响应格式中间件（确保所有 API 返回 { code, message, data } 三元组）
apiRouter.use(responseFormat);


// 测试路由
apiRouter.get('/', (req, res) => {
  res.json({
    code: 200,
    message: '欢迎使用铧旗CRM系统 API',
    data: {
      name: '铧旗CRM系统 API',
      version: pkg.version,
      build: pkg.version,
      status: 'running'
    }
  });
});

// 健康检查
apiRouter.get('/health', async (req, res) => {
  let dbOk = false;
  let redisOk = false;
  let mysqlVersion = '未知';

  // 检测数据库
  try {
    const pool = require('./config/database');
    const [rows] = await pool.query('SELECT VERSION() AS v');
    dbOk = true;
    if (rows && rows[0]) mysqlVersion = 'MySQL ' + rows[0].v;
  } catch (e) { console.error("[health] DB check failed:", e.message); }

  // 检测Redis（仅当显式启用时才要求 Redis 可用）
  try {
    const { redis, REDIS_ENABLED } = require('./config/redis');
    const redisEnabled = REDIS_ENABLED === 'true' || REDIS_ENABLED === true;
    if (!redisEnabled) {
      redisOk = true; // Redis 未启用，不视为故障
    } else if (redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch (e) { console.error("[health] Redis check failed:", e.message); }

  // 健康检查：DB 或核心依赖不可用时返回 503，触发容器编排层摘流/重启
  const healthy = dbOk && redisOk;
  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    code: statusCode,
    message: healthy ? '服务运行正常' : '服务降级（数据库或 Redis 不可用）',
    data: {
      status: healthy ? 'ok' : 'degraded',
      version: pkg.version,
      nodeEnv: process.env.NODE_ENV || 'development',
      expressVersion: require('express/package.json').version,
      mysqlVersion,
      db: dbOk,
      redis: redisOk,
      timestamp: new Date().toISOString()
    }
  });
});

// auth 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// （登录限流在 routes/auth.js 内单独挂载，避免验证码接口被误限 —— 不受 ModuleRegistry 影响）
// user 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）

// 试点模块：通过 ModuleRegistry 自动挂载
for (const { prefix, router } of registry.getAllRoutes()) {
  apiRouter.use(prefix, router);
}

// 客户中心 API —— 唯一命名空间：/customers、/leads、/pool
// [2026-09-14 阶段4] 老树 /api/v1/customer/* 已整树下线（ModuleRegistry 注册移除 +
// routes/customer/{module,index,detail}.js 删除）；CRUD 由 routes/customers.js 承载。
apiRouter.use('/leads', require('./routes/leads'));
apiRouter.use('/pool', require('./routes/pool'));
apiRouter.use('/customers', require('./routes/customers'));

// 客户域「能力型」子路由（阶段3 复挂；阶段4 后为唯一挂载点）。
// 复用这些 router 对象，无重复实现。
apiRouter.use('/customers/contact', require('./routes/customer/contact'));
apiRouter.use('/customers', require('./routes/customer/assign'));
apiRouter.use('/customers', require('./routes/customer/import'));
apiRouter.use('/customers', require('./routes/customer/detailExtras'));

// follow-up 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// opportunity 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// product 已通过 registry 挂载
// quote 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
apiRouter.use('/contract', contractRoutes);
// service 已通过 ModuleRegistry 自动挂载
// supplier 已通过 ModuleRegistry 自动挂载
// purchase 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// [P0-1 fix] 子路由加显式前缀，否则与主 /purchase 路由路径冲突（前端期望 /purchase/request/list 等）
apiRouter.use('/purchase/request', require('./routes/purchase/request'));
apiRouter.use('/purchase/comparison', require('./routes/purchase/comparison'));
// role 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// dept 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// report 已通过 registry 挂载
// log 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
apiRouter.use('/team-dashboard', teamDashboardRoutes);
apiRouter.use('/reminder', reminderRoutes);
// notification 已通过 ModuleRegistry 自动挂载
// config 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
apiRouter.use('/target', targetRoutes);
// permission 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// recycle 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// backup 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// [安全清理] /follow-plan 已合并到 /follow-up/plan/*，不再单独挂载
// ai 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// analysis 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
apiRouter.use('/integration', integrationRoutes);
apiRouter.use('/upload', uploadRoutes);
apiRouter.use('/search', searchRoutes);
apiRouter.use('/tag', tagRoutes);
apiRouter.use('/contract-template', contractTemplateRoutes);
apiRouter.use('/followup-templates', followupTemplateRoutes);
apiRouter.use('/scoring', scoringRoutes);
// approval 已通过 ModuleRegistry 自动挂载
apiRouter.use('/knowledge', knowledgeRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/sse', sseRoutes);
// procurement-plan 已通过 ModuleRegistry 自动挂载（2026-09-21 试点迁移）
apiRouter.use('/finance', financeEnhancedRoutes);
// hr 已通过 ModuleRegistry 自动挂载（2026-09-21 试点迁移）
// automation 已通过 ModuleRegistry 自动挂载
// calendar 已通过 ModuleRegistry 自动挂载
// social 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// api-platform 已通过 ModuleRegistry 自动挂载
// competitor 已通过 ModuleRegistry 自动挂载
// currency 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// email 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
// invoice 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）

// cron 通过 ModuleRegistry 注册（2026-09-24 迁移）
// Vercel Cron Jobs 端点（也兼容本地 node-cron）
require('./routes/cronJobs');

// Swagger API 文档（开发/测试环境可用）
const { authenticateToken } = require('./middleware/auth');
const ROLES = require('./config/roles');
const { ADMIN_ROLE_CODES } = ROLES;






if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  const { swaggerUi, swaggerSpec } = require('./config/swagger');
  apiRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info('[Swagger] API 文档已挂载: /api/docs');
}

// 系统健康检查（管理员）



apiRouter.get('/system/health', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.manageAll || ADMIN_ROLE_CODES.has(req.user.roleCode);
    if (!isAdmin) {
      return res.status(403).json({ code: 403, message: '仅管理员可查看', data: null });
    }

    // 数据库连接检查
    let dbStatus = 'ok';
    let dbLatency = 0;
    const dbStart = Date.now();
    try {
      await pool.query('SELECT 1');
      dbLatency = Date.now() - dbStart;
    } catch (e) {
      dbStatus = 'error';
    }

    // 数据库表统计
    const [tables] = await pool.query(`
      SELECT TABLE_NAME as name, TABLE_ROWS as \`rows\`,
        ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as size_mb
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC LIMIT 10
    `, [process.env.DB_NAME || 'huakey_crm']);

    // 在线用户
    const [[onlineUserRow]] = await pool.query(
      'SELECT COUNT(*) as count FROM sys_user WHERE status = 1'
    );

    const memUsage = process.memoryUsage();

    res.json({
      code: 200, message: '查询成功',
      data: {
        server: {
          uptime: Math.floor(process.uptime()),
          node_version: process.version,
          memory_used: Math.round(memUsage.heapUsed / 1024 / 1024),
          memory_total: Math.round(memUsage.heapTotal / 1024 / 1024)
        },
        database: {
          status: dbStatus,
          latency_ms: dbLatency,
          top_tables: tables
        },
        active_users: onlineUserRow.count
      }
    });
  } catch (error) {
    logger.error('[服务器] 健康检查错误:', { error: error.stack || error.message, traceId: req.traceId });
    res.status(500).json({ code: 500, message: '健康检查失败', data: null });
  }
});

// Prometheus 指标端点（仅管理员）
const { register: metricsRegister, client: metricsClient } = require('./config/metrics');

apiRouter.get('/metrics', authenticateToken, async (req, res) => {
  const isAdmin = req.user.manageAll || ADMIN_ROLE_CODES.has(req.user.roleCode);
  if (!isAdmin) {
    return res.status(403).json({ code: 403, message: '仅管理员可访问', data: null });
  }
  res.set('Content-Type', metricsClient.register.contentType);
  res.end(await metricsRegister.metrics());
});

// 客户端性能指标（无需认证）—— 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）
require('./routes/metrics');

// 使用 /api/v1 前缀
app.use('/api/v1', apiRouter);

// 调查模块单独注册（公开回复接口不需要token）
app.use('/api/v1/survey', responseFormat, surveyRoutes);

// 统一业务错误处理（AppError + Joi 校验错误）
app.use(appErrorHandler);

// 全局错误处理中间件（捕获所有未处理的错误）
app.use(globalErrorHandler);

// 生产环境：直接托管前端静态文件
const path = require('path');
const fs = require('fs');

// 文件上传：生产环境由 Supabase Storage 提供，本地开发保留 /uploads 静态服务
const uploadsDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir));
}

const distPath = fs.existsSync(path.join(__dirname, 'frontend', 'dist'))
  ? path.join(__dirname, 'frontend', 'dist')
  : path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '请求的资源不存在',
    data: null
  });
});

// 数据库连接池
const pool = require('./config/database');

// Vercel Serverless 环境：跳过 node-cron 和 app.listen（由平台处理）
if (!process.env.VERCEL) {
  // 启动定时任务（已抽取到 cron/scheduler.js，带失败重试和执行日志）
  const { startAllCronJobs } = require('./cron/scheduler');
  startAllCronJobs(pool);

  // 启动数据库连接池指标采集（每15秒）
  startPoolMetricsCollection(pool);

  // 全局未捕获Promise拒绝处理器
  process.on('unhandledRejection', (reason) => {
    logger.error('[UnhandledRejection]', {
      message: reason?.message || reason,
      stack: reason?.stack?.substring(0, 500)
    });

    alertError({
      level: 'critical',
      source: 'UnhandledRejection',
      message: reason?.stack || reason?.message || String(reason),
    });

    // 不 exit，只记录。让PM2/Docker重启策略处理
  });

  // 全局未捕获异常处理器
  process.on('uncaughtException', (err) => {
    logger.error('[UncaughtException]', {
      message: err.message,
      stack: err.stack?.substring(0, 500)
    });

    alertError({
      level: 'critical',
      source: 'UncaughtException',
      message: err.stack || err.message,
    });

    // 给进程1秒写日志后退出，让Docker自动重启
    setTimeout(() => process.exit(1), 1000);
  });

  // Redis 初始化（可选，REDIS_ENABLED=true 时启用）
  const { REDIS_ENABLED } = require('./config/redis');
  if (REDIS_ENABLED) {
    const { redis } = require('./config/redis');
    redis.connect().catch(err => {
      console.warn('[Redis] 启动连接失败，缓存已禁用:', err.message);
    });
  }

  // 启动服务器
  const server = app.listen(PORT, () => {
    logger.info('[服务器] 启动成功', { port: PORT });
    logger.info('[服务器] API地址', { apiUrl: `http://localhost:${PORT}/api` });
  });

  // 优雅关闭
  const shutdown = async (signal) => {
    logger.info(`[Shutdown] 收到 ${signal}，开始优雅关闭...`);

    // 停止接收新连接
    server.close(() => {
      logger.info('[Shutdown] HTTP 服务已关闭');
    });

    // 关闭数据库连接池
    try {
      const pool = require('./config/database');
      await pool.end();
      logger.info('[Shutdown] 数据库连接池已关闭');
    } catch (e) {
      logger.error('[Shutdown] 关闭数据库连接池失败:', e.message);
    }

    // 关闭 Redis
    if (REDIS_ENABLED) {
      try {
        const { redis } = require('./config/redis');
        await redis.quit();
        logger.info('[Shutdown] Redis 连接已关闭');
      } catch (e) { /* ignore */ }
    }

    // 停止定时任务
    try {
      const { stopAllCronJobs } = require('./cron/scheduler');
      stopAllCronJobs();
    } catch (e) { /* ignore */ }

    logger.info('[Shutdown] 优雅关闭完成');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;

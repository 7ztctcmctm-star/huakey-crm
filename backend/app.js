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

// 启用 helmet 安全头（CSP、X-Frame-Options 等）
// HSTS 关闭：本地 HTTP 部署不需要 HSTS
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
  hsts: false,
}));

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
const corsOrigin = isProduction
  ? process.env.CORS_ORIGIN
  : 'http://localhost:5173';

if (isProduction && !corsOrigin) {
  console.error('FATAL: 生产环境必须设置 CORS_ORIGIN 环境变量'); // 启动前尚未加载 logger
  process.exit(1);
}

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 加载日志中间件
const { globalLogMiddleware } = require('./middleware/logger');

// 加载限流中间件
const { apiLimiter } = require('./middleware/rateLimiter');

// 统一响应格式中间件
const responseFormat = require('./middleware/responseFormat');

// 模块注册器（试点：customer、product、report）
const registry = require('./core/ModuleRegistry');
require('./routes/customer/module');
require('./routes/product/module');
require('./routes/report/module');

// 加载路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const followUpRoutes = require('./routes/followUp');
const opportunityRoutes = require('./routes/opportunity');
const quoteRoutes = require('./routes/quote');
const contractRoutes = require('./routes/contract');
const serviceRoutes = require('./routes/service');
const roleRoutes = require('./routes/role');
const deptRoutes = require('./routes/dept');
const logRoutes = require('./routes/log');
const teamDashboardRoutes = require('./routes/teamDashboard');
const reminderRoutes = require('./routes/reminder');
const notificationRoutes = require('./routes/notification');
const aiRoutes = require('./routes/ai');
const supplierRoutes = require('./routes/supplier');
const purchaseRoutes = require('./routes/purchase');
const configRoutes = require('./routes/config');
const targetRoutes = require('./routes/target');
const permissionRoutes = require('./routes/permission');
const recycleRoutes = require('./routes/recycle');
const backupRoutes = require('./routes/backup');
const followPlanRoutes = require('./routes/followPlan');
const analysisRoutes = require('./routes/analysis');
const integrationRoutes = require('./routes/integration');
const uploadRoutes = require('./routes/upload');
const searchRoutes = require('./routes/search');
const tagRoutes = require('./routes/tag');
const contractTemplateRoutes = require('./routes/contractTemplate');
const followupTemplateRoutes = require('./routes/followupTemplate');
const scoringRoutes = require('./routes/scoring');
const approvalRoutes = require('./routes/approval');
const knowledgeRoutes = require('./routes/knowledge');
const surveyRoutes = require('./routes/survey');
const inventoryRoutes = require('./routes/inventory');
const sseRoutes = require('./routes/sse');
const procurementPlanRoutes = require('./routes/procurement-plan');
const financeEnhancedRoutes = require('./routes/finance-enhanced');
const hrRoutes = require('./routes/hr');
const automationRoutes = require('./routes/automation');
const calendarRoutes = require('./routes/calendar');
const socialRoutes = require('./routes/social');
const apiPlatformRoutes = require('./routes/api-platform');
const competitorRoutes = require('./routes/competitor');
const currencyRoutes = require('./routes/currency');
const emailRoutes = require('./routes/email');
const invoiceRoutes = require('./routes/invoice');

// API 路由前缀 /api
const apiRouter = express.Router();

// 全局API限流
apiRouter.use(apiLimiter);

// 全局操作日志中间件（自动记录所有API请求）
apiRouter.use(globalLogMiddleware);

// 统一响应格式中间件（确保所有 API 返回 { code, message, data } 三元组）
apiRouter.use(responseFormat);

// 统一业务错误处理（AppError + Joi 校验错误）
apiRouter.use(appErrorHandler);

// 全局错误处理中间件（捕获路由中未处理的错误）
apiRouter.use(globalErrorHandler);

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
  } catch { /* ok */ }

  // 检测Redis
  try {
    const { redis, REDIS_ENABLED } = require('./config/redis');
    if (REDIS_ENABLED && redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch { /* ok */ }

  res.json({
    code: 200,
    message: '服务运行正常',
    data: {
      status: 'ok',
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

// 认证路由（登录限流在 routes/auth.js 内单独挂载，避免验证码接口被误限）
apiRouter.use('/auth', authRoutes);

// 用户管理路由
apiRouter.use('/user', userRoutes);

// 试点模块：通过 ModuleRegistry 自动挂载
for (const { prefix, router } of registry.getAllRoutes()) {
  apiRouter.use(prefix, router);
}

// 跟进记录路由
apiRouter.use('/follow-up', followUpRoutes);
apiRouter.use('/opportunity', opportunityRoutes);
// product 已通过 registry 挂载
apiRouter.use('/quote', quoteRoutes);
apiRouter.use('/contract', contractRoutes);
apiRouter.use('/service', serviceRoutes);
apiRouter.use('/supplier', supplierRoutes);
apiRouter.use('/purchase', purchaseRoutes);
apiRouter.use('/purchase', require('./routes/purchase/request'));
apiRouter.use('/purchase', require('./routes/purchase/comparison'));
apiRouter.use('/role', roleRoutes);
apiRouter.use('/dept', deptRoutes);
// report 已通过 registry 挂载
apiRouter.use('/log', logRoutes);
apiRouter.use('/team-dashboard', teamDashboardRoutes);
apiRouter.use('/reminder', reminderRoutes);
apiRouter.use('/notification', notificationRoutes);
apiRouter.use('/config', configRoutes);
apiRouter.use('/target', targetRoutes);
apiRouter.use('/permission', permissionRoutes);
apiRouter.use('/recycle', recycleRoutes);
apiRouter.use('/backup', backupRoutes);
apiRouter.use('/follow-plan', followPlanRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/analysis', analysisRoutes);
apiRouter.use('/integration', integrationRoutes);
apiRouter.use('/upload', uploadRoutes);
apiRouter.use('/search', searchRoutes);
apiRouter.use('/tag', tagRoutes);
apiRouter.use('/contract-template', contractTemplateRoutes);
apiRouter.use('/followup-templates', followupTemplateRoutes);
apiRouter.use('/scoring', scoringRoutes);
apiRouter.use('/approval', approvalRoutes);
apiRouter.use('/knowledge', knowledgeRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/sse', sseRoutes);
apiRouter.use('/procurement-plan', procurementPlanRoutes);
apiRouter.use('/finance', financeEnhancedRoutes);
apiRouter.use('/hr', hrRoutes);
apiRouter.use('/automation', automationRoutes);
apiRouter.use('/calendar', calendarRoutes);
apiRouter.use('/social', socialRoutes);
apiRouter.use('/platform', apiPlatformRoutes);
apiRouter.use('/competitor', competitorRoutes);
apiRouter.use('/currency', currencyRoutes);
apiRouter.use('/email', emailRoutes);
apiRouter.use('/invoice', invoiceRoutes);

// Vercel Cron Jobs 端点（也兼容本地 node-cron）
const cronJobRoutes = require('./routes/cronJobs');
apiRouter.use('/cron', cronJobRoutes);

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

// 客户端性能指标（无需认证）
apiRouter.use('/metrics', require('./routes/metrics'));

// 使用 /api/v1 前缀
app.use('/api/v1', apiRouter);

// 调查模块单独注册（公开回复接口不需要token）
app.use('/api/v1/survey', responseFormat, surveyRoutes);

// 旧 /api 前缀重定向到 /api/v1（兼容期至 2026-08-01）
app.use('/api', (req, res) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Aug 2026 00:00:00 GMT');
  res.redirect(307, '/api/v1' + req.originalUrl.replace(/^\/api/, ''));
});

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

// 全局错误处理中间件
app.use(globalErrorHandler);

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

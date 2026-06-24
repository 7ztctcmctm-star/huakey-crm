const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const app = express();

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

// 启用 helmet 安全头（CSP、HSTS、X-Frame-Options 等）
app.use(helmet());

// CORS 配置：生产环境使用白名单，开发环境限制为本地前端
const corsOrigin = isProduction
  ? (process.env.CORS_ORIGIN || 'https://your-domain.com')
  : 'http://localhost:5173';

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
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

// 加载路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const customerRoutes = require('./routes/customer');
const followUpRoutes = require('./routes/followUp');
const opportunityRoutes = require('./routes/opportunity');
const productRoutes = require('./routes/product');
const quoteRoutes = require('./routes/quote');
const contractRoutes = require('./routes/contract');
const serviceRoutes = require('./routes/service');
const reportRoutes = require('./routes/report');
const roleRoutes = require('./routes/role');
const deptRoutes = require('./routes/dept');
const logRoutes = require('./routes/log');
const teamDashboardRoutes = require('./routes/teamDashboard');
const reminderRoutes = require('./routes/reminder');
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

// 全局错误处理中间件（捕获路由中未处理的错误）
apiRouter.use((err, req, res, next) => {
  const ctx = {
    userId: req.user?.userId || 'anonymous',
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    body: req.method !== 'GET' ? JSON.stringify(req.body).substring(0, 500) : undefined
  };
  console.error('[ErrorHandler]', { ...ctx, error: err.stack || err.message });
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    code: statusCode,
    message: statusCode === 500 ? '服务器内部错误' : (err.message || '请求失败'),
    data: null
  });
});

// 测试路由
apiRouter.get('/', (req, res) => {
  res.json({
    code: 200,
    message: '欢迎使用铧旗CRM系统 API',
    data: {
      name: '铧旗CRM系统 API',
      version: 'crm_v1',
      build: '1.0.0',
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
  } catch {}

  // 检测Redis
  try {
    const { redis, REDIS_ENABLED } = require('./config/redis');
    if (REDIS_ENABLED && redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch {}

  res.json({
    code: 200,
    message: '服务运行正常',
    data: {
      status: 'ok',
      version: 'crm_v1',
      nodeEnv: process.env.NODE_ENV || 'development',
      expressVersion: require('express/package.json').version,
      mysqlVersion,
      db: dbOk,
      redis: redisOk,
      timestamp: new Date().toISOString()
    }
  });
});

// 认证路由（更严格的限流）
apiRouter.use('/auth', authLimiter, authRoutes);

// 用户管理路由
apiRouter.use('/user', userRoutes);

// 客户管理路由
apiRouter.use('/customer', customerRoutes);

// 跟进记录路由
apiRouter.use('/follow-up', followUpRoutes);
apiRouter.use('/opportunity', opportunityRoutes);
apiRouter.use('/product', productRoutes);
apiRouter.use('/quote', quoteRoutes);
apiRouter.use('/contract', contractRoutes);
apiRouter.use('/service', serviceRoutes);
apiRouter.use('/supplier', supplierRoutes);
apiRouter.use('/purchase', purchaseRoutes);
apiRouter.use('/role', roleRoutes);
apiRouter.use('/dept', deptRoutes);
apiRouter.use('/report', reportRoutes);
apiRouter.use('/log', logRoutes);
apiRouter.use('/team-dashboard', teamDashboardRoutes);
apiRouter.use('/reminder', reminderRoutes);
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

// 系统健康检查（管理员）
const { authenticateToken } = require('./middleware/auth');
const ROLES = require('./config/roles');
apiRouter.get('/system/health', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.manageAll || req.user.roleId === ROLES.ADMIN;
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
    console.error('[服务器] 健康检查错误:', error);
    res.status(500).json({ code: 500, message: '健康检查失败', data: null });
  }
});

// 使用 /api 前缀
app.use('/api', apiRouter);

// 调查模块单独注册（公开回复接口不需要token）
app.use('/api/survey', surveyRoutes);

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
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const ctx = {
    userId: req.user?.userId || 'anonymous',
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  };
  console.error('[AppErrorHandler]', { ...ctx, error: err.stack || err.message });

  res.status(statusCode).json({
    code: statusCode,
    message: statusCode === 500 ? '服务器内部错误，请稍后重试' : (err.message || '操作失败'),
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

  // 全局未捕获Promise拒绝处理器
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UnhandledRejection]', {
      message: reason?.message || reason,
      stack: reason?.stack?.substring(0, 500),
      timestamp: new Date().toISOString()
    });
    // 不 exit，只记录。让PM2/Docker重启策略处理
  });

  // 全局未捕获异常处理器
  process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', {
      message: err.message,
      stack: err.stack?.substring(0, 500),
      timestamp: new Date().toISOString()
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
  app.listen(PORT, () => {
    console.log('[服务器] 启动成功，端口: ' + PORT);
    console.log('[服务器] API地址: http://localhost:' + PORT + '/api');
  });
}

module.exports = app;

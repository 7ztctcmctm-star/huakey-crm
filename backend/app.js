const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS 配置：开发环境允许所有来源，生产环境按需配置
const corsOrigin = isProduction
  ? (process.env.CORS_ORIGIN || 'http://localhost:5173')
  : '*';

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 统一响应格式中间件
app.use((req, res, next) => {
  res.success = (data = null, message = '操作成功') => {
    res.json({
      code: 200,
      message,
      data
    });
  };

  res.error = (message = '操作失败', code = 500) => {
    res.status(code).json({
      code,
      message,
      data: null
    });
  };

  next();
});

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

// API 路由前缀 /api
const apiRouter = express.Router();

// 全局API限流
apiRouter.use(apiLimiter);

// 全局操作日志中间件（自动记录所有API请求）
apiRouter.use(globalLogMiddleware);

// 测试路由
apiRouter.get('/', (req, res) => {
  res.success({
    name: '铧旗CRM系统 API',
    version: 'crm_v1',
    build: '1.0.0',
    status: 'running'
  }, '欢迎使用铧旗CRM系统 API');
});

// 健康检查
apiRouter.get('/health', (req, res) => {
  res.success({
    status: 'ok',
    version: 'crm_v1',
    timestamp: new Date().toISOString()
  }, '服务运行正常');
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

// 系统健康检查（管理员）
const { authenticateToken } = require('./middleware/auth');
apiRouter.get('/system/health', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.manageAll || req.user.roleId === 1;
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
      SELECT TABLE_NAME as name, TABLE_ROWS as rows, ROUND(DATA_LENGTH/1024/1024, 2) as size_mb
      FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY DATA_LENGTH DESC LIMIT 10
    `);

    // 在线用户（最近10分钟有请求）
    const [onlineUsers] = await pool.query(
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
        active_users: onlineUsers[0].count
      }
    });
  } catch (error) {
    console.error('健康检查错误:', error);
    res.status(500).json({ code: 500, message: '健康检查失败', data: null });
  }
});

// 使用 /api 前缀
app.use('/api', apiRouter);

// 生产环境：直接托管前端静态文件
const path = require('path');
const fs = require('fs');

// 静态文件服务：上传文件
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const distPath = path.join(__dirname, '..', 'frontend', 'dist');
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
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    console.error('服务器错误:', err.message);
    
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
      code: statusCode,
      message: statusCode === 500 ? '服务器内部错误，请稍后重试' : (err.message || '操作失败'),
      data: null
    });
  } else {
    console.error('错误详情:', err);
    
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || '服务器内部错误';
    
    res.status(statusCode).json({
      code: statusCode,
      message,
      data: isProduction ? null : {
        stack: err.stack
      }
    });
  }
});

// 定时任务：供应商评分计算（每天凌晨2点执行）
const cron = require('node-cron');
const { checkAllSuppliersScores } = require('./utils/scoring');
const { checkQualificationExpiry, updateQualificationStatus } = require('./utils/qualification-reminder');

cron.schedule('0 2 * * *', async () => {
  console.log('=== 开始定时任务: 供应商评分 ===');
  try {
    await checkAllSuppliersScores();
    await updateQualificationStatus();
    await checkQualificationExpiry();
    console.log('=== 定时任务完成 ===');
  } catch (error) {
    console.error('定时任务执行失败:', error.message);
  }
}, { timezone: 'Asia/Shanghai' });

// 定时清理过期日志（每天凌晨3点，保留90天）
const pool = require('./config/database');
cron.schedule('0 3 * * *', async () => {
  try {
    const [result] = await pool.query(
      'DELETE FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 90 DAY)'
    );
    if (result.affectedRows > 0) {
      console.log(`[日志清理] 已清理 ${result.affectedRows} 条过期日志`);
    }
  } catch (error) {
    console.error('[日志清理] 清理失败:', error.message);
  }
}, { timezone: 'Asia/Shanghai' });

// 定时任务：公海池自动回收（每天凌晨1点）
// 超过N天未跟进的客户自动掉入公海
const AUTO_RELEASE_DAYS = parseInt(process.env.AUTO_RELEASE_DAYS) || 30;
cron.schedule('0 1 * * *', async () => {
  console.log('[公海回收] 开始检查超期未跟进客户...');
  try {
    const [customers] = await pool.query(
      `SELECT id, company_name, owner_id FROM crm_customer
       WHERE pool_status = 0 AND status != 0 AND owner_id IS NOT NULL
         AND (last_follow_time IS NULL AND create_time < DATE_SUB(NOW(), INTERVAL ? DAY)
           OR last_follow_time < DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [AUTO_RELEASE_DAYS, AUTO_RELEASE_DAYS]
    );
    if (customers.length === 0) {
      console.log('[公海回收] 无需要释放的客户');
      return;
    }
    let released = 0;
    for (const c of customers) {
      await pool.query(
        'UPDATE crm_customer SET pool_status = 1, owner_id = NULL, protect_until = NULL WHERE id = ?',
        [c.id]
      );
      await pool.query(
        `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id)
         VALUES (?, 'auto_release', ?, NULL)`,
        [c.id, c.owner_id]
      );
      released++;
    }
    console.log(`[公海回收] 已释放 ${released} 个客户（超过${AUTO_RELEASE_DAYS}天未跟进）`);
  } catch (error) {
    console.error('[公海回收] 执行失败:', error.message);
  }
}, { timezone: 'Asia/Shanghai' });

// 定时任务：跟进提醒生成（每天8:30，生成逾期/今日/明日提醒）
const { generateReminders } = require('./scripts/generate_reminders');
cron.schedule('30 8 * * *', async () => {
  console.log('[提醒生成] 开始执行...');
  try {
    await generateReminders(pool);
    console.log('[提醒生成] 执行完成');
  } catch (error) {
    console.error('[提醒生成] 执行失败:', error.message);
  }
}, { timezone: 'Asia/Shanghai' });

// 启动服务器
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log('API地址: http://localhost:' + PORT + '/api');
});

module.exports = app;

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

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

// 加载路由
const authRoutes = require('./src/routes/auth');
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

// API 路由前缀 /api
const apiRouter = express.Router();

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

// 认证路由
apiRouter.use('/auth', authRoutes);

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
apiRouter.use('/role', roleRoutes);
apiRouter.use('/dept', deptRoutes);
apiRouter.use('/report', reportRoutes);
apiRouter.use('/log', logRoutes);
apiRouter.use('/team-dashboard', teamDashboardRoutes);
apiRouter.use('/reminder', reminderRoutes);

// 使用 /api 前缀
app.use('/api', apiRouter);

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
  console.error('错误:', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    code: statusCode,
    message,
    data: null
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log('API地址: http://localhost:' + PORT + '/api');
});

module.exports = app;

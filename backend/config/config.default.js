// CRM System Default Configuration
// 重要：生产环境不要依赖默认值，请在 .env 文件中配置实际值
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// 生产环境必须有 .env 文件
if (isProduction && !process.env.JWT_SECRET) {
  console.error('错误：生产环境必须设置 JWT_SECRET 环境变量');
  process.exit(1);
}

module.exports = {
  port: parseInt(process.env.PORT) || 5000,
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'crm_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  jwt: {
    secret: process.env.JWT_SECRET || (isProduction ? '' : 'dev_placeholder_change_in_production'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  }
};

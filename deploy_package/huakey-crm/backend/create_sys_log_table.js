const mysql = require('mysql2/promise');
require('dotenv').config();

const createSysLogTable = `
CREATE TABLE IF NOT EXISTS sys_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(50) NOT NULL COMMENT '操作模块',
  action VARCHAR(100) NOT NULL COMMENT '操作动作',
  method VARCHAR(10) NOT NULL COMMENT '请求方法',
  url VARCHAR(500) NOT NULL COMMENT '请求URL',
  params TEXT COMMENT '请求参数',
  ip_address VARCHAR(50) COMMENT 'IP地址',
  user_id INT DEFAULT NULL COMMENT '用户ID',
  user_name VARCHAR(100) COMMENT '用户姓名',
  description TEXT COMMENT '操作描述',
  status TINYINT DEFAULT 1 COMMENT '状态 1成功 0失败',
  error_msg TEXT COMMENT '错误信息',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  INDEX idx_module (module),
  INDEX idx_user_id (user_id),
  INDEX idx_create_time (create_time),
  INDEX idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统操作日志表'
`;

async function createTable() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log('正在创建 sys_log 表...');
    await pool.query(createSysLogTable);
    console.log('sys_log 表创建成功！');
  } catch (error) {
    console.error('创建表失败:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

createTable().then(() => {
  console.log('数据库表创建完成');
  process.exit(0);
}).catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
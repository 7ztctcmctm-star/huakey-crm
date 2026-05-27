const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'crm_user',
  password: 'Huakey@2024',
  database: 'huakey_crm',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.on('connection', (connection) => {
  console.log('数据库连接已建立, 连接ID:', connection.threadId);
});

pool.on('acquire', (connection) => {
  console.log('连接已获取, 连接ID:', connection.threadId);
});

pool.on('enqueue', () => {
  console.log('等待可用连接...');
});

pool.on('release', (connection) => {
  console.log('连接已释放, 连接ID:', connection.threadId);
});

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('数据库连接测试成功');
    connection.release();
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    process.exit(1);
  }
};

testConnection();

module.exports = pool;

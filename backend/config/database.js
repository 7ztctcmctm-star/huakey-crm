const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('数据库连接池错误:', err.message);
});

// ============================================================
// MySQL → PostgreSQL 兼容层
// 自动转换 ? → $N 占位符、[rows] → { rows } 返回格式
// ============================================================
const _query = pool.query.bind(pool);
pool.query = async function (sql, params) {
  // 1. 转换 ? → $1, $2, $3 ...（pg 风格占位符）
  if (params && params.length > 0) {
    let idx = 0;
    sql = sql.replace(/\?/g, () => `$${++idx}`);
  }

  // 2. 执行查询
  const pgResult = await _query(sql, params);

  // 3. 兼容 mysql2 返回格式：mysql2 返回 [rows] 或 [result]，pg 返回 { rows, rowCount }
  //    INSERT/UPDATE/DELETE → 返回 [resultHeader]
  //    SELECT/SHOW/DESCRIBE → 返回 [rows]
  if (/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)/i.test(sql.trim())) {
    // 模拟 mysql2 的 ResultSetHeader
    const header = {
      insertId: pgResult.rows.length > 0 ? (pgResult.rows[0].id || pgResult.rows[0].insertId) : null,
      affectedRows: pgResult.rowCount,
      changedRows: pgResult.rowCount,
    };
    return [header, pgResult.fields];
  }

  // SELECT 等查询 → 返回 [rows, fields]
  return [pgResult.rows, pgResult.fields];
};

// ============================================================
// MySQL → PostgreSQL 事务兼容层
// pool.getConnection() 模拟 mysql2 的事务 API
// ============================================================
pool.getConnection = async function () {
  const client = await pool.connect();
  const wrap = (sql, params) => {
    if (params && params.length > 0 && Array.isArray(params)) {
      let idx = 0;
      sql = sql.replace(/\?/g, () => `$${++idx}`);
    }
    return client.query(sql, params);
  };
  return {
    query: async function (sql, params) {
      const pgResult = await wrap(sql, params);
      if (/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)/i.test(sql.trim())) {
        return [{ insertId: pgResult.rows.length > 0 ? (pgResult.rows[0].id || pgResult.rows[0].insertId) : null, affectedRows: pgResult.rowCount, changedRows: pgResult.rowCount }, pgResult.fields];
      }
      return [pgResult.rows, pgResult.fields];
    },
    beginTransaction: async () => { await client.query('BEGIN'); },
    commit: async () => { await client.query('COMMIT'); },
    rollback: async () => { await client.query('ROLLBACK'); },
    release: () => { client.release(); }
  };
};

const testConnection = async () => {
  try {
    await _query('SELECT 1');
    console.log('数据库连接测试成功 (PostgreSQL)');
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    // Vercel Serverless 环境不退出进程，让连接池自动重试
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
};

// Vercel Serverless: 跳过启动时的同步连接测试（冷启动时连接池会自动初始化）
// 本地开发仍执行
if (!process.env.VERCEL) {
  testConnection();
}

module.exports = pool;

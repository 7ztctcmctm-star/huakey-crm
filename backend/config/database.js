const { Pool } = require('pg');
const supabaseAPI = require('./supabase-api-driver');

// 标记是否使用 API 驱动
let useAPIDriver = false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL?.includes('supabase.com')
    ? { rejectUnauthorized: false }
    : false,
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

  // 2. 执行查询（优先直连，失败时回退到 API 驱动）
  let pgResult;
  if (useAPIDriver && supabaseAPI.isAvailable()) {
    pgResult = await supabaseAPI.query(sql, params);
  } else {
    try {
      pgResult = await _query(sql, params);
    } catch (err) {
      // 如果直连失败且 API 驱动可用，切换到 API 驱动
      if (supabaseAPI.isAvailable() && (
        err.code === 'ENOTFOUND' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'XX000' ||
        err.severity === 'FATAL' ||
        err.message.includes('Connection terminated') ||
        err.message.includes('getaddrinfo') ||
        err.message.includes('tenant') ||
        err.message.includes('not found')
      )) {
        console.log('直连 PostgreSQL 失败，切换到 Supabase API 驱动');
        useAPIDriver = true;
        pgResult = await supabaseAPI.query(sql, params);
      } else {
        throw err;
      }
    }
  }

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
  // 如果使用 API 驱动，返回 API 驱动的连接
  if (useAPIDriver && supabaseAPI.isAvailable()) {
    return await supabaseAPI.getConnection();
  }

  try {
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
  } catch (err) {
    // 如果直连失败且 API 驱动可用，切换到 API 驱动
    if (supabaseAPI.isAvailable() && (
      err.code === 'ENOTFOUND' ||
      err.code === 'ECONNREFUSED' ||
      err.message.includes('Connection terminated') ||
      err.message.includes('getaddrinfo')
    )) {
      console.log('直连 PostgreSQL 失败，切换到 Supabase API 驱动');
      useAPIDriver = true;
      return await supabaseAPI.getConnection();
    }
    throw err;
  }
};

const testConnection = async () => {
  try {
    // 先尝试直连
    await _query('SELECT 1');
    console.log('数据库连接测试成功 (PostgreSQL 直连)');
  } catch (error) {
    // 直连失败，尝试 API 驱动
    if (supabaseAPI.isAvailable()) {
      try {
        await supabaseAPI.query('SELECT 1');
        useAPIDriver = true;
        console.log('数据库连接测试成功 (Supabase API 驱动)');
        return;
      } catch (apiError) {
        console.error('Supabase API 驱动也失败:', apiError.message);
      }
    }
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

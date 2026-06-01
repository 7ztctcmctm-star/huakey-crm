/**
 * Supabase REST API 数据库驱动
 * 通过 Supabase REST API 的 rpc 功能执行 SQL，比 Management API 更快
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rahquvfdusppmwubflvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// 解析 Supabase URL
const urlMatch = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
const PROJECT_REF = urlMatch ? urlMatch[1] : 'rahquvfdusppmwubflvp';

function queryViaRestAPI(sql, params) {
  return new Promise((resolve, reject) => {
    // 替换 $N 占位符为实际参数值
    if (params && params.length > 0) {
      params.forEach((val, i) => {
        const placeholder = `$${i + 1}`;
        const escapedVal = typeof val === 'string'
          ? `'${val.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
          : (val === null ? 'NULL' : String(val));
        sql = sql.replace(new RegExp('\\' + placeholder + '\\b', 'g'), escapedVal);
      });
    }

    const body = JSON.stringify({ sql });

    const options = {
      hostname: `${PROJECT_REF}.supabase.co`,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`API error: ${res.statusCode} - ${data}`));
          } else {
            const result = JSON.parse(data);
            resolve(result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('API request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 执行 SQL 查询
 */
async function query(sql, params) {
  // 对于 SELECT 查询，使用 exec_sql 函数
  if (/^\s*SELECT/i.test(sql.trim())) {
    try {
      const result = await queryViaRestAPI(sql, params);
      // exec_sql 返回 JSON 字符串
      let rows;
      if (typeof result === 'string') {
        rows = JSON.parse(result);
      } else if (Array.isArray(result)) {
        rows = result;
      } else {
        rows = [];
      }
      return {
        rows: rows || [],
        rowCount: rows ? rows.length : 0,
        fields: [],
      };
    } catch (err) {
      // 如果 exec_sql 函数不存在，回退到 Management API
      console.warn('REST API 查询失败，回退到 Management API:', err.message);
      return await queryViaManagementAPI(sql, params);
    }
  }

  // 对于非 SELECT 查询，使用 Management API
  return await queryViaManagementAPI(sql, params);
}

/**
 * 通过 Management API 执行查询（备用方案）
 */
async function queryViaManagementAPI(sql, params) {
  const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

  if (!ACCESS_TOKEN) {
    throw new Error('SUPABASE_ACCESS_TOKEN 未配置');
  }

  return new Promise((resolve, reject) => {
    // 替换 $N 占位符
    if (params && params.length > 0) {
      params.forEach((val, i) => {
        const placeholder = `$${i + 1}`;
        const escapedVal = typeof val === 'string'
          ? `'${val.replace(/'/g, "''")}'`
          : (val === null ? 'NULL' : String(val));
        sql = sql.replace(new RegExp('\\' + placeholder + '\\b', 'g'), escapedVal);
      });
    }

    const body = JSON.stringify({ query: sql });

    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode !== 200 && res.statusCode !== 201) {
            reject(new Error(result.message || `API error: ${res.statusCode}`));
          } else {
            const rows = Array.isArray(result) ? result : [];
            resolve({
              rows,
              rowCount: rows.length,
              fields: [],
            });
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('API request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 获取数据库连接（模拟 pg Pool.getConnection）
 */
async function getConnection() {
  return {
    query: async function (sql, params) {
      return await query(sql, params);
    },
    beginTransaction: async () => { /* no-op */ },
    commit: async () => { /* no-op */ },
    rollback: async () => { /* no-op */ },
    release: () => { /* no-op */ },
  };
}

module.exports = {
  query,
  getConnection,
  isAvailable: () => true,
};

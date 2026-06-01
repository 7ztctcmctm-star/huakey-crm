/**
 * Supabase Management API 数据库驱动
 * 当直连 PostgreSQL 不可用时（如 IPv6 限制），通过 HTTP API 执行 SQL
 */

const https = require('https');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'rahquvfdusppmwubflvp';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

function queryViaAPI(sql, params) {
  return new Promise((resolve, reject) => {
    // 替换 $N 占位符为实际参数值（Management API 不支持参数化查询）
    if (params && params.length > 0) {
      params.forEach((val, i) => {
        const placeholder = `$${i + 1}`;
        const escapedVal = typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : (val === null ? 'NULL' : String(val));
        sql = sql.replace(placeholder, escapedVal);
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
          // 200 和 201 都是成功状态码
          if (res.statusCode !== 200 && res.statusCode !== 201) {
            reject(new Error(result.message || `API error: ${res.statusCode}`));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}`));
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
 * 模拟 pg Pool 的 query 方法
 * 返回格式与 pg 一致: { rows, rowCount, fields }
 */
async function query(sql, params) {
  const result = await queryViaAPI(sql, params);

  // Management API 返回数组格式
  const rows = Array.isArray(result) ? result : [];
  const rowCount = rows.length;

  return {
    rows,
    rowCount,
    fields: [],
  };
}

/**
 * 模拟 pg Pool 的 getConnection 方法（事务支持）
 */
async function getConnection() {
  // Management API 不支持事务，但我们可以通过 SQL 语句模拟
  // BEGIN/COMMIT/ROLLBACK 需要特殊处理
  let inTransaction = false;

  return {
    query: async function (sql, params) {
      const result = await queryViaAPI(sql, params);
      const rows = Array.isArray(result) ? result : [];
      return {
        rows,
        rowCount: rows.length,
        fields: [],
      };
    },
    beginTransaction: async () => {
      await queryViaAPI('BEGIN');
      inTransaction = true;
    },
    commit: async () => {
      await queryViaAPI('COMMIT');
      inTransaction = false;
    },
    rollback: async () => {
      await queryViaAPI('ROLLBACK');
      inTransaction = false;
    },
    release: () => { /* no-op for API driver */ },
  };
}

module.exports = {
  query,
  getConnection,
  isAvailable: () => !!ACCESS_TOKEN,
};

const client = require('prom-client');

// ---------- 1. 创建指标 ----------

client.register.setDefaultLabels({
  app: 'huakey-crm',
  env: process.env.NODE_ENV || 'development'
});

// Counter: HTTP 请求总数，按 method + path + status 分组
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status']
});

// Histogram: HTTP 请求耗时，按 method + path 分组
const httpRequestDurationMs = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
});

// Gauge: 活跃数据库连接数
const dbConnectionsActive = new client.Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections in the pool'
});

// Gauge: 空闲数据库连接数
const dbConnectionsIdle = new client.Gauge({
  name: 'db_connections_idle',
  help: 'Number of idle database connections in the pool'
});

// Gauge: 堆内存使用量 (字节)
const memoryHeapBytes = new client.Gauge({
  name: 'memory_heap_bytes',
  help: 'Node.js heap memory usage in bytes'
});

// ---------- 2. Express 中间件 ----------

/**
 * 为每个 HTTP 请求记录 Counter + Histogram。
 * 挂载位置：traceIdMiddleware 之后，所有路由之前（app.js 顶层，不在 apiRouter 内）。
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const route = req.route ? req.route.path : (req.originalUrl.replace(/^\/api/, '') || 'unknown');

    httpRequestsTotal.inc({
      method: req.method,
      path: route,
      status: res.statusCode.toString()
    });

    httpRequestDurationMs.observe(
      { method: req.method, path: route },
      durationMs
    );
  });

  next();
}

// ---------- 3. 数据库连接池指标定时采集 ----------

let poolMetricsInterval = null;

/**
 * 启动连接池指标定期采集（每 15 秒）。
 * 放在 app.js 启动时调用。
 * @param {object} pool - mysql2/promise pool 实例
 */
function startPoolMetricsCollection(pool) {
  if (poolMetricsInterval) return;

  poolMetricsInterval = setInterval(() => {
    const internalPool = pool.pool;
    if (internalPool) {
      const all = internalPool._allConnections ? internalPool._allConnections.length : 0;
      const free = internalPool._freeConnections ? internalPool._freeConnections.length : 0;
      dbConnectionsActive.set(all - free);
      dbConnectionsIdle.set(free);
    }

    const mem = process.memoryUsage();
    memoryHeapBytes.set(mem.heapUsed);
  }, 15000);

  process.on('beforeExit', () => {
    if (poolMetricsInterval) clearInterval(poolMetricsInterval);
  });
}

/**
 * 停止连接池指标采集（仅测试环境使用）
 */
function stopPoolMetricsCollection() {
  if (poolMetricsInterval) {
    clearInterval(poolMetricsInterval);
    poolMetricsInterval = null;
  }
}

// ---------- 4. 导出 ----------

module.exports = {
  httpRequestsTotal,
  httpRequestDurationMs,
  dbConnectionsActive,
  dbConnectionsIdle,
  memoryHeapBytes,
  metricsMiddleware,
  startPoolMetricsCollection,
  stopPoolMetricsCollection,
  register: client.register,
  client
};

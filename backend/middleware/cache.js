const { getCache, setCache, delCacheByPattern, REDIS_ENABLED } = require('../config/redis');

// 请求缓存中间件（支持 GET 和 POST）
// 用法: router.get('/xxx', authenticateToken, cache(60), handler)
// 用法: router.post('/xxx', authenticateToken, cache(60), handler)
// 注意: 必须在 authenticateToken 之后使用，以确保 req.user 可用
function cache(ttl = 300) {
  return async (req, res, next) => {
    if (!REDIS_ENABLED) return next();

    // 缓存key包含userId，避免不同权限用户读到他人缓存
    const userId = req.user?.userId || 'anon';
    // POST 请求将 body 序列化加入 key，GET 请求仅用 URL
    const bodyKey = req.method === 'POST' ? `:${JSON.stringify(req.body || {})}` : '';
    const key = `cache:${userId}:${req.originalUrl}${bodyKey}`;
    const cached = await getCache(key);
    if (cached) {
      return res.json({ code: 200, message: '查询成功(cached)', data: cached });
    }

    // 劫持 res.json 以捕获响应数据
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (data && data.code === 200 && data.data) {
        setCache(key, data.data, ttl);
      }
      return originalJson(data);
    };
    next();
  };
}

// 创建可自定义缓存 key 的中间件
// 用法: router.get('/xxx', authenticateToken, createCache(300, (req) => `foo:${req.user.userId}`), handler)
function createCache(ttlSeconds, keyBuilder) {
  return async (req, res, next) => {
    if (!REDIS_ENABLED) return next();

    const cacheKey = keyBuilder
      ? keyBuilder(req)
      : `cache:${req.user?.userId || 'anon'}:${req.originalUrl}`;

    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ code: 200, message: '查询成功(cached)', data: cached });
    }

    // 劫持 res.json 以捕获响应数据
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (data && data.code === 200 && data.data) {
        setCache(cacheKey, data.data, ttlSeconds);
      }
      return originalJson(data);
    };
    next();
  };
}

// 清除匹配模式的缓存（写操作后调用）
async function invalidateCache(patterns) {
  if (!REDIS_ENABLED) return;
  for (const pattern of patterns) {
    await delCacheByPattern(pattern);
  }
}

module.exports = { cache, createCache, invalidateCache };

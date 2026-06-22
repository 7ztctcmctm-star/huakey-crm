const { getCache, setCache, REDIS_ENABLED } = require('../config/redis');

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

module.exports = { cache };

process.env.JWT_SECRET = 'test_secret_key_for_sse_tests';

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));
jest.mock('../utils/sseManager', () => ({
  add: jest.fn(),
  remove: jest.fn(),
  send: jest.fn(),
  broadcast: jest.fn(),
  getOnlineCount: jest.fn().mockReturnValue(0)
}));

const sseRoutes = require('../routes/sse');
const sseManager = require('../utils/sseManager');

const app = express();
app.use(express.json());
app.use('/sse', sseRoutes);

const token = jwt.sign(
  { userId: 7, username: 'sales01', roleId: 3, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
const tokenNoUserId = jwt.sign(
  { username: 'broken', roleId: 3, roleCode: 'sales', manageAll: false },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

/** 原生 http 客户端：SSE 是长连接不会自然结束，收到首个数据块即断连 */
function sseGet(path, authHeader) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, () => {
      const { port } = server.address();
      const req = http.get(
        { host: '127.0.0.1', port, path, headers: authHeader ? { Authorization: authHeader } : {} },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
            req.destroy();
          });
          res.on('close', () => {
            server.close(() => resolve({ status: res.statusCode, headers: res.headers, body }));
          });
        }
      );
      req.on('error', () => { /* destroy 触发 */ });
    });
    server.on('error', reject);
  });
}

describe('SSE 路由 /api/v1/sse', () => {
  beforeEach(() => {
    sseManager.add.mockClear();
  });

  it('GET /sse/notifications 未登录返回 401', async () => {
    const res = await sseGet('/sse/notifications', null);
    expect(res.status).toBe(401);
  });

  it('GET /sse/notifications token 缺 userId 返回 401 且不建连', async () => {
    const res = await sseGet('/sse/notifications', `Bearer ${tokenNoUserId}`);
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).message).toBe('未登录');
    expect(sseManager.add).not.toHaveBeenCalled();
  });

  it('GET /sse/notifications 鉴权通过：设置 SSE 头、写握手注释、注册连接', async () => {
    const res = await sseGet('/sse/notifications', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.body).toBe(':ok\n\n');
    expect(sseManager.add).toHaveBeenCalledWith(7, expect.anything());
  });
});

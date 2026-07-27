/**
 * CSRF 防护中间件单元测试
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } = require('../middleware/csrf');

function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get('/test', (req, res) => res.json({ code: 200, message: 'ok' }));
  app.post('/test', (req, res) => res.json({ code: 200, message: 'ok' }));

  return app;
}

describe('CSRF 防护中间件', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('GET 请求应设置 csrf-token cookie', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining(`${CSRF_COOKIE_NAME}=`)])
    );
  });

  it('POST 请求缺少 CSRF header 时应返回 403', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    // 先 GET 获取 cookie
    const getRes = await request(app).get('/test');
    const cookies = getRes.headers['set-cookie'];

    // POST 不带 header
    const postRes = await request(app)
      .post('/test')
      .set('Cookie', cookies);

    expect(postRes.status).toBe(403);
    expect(postRes.body.code).toBe(403);
  });

  it('POST 请求携带正确 CSRF header 时应通过', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    // 先 GET 获取 cookie
    const getRes = await request(app).get('/test');
    const cookies = getRes.headers['set-cookie'];
    const csrfCookie = cookies.find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    const csrfToken = decodeURIComponent(csrfCookie.split(';')[0].split('=')[1]);

    // POST 带正确 header
    const postRes = await request(app)
      .post('/test')
      .set('Cookie', cookies)
      .set(CSRF_HEADER_NAME, csrfToken);

    expect(postRes.status).toBe(200);
    expect(postRes.body.code).toBe(200);
  });

  it('POST 请求 CSRF token 不匹配时应返回 403', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    // 先 GET 获取 cookie
    const getRes = await request(app).get('/test');
    const cookies = getRes.headers['set-cookie'];

    // POST 带错误 header
    const postRes = await request(app)
      .post('/test')
      .set('Cookie', cookies)
      .set(CSRF_HEADER_NAME, 'wrong-token');

    expect(postRes.status).toBe(403);
  });

  it('测试环境应跳过 CSRF 校验', async () => {
    process.env.NODE_ENV = 'test';
    const app = createApp();

    const res = await request(app).post('/test');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
  });

  it('PUT/DELETE/PATCH 请求同样需要 CSRF header', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    const getRes = await request(app).get('/test');
    const cookies = getRes.headers['set-cookie'];

    const putRes = await request(app).put('/test').set('Cookie', cookies);
    const deleteRes = await request(app).delete('/test').set('Cookie', cookies);
    const patchRes = await request(app).patch('/test').set('Cookie', cookies);

    expect(putRes.status).toBe(403);
    expect(deleteRes.status).toBe(403);
    expect(patchRes.status).toBe(403);
  });

  it('生产环境 HTTPS 请求下 CSRF cookie 应标记 secure', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.use(csrfProtection);
    app.get('/test', (req, res) => res.json({ code: 200, message: 'ok' }));

    const res = await request(app)
      .get('/test')
      .set('X-Forwarded-Proto', 'https');

    const csrfCookie = res.headers['set-cookie']
      .find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    expect(csrfCookie).toContain('Secure');
    expect(csrfCookie).toContain('SameSite=Strict');
  });

  it('生产环境 HTTP 请求下 CSRF cookie 不应标记 secure（兼容 NAS HTTP 部署）', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    const res = await request(app).get('/test');

    const csrfCookie = res.headers['set-cookie']
      .find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    expect(csrfCookie).not.toContain('Secure');
  });

  it('开发环境不跳过 CSRF 校验', async () => {
    process.env.NODE_ENV = 'development';
    const app = createApp();

    const getRes = await request(app).get('/test');
    const cookies = getRes.headers['set-cookie'];

    const postRes = await request(app).post('/test').set('Cookie', cookies);
    expect(postRes.status).toBe(403);
  });
});

/**
 * P1-11：/uploads 不再公开静态。
 *
 * 审计结论：app.js 用 express.static 直接暴露 backend/uploads，
 * 未登录者拿到 URL 即可读取客户附件。
 * 修复：附件静态目录前置「登录 + 附件记录 + 客户数据范围」，
 *       知识库图片前置「登录 + knowledge 权限码」。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { userId: 7, manageAll: false, roleId: 3, roleCode: 'sales' };
    next();
  }
}));

const mockCheckPermission = jest.fn(() => (req, res, next) => next());
const mockCheckDataPermission = jest.fn(() => (req, res, next) => {
  req.dataPermission = { data_scope: 'self' };
  next();
});
const mockBuildDataPermissionWhere = jest.fn(async () => ({ clause: 'c.owner_id = ?', params: [7] }));

jest.mock('../../middleware/permission', () => ({
  checkPermission: (...args) => mockCheckPermission(...args),
  checkDataPermission: (...args) => mockCheckDataPermission(...args),
  buildDataPermissionWhere: (...args) => mockBuildDataPermissionWhere(...args)
}));

const uploadRouteService = require('../../services/uploadRouteService');
const { attachmentGuard, knowledgeGuard } = require('../../middleware/secureUploads');

function poolMock() {
  return { query: jest.fn() };
}

const ATTACHMENT = {
  id: 11, business_type: 'customer', business_id: 99,
  create_by: 9, file_path: '/uploads/attachments/secret.txt'
};

describe('uploadRouteService 附件可见性（P1-11）', () => {
  it('按文件路径反查附件记录', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[ATTACHMENT]]);
    const row = await uploadRouteService.findAttachmentByFilePath(pool, '/uploads/attachments/secret.txt');
    expect(row).toEqual(ATTACHMENT);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('file_path = ?');
    expect(sql).toContain('deleted_at IS NULL');
    expect(params).toEqual(['/uploads/attachments/secret.txt']);
  });

  it('上传者本人可查看', async () => {
    const pool = poolMock();
    const ok = await uploadRouteService.canViewAttachment(pool, ATTACHMENT, { userId: 9 }, { clause: 'c.owner_id = ?', params: [9] });
    expect(ok).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('manageAll 可查看', async () => {
    const pool = poolMock();
    const ok = await uploadRouteService.canViewAttachment(pool, ATTACHMENT, { userId: 1, manageAll: true });
    expect(ok).toBe(true);
  });

  it('非上传者按客户数据范围判定（范围内=可读）', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[{ 1: 1 }]]);
    const ok = await uploadRouteService.canViewAttachment(pool, ATTACHMENT, { userId: 7 }, { clause: 'c.owner_id = ?', params: [7] });
    expect(ok).toBe(true);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('JOIN crm_customer c ON c.id = a.business_id');
    expect(sql).toContain('c.owner_id = ?');
    expect(params).toEqual([11, 7]);
  });

  it('非上传者且不在数据范围 → false', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[]]);
    const ok = await uploadRouteService.canViewAttachment(pool, ATTACHMENT, { userId: 7 }, { clause: 'c.owner_id = ?', params: [7] });
    expect(ok).toBe(false);
  });

  it('未知业务类型非上传者 fail-closed', async () => {
    const pool = poolMock();
    const ok = await uploadRouteService.canViewAttachment(
      pool, { ...ATTACHMENT, business_type: 'mystery' }, { userId: 7 }, { clause: '1=1', params: [] });
    expect(ok).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('/uploads/attachments 静态守卫（P1-11）', () => {
  let app;
  let tmpDir;
  let pool;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huakey-uploads-'));
    fs.mkdirSync(path.join(tmpDir, 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'attachments', 'secret.txt'), 'attachment-content');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    pool = poolMock();
    mockCheckDataPermission.mockClear();
    app = express();
    app.use('/uploads/attachments', attachmentGuard(pool, tmpDir));
    app.use((err, req, res, next) => res.status(500).json({ code: 500, message: err.message }));
  });

  it('有权限时返回文件内容', async () => {
    pool.query
      .mockResolvedValueOnce([[ATTACHMENT]]) // findAttachmentByFilePath
      .mockResolvedValueOnce([[{ 1: 1 }]]); // canViewAttachment 范围查询
    const res = await request(app).get('/uploads/attachments/secret.txt');
    expect(res.status).toBe(200);
    expect(res.text).toBe('attachment-content');
    expect(mockCheckDataPermission).toHaveBeenCalledWith('customer', 'owner_id');
  });

  it('附件记录不存在 → 404（不再暴露目录内容）', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/uploads/attachments/missing.txt');
    expect(res.status).toBe(404);
  });

  it('无数据范围且非上传者 → 403', async () => {
    pool.query
      .mockResolvedValueOnce([[ATTACHMENT]])
      .mockResolvedValueOnce([[]]);
    const res = await request(app).get('/uploads/attachments/secret.txt');
    expect(res.status).toBe(403);
  });

  it('路径穿越被 basename 归一化后按未知文件 404', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/uploads/attachments/..%2f..%2fpackage.json');
    expect(res.status).toBe(404);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('file_path = ?');
    expect(params[0]).toBe('/uploads/attachments/package.json');
  });
});

describe('/uploads/knowledge 静态守卫（P1-11）', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huakey-knowledge-'));
    fs.mkdirSync(path.join(tmpDir, 'knowledge'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'knowledge', 'pic.png'), 'png-bytes');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('通过 knowledge 权限码后才返回图片', async () => {
    mockCheckPermission.mockClear();
    const app = express();
    app.use('/uploads/knowledge', knowledgeGuard(tmpDir));
    const res = await request(app).get('/uploads/knowledge/pic.png');
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('png-bytes');
    expect(mockCheckPermission).toHaveBeenCalledWith('knowledge');
  });
});

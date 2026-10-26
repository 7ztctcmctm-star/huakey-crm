/**
 * [V1.1 §11.3 / 2026-10-26] 部门根节点 parent_id: null 契约
 *
 * 背景：前端 dept.vue 编辑根部门时下发 `parent_id: row.parent_id || null`。
 * 旧 deptUpdateSchema 只有 add 允许 null，update 未 allow(null) ⇒ 根部门改名 400。
 * deptRouteService 已把 null 归一化为 0，schema 层放行即可。
 */

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next()
}));

jest.mock('../../middleware/permission', () => ({
  checkPermission: () => (req, res, next) => next()
}));

jest.mock('../../middleware/admin', () => {
  const requireAdmin = (req, res, next) => next();
  return Object.assign(requireAdmin, { requireAdmin, requireManager: (req, res, next) => next() });
});

jest.mock('../../services/deptRouteService', () => ({
  listDepts: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  addDept: jest.fn().mockResolvedValue({ id: 1 }),
  updateDept: jest.fn().mockResolvedValue({ success: true }),
  deleteDept: jest.fn().mockResolvedValue({ success: true })
}));

const express = require('express');
const request = require('supertest');
const router = require('../../routes/dept');
const deptService = require('../../services/deptRouteService');

const app = express();
app.use(express.json());
app.use('/api/v1/dept', router);

describe('[V1.1 §11.3] 部门 parent_id null', () => {
  beforeEach(() => jest.clearAllMocks());

  it('新增根部门 parent_id: null 到达 service', async () => {
    const res = await request(app).post('/api/v1/dept/add').send({ name: '总经办', parent_id: null });

    expect(res.status).toBe(200);
    expect(deptService.addDept).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ parent_id: null }));
  });

  it('编辑根部门 parent_id: null 不再 400', async () => {
    const res = await request(app).post('/api/v1/dept/update').send({ id: 1, name: '总经办', parent_id: null, sort: 0 });

    expect(res.status).toBe(200);
    expect(deptService.updateDept).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 1, parent_id: null })
    );
  });

  it('非法 parent_id 仍返回 400', async () => {
    const res = await request(app).post('/api/v1/dept/update').send({ id: 1, name: '总经办', parent_id: -1, sort: 0 });

    expect(res.status).toBe(400);
    expect(deptService.updateDept).not.toHaveBeenCalled();
  });
});

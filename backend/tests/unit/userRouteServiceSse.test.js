/**
 * [C2 2026-10-21] userRouteService.updateUser 的 SSE 权限变更推送单测
 *
 * 背景：/auth/me 下发的 permissions/dataPermissions 随角色/部门走，前端 useUser
 * 模块级缓存不主动失效会出现「按钮还在、点了 403」。故角色/部门变更时后端经
 * sseManager 向该用户全部在线端推 permission-changed，前端 utils/sse.js
 * 收到后强制刷新权限缓存。
 */
jest.mock('../../utils/sseManager', () => ({ send: jest.fn() }));
jest.mock('../../services/permissionService', () => ({ clearPermissionCache: jest.fn().mockResolvedValue(undefined) }));

const sseManager = require('../../utils/sseManager');
const { clearPermissionCache } = require('../../services/permissionService');
const { updateUser } = require('../../services/userRouteService');

describe('userRouteService.updateUser · SSE 权限变更推送', () => {
  let pool;

  beforeEach(() => {
    jest.clearAllMocks();
    pool = { query: jest.fn() };
  });

  function mockUserExists() {
    pool.query.mockResolvedValueOnce([[{ id: 7 }]]); // SELECT id
  }

  it('角色变更应清权限缓存并向该用户推送 permission-changed', async () => {
    mockUserExists();
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

    await updateUser(pool, { id: 7, role_id: 2 });

    expect(clearPermissionCache).toHaveBeenCalledWith(7);
    expect(sseManager.send).toHaveBeenCalledTimes(1);
    expect(sseManager.send).toHaveBeenCalledWith(7, { type: 'permission-changed', action: 'refresh' });
  });

  it('部门变更同样应推送（dataPermissions 随部门走）', async () => {
    mockUserExists();
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateUser(pool, { id: 7, dept_id: 3 });

    expect(clearPermissionCache).toHaveBeenCalledWith(7);
    expect(sseManager.send).toHaveBeenCalledWith(7, { type: 'permission-changed', action: 'refresh' });
  });

  it('仅改姓名/电话等无关字段不应推送', async () => {
    mockUserExists();
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateUser(pool, { id: 7, real_name: '张三' });

    expect(clearPermissionCache).not.toHaveBeenCalled();
    expect(sseManager.send).not.toHaveBeenCalled();
  });

  it('推送失败不应影响更新主流程（best-effort）', async () => {
    mockUserExists();
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    sseManager.send.mockImplementationOnce(() => { throw new Error('connection gone') });

    await expect(updateUser(pool, { id: 7, role_id: 2 })).resolves.toBeUndefined();
  });
});

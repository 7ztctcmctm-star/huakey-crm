/**
 * requireManager 语义测试（2026-09-20，#21 后续：修正「排除 manager」的缺陷）
 *
 * 背景：原实现判 `manageAll || ADMIN_ROLE_CODES.has(roleCode) || roleId === ROLES.ADMIN(1)`，
 * 而 `ADMIN_ROLE_CODES` 只含 `super_admin`（遗留 code）、`ROLES.ADMIN = 1` 即 boss
 * ⇒ 实际只放行 boss/manageAll，把名字里的 manager 排除，导致 35 个「角色已持有功能权限码」
 * 的端点对部门经理全部 403，hr 角色亦被挡在自己的 hr 模块外。
 *
 * 本文件锁定两条不变式：
 *   1) manager 角色必须放行；
 *   2) 非管理层角色（sales/hr/purchase/engineer/finance）必须 403。
 * `middleware/admin.js` 只依赖 config/roles，无 DB 依赖，故为纯单测。
 */

const { requireManager } = require('../../middleware/admin');
const { ROLE_CODES } = require('../../config/roles');

/** 跑一遍中间件，返回 { status } —— next() 记 200，res.status().json() 记真实码 */
function invoke(user) {
  return new Promise((resolve) => {
    const req = { user };
    const res = {
      _code: null,
      status(code) { this._code = code; return this; },
      json(body) { resolve({ status: this._code, body }); },
    };
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    requireManager(req, res, () => done({ status: 200 }));
    // 同步分支：若走到 403，json 已 resolve
  });
}

describe('middleware/requireManager 语义', () => {
  describe('应放行（管理层）', () => {
    it('manager 角色必须放行 —— 这是本次修复的核心不变式', async () => {
      const r = await invoke({ userId: 7, roleId: 2, roleCode: ROLE_CODES.MANAGER });
      expect(r.status).toBe(200);
    });

    it('boss（manageAll=true）放行', async () => {
      const r = await invoke({ userId: 1, roleId: 1, roleCode: ROLE_CODES.BOSS, manageAll: true });
      expect(r.status).toBe(200);
    });

    it('boss（仅 roleId===1，无 manageAll）放行（向后兼容既有判据）', async () => {
      const r = await invoke({ userId: 1, roleId: 1, roleCode: ROLE_CODES.BOSS });
      expect(r.status).toBe(200);
    });

    it('super_admin（遗留 code）放行', async () => {
      const r = await invoke({ userId: 1, roleId: 9, roleCode: ROLE_CODES.SUPER_ADMIN });
      expect(r.status).toBe(200);
    });
  });

  describe('应拒绝（非管理层）', () => {
    const denied = [
      [ROLE_CODES.SALES, 3],
      [ROLE_CODES.HR, 4],
      [ROLE_CODES.PURCHASE, 5],
      [ROLE_CODES.FINANCE, 6],
      [ROLE_CODES.ENGINEER, 11],
      ['unknown_role', 99],
    ];

    it.each(denied)('%s 角色应 403', async (roleCode, roleId) => {
      const r = await invoke({ userId: 20, roleId, roleCode });
      expect(r.status).toBe(403);
      expect(r.body.message).toContain('管理员或经理');
    });

    it('未认证（req.user 为空）应 403', async () => {
      const r = await invoke(undefined);
      expect(r.status).toBe(403);
    });

    it('manager 不得因 roleId 数值相同而被误判为 boss', async () => {
      // 边界：roleId 缺失时不能靠数值侥幸通过
      const r = await invoke({ userId: 7, roleCode: ROLE_CODES.MANAGER });
      expect(r.status).toBe(200);   // 仍按 roleCode 放行
      const r2 = await invoke({ userId: 8, roleCode: ROLE_CODES.SALES });
      expect(r2.status).toBe(403);
    });
  });
});

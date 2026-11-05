/**
 * 认证 mock 帮助器
 *
 * [P0-06 2026-10-23] authenticateToken 现在是两次查询：
 *   1) sys_token_blacklist（黑名单）
 *   2) sys_user LEFT JOIN sys_role（按 token.userId 取当前账号与角色）
 *
 * 旧测试用 `mockResolvedValueOnce` 精确排队两次查询；那些用例继续有效。
 * 本帮助器用于「只关心业务校验、不关心认证细节」的测试：以 mockImplementation
 * 兜底认证查询，显式排队的 once 值仍然优先，不会被本实现覆盖。
 */

const AUTH_USER_ROW = Object.freeze({
  id: 1,
  username: 'test_user',
  role_id: 1,
  status: 1,
  must_change_password: 0,
  password_changed_at: null,
  fresh_role_id: 1,
  role_code: 'super_admin',
  view_all: 1,
  manage_all: 1
});

/**
 * @param {{query: jest.Mock}} pool - 被 jest.mock 的数据库池
 * @param {(sql: string, params: any[]) => any} [businessQuery] - 非认证 SQL 的处理器
 * @param {object} [overrides] - 覆盖认证用户行（如 role_id/role_code/manage_all）
 */
function installAuthAwareQuery(pool, businessQuery, overrides = {}) {
  const baseRow = { ...AUTH_USER_ROW, ...overrides };
  const freshRoleId = overrides.fresh_role_id !== undefined
    ? overrides.fresh_role_id
    : (overrides.role_id !== undefined ? overrides.role_id : baseRow.fresh_role_id);

  pool.query.mockImplementation(async (sql, params = []) => {
    const s = String(sql);

    if (s.includes('sys_token_blacklist')) return [[]];

    if (s.includes('FROM sys_user u')) {
      const id = params[0] === undefined || params[0] === null ? baseRow.id : params[0];
      return [[{ ...baseRow, id, fresh_role_id: freshRoleId }]];
    }

    if (businessQuery) return businessQuery(sql, params);
    return [[]];
  });
}

module.exports = { AUTH_USER_ROW, installAuthAwareQuery };

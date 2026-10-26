/**
 * 系统角色常量定义
 * 对应 sys_role 表中的 id 字段
 * 用于替代散落在各文件中的硬编码 roleId === 1 等判断
 * 
 * [ROLE_CODE 迁移说明 2026-06-29]
 * - ROLES (数字ID) 逐步弃用，保留向后兼容
 * - ROLE_CODES (字符串code) 为新标准，对应 sys_role.code 字段
 * - 所有新代码应使用 ROLE_CODES 进行角色判断
 * - 现库映射: id1->'boss', id2->'manager', id3->'sales', id4->'hr',
 *   id5->'purchase', id6->'finance', id11->'engineer'
 */
const ROLES = {
  ADMIN: 1,       // 系统管理员/老板
  MANAGER: 2,     // 部门经理/总经理
  SALES: 3,       // 销售人员
  HR: 4,          // 人力资源
  PURCHASE: 5,    // 采购专员
  FINANCE: 6,     // 财务专员
  ENGINEER: 11    // 工程师
};

/**
 * 角色 code 常量（对应 sys_role.code 字段）
 * 用于替代数字 ID 硬编码，不受 role_id 重排影响
 */
const ROLE_CODES = {
  SUPER_ADMIN: 'super_admin',   // 超管 [遗留 code，现库已不存在]
  ADMIN: 'admin',               // 管理员 [遗留 code，现库已不存在]
  BOSS: 'boss',                 // 老板
  MANAGER: 'manager',           // 部门经理 (原 ROLES.MANAGER=2，现库实际 code)
  SALES: 'sales',               // 销售
  HR: 'hr',                     // 人力
  PURCHASE: 'purchase',         // 采购
  FINANCE: 'finance',           // 财务
  ENGINEER: 'engineer'          // 工程师
};

/**
 * 超级管理员角色 code 集合
 * 仅超管可绕过功能权限检查；部门经理/老板仍需按具体权限码校验
 */
const ADMIN_ROLE_CODES = new Set([
  ROLE_CODES.SUPER_ADMIN
]);

/**
 * 角色权限层级（2026-10-23 审计 P0-03）
 *
 * 用于用户管理接口的**纵向越权**校验：调用者只能管理/授予不高于自身层级的角色。
 * 例如 HR(60) 不能创建 boss(90)、不能重置 boss 密码；sales(40) 即使被误授予
 * system:user 权限，也不能把账号提权为 manager(80)。
 *
 * ⚠️ 这是「用户管理域」的授权层级，不是功能权限矩阵，也不替代 checkPermission。
 *    新增角色必须显式登记；未登记角色 rank=0，除 super_admin 外一律不可管理/授予。
 *
 * 注意：`admin` 是历史遗留 code（现库已无），保留 rank 以兼容旧数据。
 */
const ROLE_RANKS = Object.freeze({
  [ROLE_CODES.SUPER_ADMIN]: 100,
  [ROLE_CODES.BOSS]: 90,
  [ROLE_CODES.ADMIN]: 90,
  [ROLE_CODES.MANAGER]: 80,
  [ROLE_CODES.FINANCE]: 70,
  [ROLE_CODES.HR]: 60,
  [ROLE_CODES.PURCHASE]: 50,
  purchaser: 50,
  [ROLE_CODES.SALES]: 40,
  [ROLE_CODES.ENGINEER]: 30
});

const UNKNOWN_ROLE_RANK = 0;

/**
 * 取角色层级；未登记角色返回 0（最低，且不可被非超管管理/授予）
 * @param {string} roleCode - sys_role.code
 * @returns {number}
 */
const getRoleRank = (roleCode) => (
  Object.prototype.hasOwnProperty.call(ROLE_RANKS, roleCode)
    ? ROLE_RANKS[roleCode]
    : UNKNOWN_ROLE_RANK
);

module.exports = {
  ...ROLES,           // 向后兼容: ROLES.ADMIN, ROLES.MANAGER 等
  ROLE_CODES,
  ADMIN_ROLE_CODES,
  ROLE_RANKS,
  UNKNOWN_ROLE_RANK,
  getRoleRank
};

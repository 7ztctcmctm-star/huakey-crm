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

module.exports = {
  ...ROLES,           // 向后兼容: ROLES.ADMIN, ROLES.MANAGER 等
  ROLE_CODES,
  ADMIN_ROLE_CODES
};

/**
 * 系统角色常量定义
 * 对应 sys_role 表中的 id 字段
 * 用于替代散落在各文件中的硬编码 roleId === 1 等判断
 */
const ROLES = {
  ADMIN: 1,       // 系统管理员/老板
  MANAGER: 2,     // 部门经理/总经办
  SALES: 3,       // 销售人员
  HR: 4,          // 人力资源
  PURCHASE: 5,    // 采购专员
  FINANCE: 6,     // 财务专员
  ENGINEER: 11    // 工程师
};

module.exports = ROLES;

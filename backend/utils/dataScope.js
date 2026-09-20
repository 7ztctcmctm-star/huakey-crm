/**
 * 数据范围（行级）子句构造工具 —— 单一事实来源
 *
 * 背景：`middleware/permission.js` 的 `checkDataPermission(module)` **只往 `req.dataPermission`
 * 注入配置，本身不过滤任何数据**。真正过滤必须由 service 调本函数生成子句并拼进 SQL，
 * 否则「挂了中间件」也只是安全剧场。
 *
 * 各表归属列不同（ownerColumn 由调用方按表指定）：
 *   crm_customer → owner_id · crm_contract → create_by · crm_opportunity → owner_id ·
 *   crm_purchase_order → owner_id · crm_follow_up → create_by · crm_sales_target → user_id ·
 *   sys_user（成员排名） → id
 *
 * 语义由 `sys_data_permission.data_scope` 决定：all / dept / dept_and_sub / custom / self；
 * 缺省（无配置）为 self。boss / super_admin 因 manageAll 在中间件处直接注入 `type:'all'`。
 *
 * @param {object|null} dataPermission - checkDataPermission 注入的 req.dataPermission（可为空 → 不过滤）
 * @param {string} ownerColumn - 归属列名
 * @param {string} alias - SQL 表别名（须与查询中的别名一致）
 * @returns {Promise<{clause: string, params: Array}>}
 */
const { buildDataPermissionWhere } = require('../middleware/permission');

async function scopeFor(dataPermission, ownerColumn, alias) {
  if (!dataPermission) return { clause: '1=1', params: [] };
  return buildDataPermissionWhere({ ...dataPermission, ownerColumn }, alias);
}

module.exports = { scopeFor };

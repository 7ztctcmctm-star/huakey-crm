/**
 * 全局搜索服务层
 * 从 routes/search.js 提取的业务逻辑
 */
const { buildDataPermissionWhere } = require('../middleware/permission');
const { getDataPermissions } = require('./permissionService');
const ROLES = require('../config/roles');

const STAGE_MAP = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' };

/**
 * 全局搜索
 */
async function globalSearch(pool, { keyword, user }) {
  const likeKeyword = `%${keyword}%`;

  // 加载用户权限配置（一次查询，复用于所有模块）
  const allPerms = await getDataPermissions(pool, user.roleId);

  // 辅助函数：为指定模块构建数据权限SQL
  async function buildPermClause(module, alias, ownerColumn) {
    const cfg = allPerms.find(p => p.module === module);
    const dp = {
      type: user.manageAll || user.roleId === ROLES.ADMIN ? 'all' : (cfg?.data_scope || 'self'),
      userId: user.userId,
      ownerColumn,
      customDeptIds: cfg?.custom_dept_ids
    };
    return buildDataPermissionWhere(dp, alias);
  }

  // 客户搜索
  const customerClause = await buildPermClause('customer', 'c', 'owner_id');
  let customerWhere = `(c.company_name LIKE ? OR c.contact_name LIKE ? OR c.phone LIKE ?) AND ${customerClause.clause}`;
  const customerParams = [likeKeyword, likeKeyword, likeKeyword, ...customerClause.params];

  const [customers] = await pool.query(
    `SELECT c.id, c.company_name, c.contact_name, c.phone, c.level
     FROM crm_customer c
     WHERE c.status != 0 AND c.deleted_at IS NULL AND ${customerWhere}
     ORDER BY c.update_time DESC
     LIMIT 5`,
    customerParams
  );

  // 合同搜索
  const contractClause = await buildPermClause('contract', 'ct', 'create_by');
  const [contracts] = await pool.query(
    `SELECT ct.id, ct.contract_no, ct.amount as contract_amount,
            cu.company_name as customer_name
     FROM crm_contract ct
     LEFT JOIN crm_customer cu ON ct.customer_id = cu.id
     WHERE ct.deleted_at IS NULL
       AND (ct.contract_no LIKE ? OR cu.company_name LIKE ?)
       AND ${contractClause.clause}
     ORDER BY ct.create_time DESC
     LIMIT 5`,
    [likeKeyword, likeKeyword, ...contractClause.params]
  );

  // 商机搜索
  const oppClause = await buildPermClause('opportunity', 'o', 'owner_id');
  let oppWhere = `(o.name LIKE ? OR cu.company_name LIKE ?) AND ${oppClause.clause}`;
  const oppParams = [likeKeyword, likeKeyword, ...oppClause.params];

  const [opportunities] = await pool.query(
    `SELECT o.id, o.name, o.stage, o.expected_amount,
            cu.company_name as customer_name
     FROM crm_opportunity o
     LEFT JOIN crm_customer cu ON o.customer_id = cu.id
     WHERE o.deleted_at IS NULL AND ${oppWhere}
     ORDER BY o.update_time DESC
     LIMIT 5`,
    oppParams
  );

  // 报价搜索
  const quoteClause = await buildPermClause('quote', 'q', 'create_by');
  const [quotes] = await pool.query(
    `SELECT q.id, q.quote_no, q.amount as total_amount,
            cu.company_name as customer_name
     FROM crm_quote q
     LEFT JOIN crm_customer cu ON q.customer_id = cu.id
     WHERE q.deleted_at IS NULL
       AND (q.quote_no LIKE ? OR cu.company_name LIKE ?)
       AND ${quoteClause.clause}
     ORDER BY q.create_time DESC
     LIMIT 5`,
    [likeKeyword, likeKeyword, ...quoteClause.params]
  );

  return {
    customers: customers.map(c => ({ ...c, type: 'customer' })),
    contracts: contracts.map(c => ({ ...c, type: 'contract' })),
    opportunities: opportunities.map(o => ({ ...o, stage_name: STAGE_MAP[o.stage] || '未知', type: 'opportunity' })),
    quotes: quotes.map(q => ({ ...q, type: 'quote' }))
  };
}

module.exports = {
  globalSearch
};

/**
 * 全角色权限初始化脚本
 * 为 boss / manager / sales / hr / purchase / finance / engineer 补齐
 * 菜单权限、按钮权限和数据权限。
 *
 * 设计原则：
 * - 仅插入缺失的权限数据，幂等执行
 * - 菜单权限控制前端 Sidebar / 路由守卫
 * - 按钮权限控制页面操作按钮
 * - 数据权限控制列表/详情可见范围
 * - 使用统一的 config/database.js 连接池，符合项目 MySQL 用法约定
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('../config/database');

if (!process.env.DB_PASSWORD) {
  console.error('FATAL: 请在 .env 中设置 DB_PASSWORD 后再执行权限初始化脚本');
  process.exit(1);
}

// 需要确保存在的菜单权限（code 唯一）
// type=menu，parent_id=0 表示一级菜单；子菜单通过路由守卫里的 permission 控制
const MENU_PERMISSIONS = [
  { code: 'dashboard', name: '首页', path: '/dashboard', icon: 'HomeFilled', sort: 1 },
  { code: 'customer', name: '客户管理', icon: 'UserFilled', sort: 2 },
  { code: 'customer:list', name: '客户列表', path: '/customer/list', sort: 1 },
  { code: 'pool', name: '公海池', path: '/pool', sort: 2 },
  { code: 'followup:calendar', name: '跟进日历', path: '/followup/calendar', sort: 4 },
  { code: 'followup:template', name: '跟进模板', path: '/followup/template', sort: 5 },
  { code: 'opportunity', name: '商机管理', path: '/opportunity', icon: 'TrendCharts', sort: 3 },
  { code: 'product', name: '产品管理', path: '/product', icon: 'Collection', sort: 4 },
  { code: 'quotation', name: '报价管理', path: '/quotation', icon: 'Document', sort: 5 },
  { code: 'contract', name: '合同管理', path: '/contract', icon: 'DocumentChecked', sort: 6 },
  { code: 'payment', name: '回款管理', icon: 'Money', sort: 7 },
  { code: 'payment:view', name: '回款查看', path: '/payment', sort: 1 },
  { code: 'supplier', name: '供应商管理', icon: 'OfficeBuilding', sort: 8 },
  { code: 'purchase', name: '采购管理', icon: 'ShoppingCart', sort: 9 },
  { code: 'service', name: '服务工单', path: '/service', icon: 'Service', sort: 10 },
  { code: 'survey', name: '满意度调查', path: '/survey', icon: 'Opportunity', sort: 11 },
  { code: 'hr', name: '人力资源', path: '/hr', icon: 'User', sort: 12 },
  { code: 'automation', name: '自动化', icon: 'Setting', sort: 13 },
  { code: 'report', name: '数据报表', path: '/report', icon: 'TrendCharts', sort: 14 },
  { code: 'analysis', name: '分析工具', path: '/analysis', icon: 'DataAnalysis', sort: 15 },
  { code: 'competitor', name: '竞品分析', path: '/competitor', icon: 'Aim', sort: 16 },
  { code: 'scoring', name: '客户评分', path: '/scoring', icon: 'Trophy', sort: 17 },
  { code: 'ai', name: 'AI助手', path: '/ai-suggestions', icon: 'ChatDotRound', sort: 18 },
  { code: 'approval', name: '审批管理', path: '/approval', icon: 'Stamp', sort: 19 },
  { code: 'knowledge', name: '销售资料', path: '/knowledge', icon: 'Notebook', sort: 20 },
  { code: 'email', name: '邮件管理', path: '/email', icon: 'Message', sort: 21 },
  { code: 'calendar', name: '日程管理', path: '/calendar', icon: 'Calendar', sort: 22 },
  { code: 'social', name: '社媒沟通', path: '/social', icon: 'ChatDotRound', sort: 23 },
  { code: 'notification', name: '通知中心', path: '/notification', icon: 'Bell', sort: 24 },
  { code: 'target', name: '销售目标', path: '/target', icon: 'DataBoard', sort: 25 },
  { code: 'team-dashboard', name: '团队看板', path: '/team-dashboard', icon: 'UserFilled', sort: 26 },
  { code: 'system', name: '系统管理', icon: 'Setting', sort: 27 },
  { code: 'system:user', name: '用户管理', path: '/system/user', sort: 1 },
  { code: 'system:role', name: '角色管理', path: '/system/role', sort: 2 },
  { code: 'system:dept', name: '部门管理', path: '/system/dept', sort: 3 },
  { code: 'system:log', name: '操作日志', path: '/system/log', sort: 4 },
  { code: 'system:tag', name: '标签管理', path: '/system/tags', sort: 5 },
  { code: 'system:backup', name: '数据备份', path: '/system/backup', sort: 6 },
  { code: 'system:permission', name: '权限管理', path: '/system/permission', sort: 7 },
  { code: 'system:integration', name: '集成管理', path: '/system/integration', sort: 8 },
  { code: 'system:currency', name: '货币管理', path: '/system/currency', sort: 9 },
  { code: 'settings', name: '系统设置', path: '/settings', icon: 'Setting', sort: 28 },
  // 历史遗留菜单权限（与现有数据对齐）
  { code: 'invoice', name: '发票管理', path: '/invoice', icon: 'Document', sort: 29 },
  // [111 迁移] reminder / followup_template 为死权限码已清理，不再种入
  { code: 'search', name: '全局搜索', path: '/search', icon: 'Search', sort: 31 },
  { code: 'tag', name: '标签管理', path: '/tags', icon: 'CollectionTag', sort: 32 },
  { code: 'contract_template', name: '合同模板', path: '/contract/template', icon: 'DocumentCopy', sort: 33 },
  { code: 'schedule:view', name: '日程查看', path: '/calendar', icon: 'Calendar', sort: 35 },
  { code: 'file', name: '附件管理', icon: 'Folder', sort: 36 },
];

// 按钮权限（父级用 code 表示）
const BUTTON_PERMISSIONS = [
  { code: 'customer:add', name: '新增客户', parent: 'customer' },
  { code: 'customer:edit', name: '编辑客户', parent: 'customer' },
  { code: 'customer:view', name: '查看客户', parent: 'customer' },
  { code: 'customer:delete', name: '删除客户', parent: 'customer' },
  { code: 'customer:assign', name: '分配客户', parent: 'customer' },
  { code: 'customer:import', name: '导入客户', parent: 'customer' },
  { code: 'customer:export', name: '导出客户', parent: 'customer' },
  { code: 'customer:list', name: '客户列表查看', parent: 'customer' },
  { code: 'pool:view', name: '查看公海', parent: 'pool' },
  { code: 'pool:claim', name: '认领公海', parent: 'pool' },
  { code: 'customer:release', name: '释放到公海', parent: 'customer' },
  { code: 'opportunity:add', name: '新增商机', parent: 'opportunity' },
  { code: 'opportunity:edit', name: '编辑商机', parent: 'opportunity' },
  { code: 'opportunity:delete', name: '删除商机', parent: 'opportunity' },
  { code: 'opportunity:view', name: '查看商机', parent: 'opportunity' },
  { code: 'quotation:add', name: '新增报价', parent: 'quotation' },
  { code: 'quotation:edit', name: '编辑报价', parent: 'quotation' },
  { code: 'quotation:delete', name: '删除报价', parent: 'quotation' },
  { code: 'contract:add', name: '新增合同', parent: 'contract' },
  { code: 'contract:edit', name: '编辑合同', parent: 'contract' },
  { code: 'contract:delete', name: '删除合同', parent: 'contract' },
  { code: 'product:add', name: '新增产品', parent: 'product' },
  { code: 'product:edit', name: '编辑产品', parent: 'product' },
  { code: 'product:delete', name: '删除产品', parent: 'product' },
  { code: 'supplier:add', name: '新增供应商', parent: 'supplier' },
  { code: 'supplier:edit', name: '编辑供应商', parent: 'supplier' },
  { code: 'supplier:delete', name: '删除供应商', parent: 'supplier' },
  { code: 'purchase:add', name: '新增采购', parent: 'purchase' },
  { code: 'purchase:edit', name: '编辑采购', parent: 'purchase' },
  { code: 'purchase:delete', name: '删除采购', parent: 'purchase' },
  { code: 'purchase:request', name: '采购申请', parent: 'purchase' },
  { code: 'purchase:comparison', name: '采购比价', parent: 'purchase' },
  { code: 'service:add', name: '新增工单', parent: 'service' },
  { code: 'service:edit', name: '编辑工单', parent: 'service' },
  { code: 'service:delete', name: '删除工单', parent: 'service' },
  { code: 'invoice:add', name: '新增发票', parent: 'invoice' },
  { code: 'invoice:edit', name: '编辑发票', parent: 'invoice' },
  { code: 'invoice:delete', name: '删除发票', parent: 'invoice' },
  { code: 'invoice:export', name: '导出发票', parent: 'invoice' },
  { code: 'system:user:add', name: '新增用户', parent: 'system:user' },
  { code: 'system:user:edit', name: '编辑用户', parent: 'system:user' },
  { code: 'system:user:delete', name: '删除用户', parent: 'system:user' },
  { code: 'system:role:add', name: '新增角色', parent: 'system:role' },
  { code: 'system:role:edit', name: '编辑角色', parent: 'system:role' },
  { code: 'system:role:delete', name: '删除角色', parent: 'system:role' },
  { code: 'system:role:permission', name: '配置权限', parent: 'system:role' },
  { code: 'approval:approve', name: '审批操作', parent: 'approval' },
  { code: 'backup:add', name: '创建备份', parent: 'system:backup' },
  { code: 'backup:restore', name: '恢复备份', parent: 'system:backup' },
  // 补全缺失的按钮权限
  { code: 'contract:view', name: '查看合同', parent: 'contract' },
  { code: 'product:view', name: '查看产品', parent: 'product' },
  { code: 'data_quality:check', name: '数据质量检查', parent: 'system' },
  { code: 'file:upload', name: '文件上传', parent: 'file' },
  // 补全此前路由使用但未定义/未授予任何角色的权限码
  { code: 'competitor:view', name: '查看竞品', parent: 'competitor' },
  { code: 'competitor:add', name: '新增竞品', parent: 'competitor' },
  { code: 'competitor:edit', name: '编辑竞品', parent: 'competitor' },
  { code: 'competitor:delete', name: '删除竞品', parent: 'competitor' },
  { code: 'email:send', name: '发送邮件', parent: 'email' },
  { code: 'leads:view', name: '查看潜客', parent: 'customer' },
  { code: 'leads:convert', name: '转化潜客', parent: 'customer' },
  { code: 'finance', name: '财务增强', parent: 'report' },
  { code: 'recycle_bin:view', name: '查看回收站', parent: 'system' },
  { code: 'data:restore', name: '数据恢复', parent: 'system' },
  { code: 'log:export', name: '导出日志', parent: 'system:log' },
  { code: 'purchase:approve', name: '采购审批', parent: 'purchase' },
];

// 各角色拥有的权限码（菜单 + 按钮）
const ROLE_PERMISSIONS = {
  boss: [
    // 所有菜单
    'dashboard', 'customer', 'customer:list', 'pool', 'pool:view', 'pool:claim', 'customer:release', 'followup:calendar', 'followup:template',
    'opportunity', 'product', 'quotation', 'contract', 'payment', 'payment:view',
    'supplier', 'purchase', 'service', 'survey', 'hr', 'automation', 'report', 'analysis',
    'competitor', 'scoring', 'ai', 'approval', 'knowledge', 'email', 'calendar', 'social',
    'notification', 'target', 'team-dashboard', 'system', 'system:user', 'system:role',
    'system:dept', 'system:log', 'system:tag', 'system:backup', 'system:permission',
    'system:integration', 'system:currency', 'settings',
    // 所有按钮
    'customer:add', 'customer:edit', 'customer:view', 'customer:delete', 'customer:assign', 'customer:import', 'customer:export', 'customer:list',
    'opportunity:add', 'opportunity:edit', 'opportunity:delete', 'opportunity:view',
    'quotation:add', 'quotation:edit', 'quotation:delete',
    'contract:add', 'contract:edit', 'contract:delete',
    'product:add', 'product:edit', 'product:delete',
    'supplier:add', 'supplier:edit', 'supplier:delete',
    'purchase:add', 'purchase:edit', 'purchase:delete', 'purchase:request', 'purchase:comparison',
    'service:add', 'service:edit', 'service:delete',
    'system:user:add', 'system:user:edit', 'system:user:delete',
    'system:role:add', 'system:role:edit', 'system:role:delete', 'system:role:permission',
    'approval:approve', 'backup:add', 'backup:restore',
    'file', 'file:upload',
    'search', 'tag', 'contract_template', 'data_quality:check', 'log:export',
    'recycle_bin:view', 'data:restore', 'finance',
    'competitor:view', 'competitor:add', 'competitor:edit', 'competitor:delete',
    'email:send', 'leads:view', 'leads:convert', 'purchase:approve'
  ],
  manager: [
    'dashboard', 'customer', 'customer:list', 'pool', 'pool:view', 'pool:claim', 'customer:release', 'followup:calendar', 'followup:template',
    'opportunity', 'product', 'quotation', 'contract', 'payment', 'payment:view',
    'supplier', 'purchase', 'service', 'survey', 'calendar', 'social', 'competitor', 'analysis',
    'report', 'scoring', 'ai', 'approval', 'knowledge', 'email', 'notification', 'target', 'team-dashboard',
    'customer:add', 'customer:edit', 'customer:view', 'customer:delete', 'customer:assign', 'customer:import', 'customer:export', 'customer:list',
    'opportunity:add', 'opportunity:edit', 'opportunity:delete', 'opportunity:view',
    'quotation:add', 'quotation:edit', 'quotation:delete',
    'contract:add', 'contract:edit', 'contract:delete',
    'product:add', 'product:edit', 'product:delete',
    'supplier:add', 'supplier:edit', 'supplier:delete',
    'purchase:add', 'purchase:edit', 'purchase:delete', 'purchase:request', 'purchase:comparison',
    'service:add', 'service:edit', 'service:delete',
    'approval:approve',
    'file', 'file:upload',
    'search', 'tag', 'contract_template', 'data_quality:check',
    'competitor:view', 'competitor:add', 'competitor:edit', 'competitor:delete',
    'email:send', 'leads:view', 'leads:convert', 'purchase:approve'
  ],
  sales: [
    'dashboard', 'customer', 'customer:list', 'pool', 'pool:view', 'pool:claim', 'followup:calendar', 'followup:template',
    'opportunity', 'product', 'quotation', 'contract', 'calendar', 'social', 'scoring', 'ai',
    'approval', 'knowledge', 'email', 'notification', 'survey', 'schedule:view',
    'customer:add', 'customer:edit', 'customer:view', 'customer:delete', 'customer:import', 'customer:export', 'customer:list',
    'opportunity:add', 'opportunity:edit', 'opportunity:delete', 'opportunity:view',
    'quotation:add', 'quotation:edit', 'quotation:delete',
    'contract:add', 'contract:edit', 'contract:delete',
    'approval:approve',
    'file', 'file:upload',
    'search', 'tag', 'email:send', 'leads:view', 'leads:convert'
  ],
  hr: [
    'dashboard', 'hr', 'calendar', 'knowledge', 'email', 'notification', 'survey',
    'system:user', 'system:dept', 'system:log',
    'system:user:add', 'system:user:edit', 'system:user:delete',
    'file', 'file:upload',
    'search', 'tag', 'email:send'
  ],
  purchase: [
    'dashboard', 'supplier', 'purchase', 'product', 'calendar', 'knowledge', 'email', 'notification', 'survey',
    'supplier:add', 'supplier:edit', 'supplier:delete',
    'purchase:add', 'purchase:edit', 'purchase:delete', 'purchase:request', 'purchase:comparison',
    'product:add', 'product:edit', 'product:delete',
    'file', 'file:upload',
    'search', 'tag', 'email:send', 'purchase:approve'
  ],
  finance: [
    'dashboard', 'contract', 'payment', 'payment:view', 'invoice', 'report', 'calendar', 'knowledge',
    'email', 'notification', 'survey',
    'contract:view', 'contract:edit',
    'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export',
    'file', 'file:upload',
    'search', 'tag', 'email:send', 'finance'
  ],
  engineer: [
    'dashboard', 'service', 'product', 'knowledge', 'calendar', 'email', 'notification', 'survey',
    'service:add', 'service:edit', 'service:delete',
    'product:view',
    'file', 'file:upload',
    'search', 'tag', 'email:send'
  ]
};

// 数据权限配置：模块 -> 范围
const DATA_PERMISSIONS = {
  boss: {
    customer: 'all', opportunity: 'all', contract: 'all', supplier: 'all', purchase: 'all',
    quotation: 'all', service: 'all', finance: 'all', approval: 'all', knowledge: 'all',
    competitor: 'all', report: 'all', survey: 'all', product: 'all'
  },
  manager: {
    customer: 'dept_and_sub', opportunity: 'dept_and_sub', contract: 'dept_and_sub',
    quotation: 'dept_and_sub', supplier: 'dept_and_sub', purchase: 'dept_and_sub',
    service: 'dept_and_sub', report: 'dept_and_sub',
    approval: 'dept_and_sub', knowledge: 'dept_and_sub', survey: 'dept_and_sub',
    product: 'dept_and_sub'
  },
  sales: {
    customer: 'self', opportunity: 'self', contract: 'self', quotation: 'self',
    report: 'self', approval: 'self'
  },
  hr: {
    system: 'all', knowledge: 'dept', survey: 'dept'
  },
  purchase: {
    supplier: 'dept', purchase: 'dept', product: 'dept'
  },
  finance: {
    contract: 'all', payment: 'all', invoice: 'all', report: 'all', finance: 'all',
    supplier: 'all', purchase: 'all', survey: 'all', quotation: 'all', service: 'all'
  },
  engineer: {
    service: 'dept', product: 'dept', knowledge: 'dept', survey: 'dept'
  }
};

async function main() {
  // 1. 补齐菜单权限
  for (const p of MENU_PERMISSIONS) {
    await pool.query(
      `INSERT IGNORE INTO sys_permission (name, code, type, parent_id, path, icon, sort)
       VALUES (?, ?, 'menu', 0, ?, ?, ?)`,
      [p.name, p.code, p.path || null, p.icon || null, p.sort || 0]
    );
  }

  // 2. 补齐按钮权限并绑定父级
  for (const p of BUTTON_PERMISSIONS) {
    const [[parent]] = await pool.query('SELECT id FROM sys_permission WHERE code = ?', [p.parent]);
    const parentId = parent ? parent.id : 0;
    await pool.query(
      `INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort)
       VALUES (?, ?, 'button', ?, 0)`,
      [p.name, p.code, parentId]
    );
  }

  // 2b. 规范化历史类型：098 迁移曾以 type='api' 写入以下操作码，
  //     统一为 button（操作按钮权限）；权限校验按 code 匹配，类型不影响功能
  await pool.query(
    `UPDATE sys_permission SET type = 'button'
     WHERE code IN ('pool:view', 'pool:claim', 'customer:release', 'leads:view', 'leads:convert')`
  );

  // 3. 获取角色映射
  const [roles] = await pool.query('SELECT id, code FROM sys_role');
  const roleMap = Object.fromEntries(roles.map(r => [r.code, r.id]));

  // 4. 为每个角色分配权限
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) {
      console.warn(`角色 ${roleCode} 不存在，跳过`);
      continue;
    }
    for (const code of codes) {
      await pool.query(
        `INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
         SELECT ?, id FROM sys_permission WHERE code = ?`,
        [roleId, code]
      );
    }
  }

  // 5. 数据权限
  for (const [roleCode, modules] of Object.entries(DATA_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;
    for (const [module, scope] of Object.entries(modules)) {
      await pool.query(
        `INSERT IGNORE INTO sys_data_permission (role_id, module, data_scope)
         VALUES (?, ?, ?)`,
        [roleId, module, scope]
      );
    }
  }

  // 6. 清理不在配置中的历史残留权限（实现权限配置与数据库真正同步）
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;
    if (codes.length === 0) {
      await pool.query('DELETE FROM sys_role_permission WHERE role_id = ?', [roleId]);
      continue;
    }
    const placeholders = codes.map(() => '?').join(',');
    await pool.query(
      `DELETE rp FROM sys_role_permission rp
       WHERE rp.role_id = ?
         AND rp.permission_id NOT IN (
           SELECT id FROM sys_permission WHERE code IN (${placeholders})
         )`,
      [roleId, ...codes]
    );
  }

  // 7. 清理不在配置中的历史残留数据权限
  for (const [roleCode, modules] of Object.entries(DATA_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;
    const moduleCodes = Object.keys(modules);
    if (moduleCodes.length === 0) {
      await pool.query('DELETE FROM sys_data_permission WHERE role_id = ?', [roleId]);
      continue;
    }
    const placeholders = moduleCodes.map(() => '?').join(',');
    await pool.query(
      `DELETE FROM sys_data_permission
       WHERE role_id = ?
         AND module NOT IN (${placeholders})`,
      [roleId, ...moduleCodes]
    );
  }

  // 8. 对账输出
  const [rows] = await pool.query(
    `SELECT r.code AS role_code, r.name AS role_name,
            COUNT(DISTINCT rp.permission_id) AS perm_count,
            (SELECT COUNT(*) FROM sys_data_permission dp WHERE dp.role_id = r.id) AS data_count
     FROM sys_role r
     LEFT JOIN sys_role_permission rp ON rp.role_id = r.id
     GROUP BY r.id, r.code, r.name
     ORDER BY r.id`
  );
  console.log('=== 角色权限对账 ===');
  console.table(rows);

  // 每个角色的权限码清单
  for (const row of rows) {
    const roleId = roleMap[row.role_code];
    const [codes] = await pool.query(
      `SELECT p.code, p.type FROM sys_role_permission rp
       JOIN sys_permission p ON rp.permission_id = p.id
       WHERE rp.role_id = ? ORDER BY p.type, p.code`,
      [roleId]
    );
    console.log(`\n[${row.role_code}] 权限列表 (${codes.length}):`);
    console.log(codes.map(c => `${c.type}:${c.code}`).join(', '));
  }

  await pool.end();

  // 显式退出：config/database → utils/alert 中的 5 分钟 setInterval 会挂住事件循环，
  // 不退出会导致 docker exec 等调用方永远等待
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

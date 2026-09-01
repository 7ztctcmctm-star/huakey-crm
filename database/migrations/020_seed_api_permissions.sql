-- 020_seed_api_permissions.sql
-- 为所有受保护的API接口创建api类型权限记录

-- 客户管理模块 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户列表接口', 'api:customer:list', 'api', id, 'POST /customer/list', 1 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:list');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增客户接口', 'api:customer:add', 'api', id, 'POST /customer/add', 2 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑客户接口', 'api:customer:update', 'api', id, 'POST /customer/update', 3 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除客户接口', 'api:customer:delete', 'api', id, 'POST /customer/delete', 4 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '导出客户接口', 'api:customer:export', 'api', id, 'POST /customer/export', 5 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:export');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '分配客户接口', 'api:customer:assign', 'api', id, 'POST /customer/assign', 6 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:assign');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '批量分配接口', 'api:customer:batch-assign', 'api', id, 'POST /customer/batch-assign', 7 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:batch-assign');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '导入客户接口', 'api:customer:import', 'api', id, 'POST /customer/import-*', 8 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:import');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户池认领接口', 'api:customer:claim', 'api', id, 'POST /customer/claim', 9 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:claim');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户池释放接口', 'api:customer:release', 'api', id, 'POST /customer/release', 10 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:release');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '批量释放接口', 'api:customer:batch-release', 'api', id, 'POST /customer/batch-release', 11 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:batch-release');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '联系人增删改接口', 'api:customer:contact', 'api', id, 'POST /customer/contact/*', 12 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:contact');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据质量检查接口', 'api:customer:quality', 'api', id, 'POST /customer/quality-check', 13 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:quality');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '跟进记录增删改接口', 'api:followup:crud', 'api', id, 'POST /followup/add|update|delete', 14 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:followup:crud');

-- 线索管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '线索转换接口', 'api:leads:convert', 'api', id, 'POST /leads/convert', 1 FROM sys_permission WHERE code = 'leads'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:leads:convert');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '线索认领接口', 'api:leads:claim', 'api', id, 'POST /leads/claim', 2 FROM sys_permission WHERE code = 'leads'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:leads:claim');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '线索标记丢失接口', 'api:leads:mark-lost', 'api', id, 'POST /leads/mark-lost', 3 FROM sys_permission WHERE code = 'leads'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:leads:mark-lost');

-- 商机管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增商机接口', 'api:opportunity:add', 'api', id, 'POST /opportunity/add', 1 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑商机接口', 'api:opportunity:update', 'api', id, 'POST /opportunity/update', 2 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '推进阶段接口', 'api:opportunity:update-stage', 'api', id, 'POST /opportunity/update-stage', 3 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:update-stage');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除商机接口', 'api:opportunity:delete', 'api', id, 'POST /opportunity/delete', 4 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:delete');

-- 合同管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增合同接口', 'api:contract:add', 'api', id, 'POST /contract/add', 1 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑合同接口', 'api:contract:update', 'api', id, 'POST /contract/update', 2 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除合同接口', 'api:contract:delete', 'api', id, 'POST /contract/delete', 3 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '回款增删改接口', 'api:contract:payment', 'api', id, 'POST /contract/payment/*', 4 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:payment');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '合同导出接口', 'api:contract:export', 'api', id, 'POST /contract/export', 5 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:export');

-- 产品管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增产品接口', 'api:product:add', 'api', id, 'POST /product/add', 1 FROM sys_permission WHERE code = 'product'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:product:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑产品接口', 'api:product:update', 'api', id, 'POST /product/update', 2 FROM sys_permission WHERE code = 'product'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:product:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除产品接口', 'api:product:delete', 'api', id, 'POST /product/delete', 3 FROM sys_permission WHERE code = 'product'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:product:delete');

-- 报价管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增报价接口', 'api:quotation:add', 'api', id, 'POST /quote/add', 1 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑报价接口', 'api:quotation:update', 'api', id, 'POST /quote/update', 2 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除报价接口', 'api:quotation:delete', 'api', id, 'POST /quote/delete', 3 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '报价转合同接口', 'api:quotation:to-contract', 'api', id, 'POST /quote/to-contract', 4 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:to-contract');

-- 供应商管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增供应商接口', 'api:supplier:add', 'api', id, 'POST /supplier/add', 1 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑供应商接口', 'api:supplier:update', 'api', id, 'POST /supplier/update', 2 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除供应商接口', 'api:supplier:delete', 'api', id, 'POST /supplier/delete', 3 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '供应商联系人接口', 'api:supplier:contact', 'api', id, 'POST /supplier/contact/add', 4 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:contact');

-- 采购管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增采购接口', 'api:purchase:add', 'api', id, 'POST /purchase/add', 1 FROM sys_permission WHERE code = 'purchase'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:purchase:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '采购状态更新接口', 'api:purchase:status', 'api', id, 'POST /purchase/update-status', 2 FROM sys_permission WHERE code = 'purchase'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:purchase:status');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '采购收货接口', 'api:purchase:receipt', 'api', id, 'POST /purchase/receipt/add', 3 FROM sys_permission WHERE code = 'purchase'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:purchase:receipt');

-- 售后服务 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增工单接口', 'api:service:add', 'api', id, 'POST /service/add', 1 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑工单接口', 'api:service:update', 'api', id, 'POST /service/update', 2 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除工单接口', 'api:service:delete', 'api', id, 'POST /service/delete', 3 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '工单操作接口', 'api:service:operate', 'api', id, 'POST /service/assign|start|finish|confirm', 4 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:operate');

-- 数据报表 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '逾期客户列表接口', 'api:report:overdue', 'api', id, 'POST /report/overdue', 1 FROM sys_permission WHERE code = 'report'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:report:overdue');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '报表导出接口', 'api:report:export', 'api', id, 'POST /report/export', 2 FROM sys_permission WHERE code = 'report'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:report:export');

-- 销售目标 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '设置目标接口', 'api:target:set', 'api', id, 'POST /target/set', 1 FROM sys_permission WHERE code = 'target'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:target:set');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '批量设置目标接口', 'api:target:batch-set', 'api', id, 'POST /target/batch-set', 2 FROM sys_permission WHERE code = 'target'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:target:batch-set');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除目标接口', 'api:target:delete', 'api', id, 'POST /target/delete', 3 FROM sys_permission WHERE code = 'target'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:target:delete');

-- 系统管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '日志导出接口', 'api:system:log-export', 'api', id, 'POST /log/export', 1 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:log-export');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据备份接口', 'api:system:backup', 'api', id, 'POST /backup/*', 2 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:backup');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '回收站接口', 'api:system:recycle', 'api', id, 'POST /recycle/*', 3 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:recycle');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据恢复接口', 'api:system:restore', 'api', id, 'POST /recycle/restore|permanent-delete', 4 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:restore');

-- 人事管理模块菜单权限
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '人事管理', 'hr', 'menu', 0, '/hr', 10
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'hr');

-- Bug #35: 为高频列表查询添加复合索引
-- crm_customer: 列表查询固定过滤 owner_id + status，按 create_time 排序
CREATE INDEX IF NOT EXISTS idx_cust_owner_status_ctime ON crm_customer(owner_id, status, create_time);

-- crm_opportunity: 列表查询过滤 owner_id + stage，按 create_time 排序
CREATE INDEX IF NOT EXISTS idx_opp_owner_stage_ctime ON crm_opportunity(owner_id, stage, create_time);

-- crm_contract: 列表查询过滤 status，按 create_time 排序
CREATE INDEX IF NOT EXISTS idx_contract_status_ctime ON crm_contract(status, create_time);

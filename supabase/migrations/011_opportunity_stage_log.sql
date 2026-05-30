-- 商机阶段变更记录表
CREATE TABLE IF NOT EXISTS crm_opportunity_stage_log (
    id SERIAL PRIMARY KEY,
    opportunity_id INT NOT NULL,
    from_stage SMALLINT NOT NULL,
    to_stage SMALLINT NOT NULL,
    changed_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_stage_log_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE CASCADE,
    CONSTRAINT fk_stage_log_user FOREIGN KEY (changed_by) REFERENCES sys_user(id) ON DELETE SET NULL
);

COMMENT ON TABLE crm_opportunity_stage_log IS '商机阶段变更记录';
COMMENT ON COLUMN crm_opportunity_stage_log.id IS '主键ID';
COMMENT ON COLUMN crm_opportunity_stage_log.opportunity_id IS '商机ID';
COMMENT ON COLUMN crm_opportunity_stage_log.from_stage IS '原阶段';
COMMENT ON COLUMN crm_opportunity_stage_log.to_stage IS '新阶段';
COMMENT ON COLUMN crm_opportunity_stage_log.changed_by IS '操作人ID';
COMMENT ON COLUMN crm_opportunity_stage_log.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_opp_stage_log_opp ON crm_opportunity_stage_log(opportunity_id);

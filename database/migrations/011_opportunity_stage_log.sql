-- 商机阶段变更记录表
CREATE TABLE IF NOT EXISTS crm_opportunity_stage_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    opportunity_id INT NOT NULL COMMENT '商机ID',
    from_stage TINYINT NOT NULL COMMENT '原阶段',
    to_stage TINYINT NOT NULL COMMENT '新阶段',
    changed_by INT DEFAULT NULL COMMENT '操作人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_opp_stage_log_opp (opportunity_id),
    CONSTRAINT fk_stage_log_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE CASCADE,
    CONSTRAINT fk_stage_log_user FOREIGN KEY (changed_by) REFERENCES sys_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商机阶段变更记录';

-- Bug #02: 联系人软删除支持
ALTER TABLE crm_contact ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间';

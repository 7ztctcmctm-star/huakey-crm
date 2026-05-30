-- Bug #02: 联系人软删除支持
ALTER TABLE crm_contact ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

COMMENT ON COLUMN crm_contact.deleted_at IS '软删除时间';

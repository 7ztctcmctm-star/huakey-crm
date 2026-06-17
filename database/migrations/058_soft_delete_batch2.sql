-- 058: 7表补齐 deleted_at 软删除字段
-- crm_attachment, crm_competitor_encounter, crm_competitor_intel,
-- crm_contract_template, crm_email_account, crm_social_contact, crm_tag

ALTER TABLE crm_attachment ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE crm_competitor_encounter ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE crm_competitor_intel ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE crm_contract_template ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE crm_email_account ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE crm_social_contact ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE crm_tag ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;

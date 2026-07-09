-- =============================================
-- HuakeyCRM 生产模式切换 - 数据库清理脚本
-- 假用户已删除 (id: 2,3,14,15,16,17)
-- 请手动执行以下语句完成剩余清理
-- =============================================

USE huakey_crm;

-- 1. 移除假产品
DELETE FROM crm_product WHERE code IN ('TEST-001') OR name = '666';

-- 2. 清理测试附件
DELETE FROM crm_attachment WHERE file_name IN ('test.jpg', 'test-upload.png');

-- 3. 清理测试知识文档
DELETE FROM crm_knowledge_document WHERE name LIKE '%test%';

-- 4. 删除临时清理表
DROP TABLE IF EXISTS customer_owner_cleanup_20260604;
DROP TABLE IF EXISTS customer_owner_reclaim_non_admin_20260604;

-- 5. 重置空表自增ID
ALTER TABLE crm_knowledge_faq AUTO_INCREMENT = 1;
ALTER TABLE crm_knowledge_script AUTO_INCREMENT = 1;

-- 验证
SELECT 'Remaining users:' AS msg;
SELECT id, username, real_name, status FROM sys_user ORDER BY id;
SELECT 'Remaining products:' AS msg;
SELECT id, name, code FROM crm_product;

-- 087: 清理测试客户数据 + 修复 position 字段编码
-- 问题:
--   1. 删除测试用户后，测试客户因 FK ON DELETE SET NULL 导致 owner_id=NULL 但记录未删除
--   2. crm_employee_profile.position 可能因导入备份时编码问题导致乱码
-- 修复日期: 2026-07-21

USE huakey_crm;

-- ============================================================
-- 第一部分: 清理测试客户
-- ============================================================

-- 测试客户来源: database/seeds/test_data_modules.sql
-- 特征: 公司名包含 "王销售客户-" / "李销售客户-" / "赵销售客户-" / "陈销售客户-"
--       以及硬编码的 20 个测试公司名
-- 注意: 使用软删除 (deleted_at) 而非硬删除，以便需要时恢复。
-- status 字段已迁移为 VARCHAR(32) 字符串状态机，不再使用数值 0 表示删除。

-- 1a. 批量生成的测试客户（公司名含销售客户编号）
UPDATE crm_customer
SET deleted_at = NOW()
WHERE (company_name LIKE '王销售客户-%号公司'
   OR company_name LIKE '李销售客户-%号公司'
   OR company_name LIKE '赵销售客户-%号公司'
   OR company_name LIKE '陈销售客户-%号公司');

-- 1b. 硬编码的测试客户
UPDATE crm_customer
SET deleted_at = NOW()
WHERE company_name IN (
  '深圳华科科技有限公司',
  '广州明源电子有限公司',
  '珠海航宇通讯技术公司',
  '佛山顺德电器制造厂',
  '中山市灯饰有限公司',
  '东莞五金精密加工厂',
  '惠州TCL配套供应商',
  '汕头市澄海玩具厂',
  '肇庆市新材料科技公司',
  '江门市摩托车配件厂',
  '北京中关村软件科技公司',
  '上海浦东集成电路设计公司',
  '杭州西湖区互联网公司',
  '成都高新区游戏公司',
  '重庆市渝中区金融科技公司',
  '南京雨花台区大数据公司',
  '武汉光谷通信技术公司',
  '西安高新区半导体公司',
  '厦门市思明区软件外包公司',
  '福州市马尾区电子制造厂',
  '泉州市石狮服装制造厂'
);

-- 1c. 清理测试跟进记录（测试客户的跟进记录）
DELETE FROM crm_follow_up
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- 1d. 清理测试商机
DELETE FROM crm_opportunity
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- 1e. 清理测试分配日志
DELETE FROM crm_assign_log
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- 1f. 清理测试提醒
DELETE FROM crm_follow_up_reminder
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- ============================================================
-- 第二部分: 职位字段编码修复
-- ============================================================

-- 先执行诊断查询，查看当前 position 数据情况
-- (此行在 MySQL 中会输出诊断信息，但不影响后续 UPDATE)
SELECT '=== 诊断: 当前 position 字段数据 ===' AS step;
SELECT id, user_id, position, HEX(position) AS position_hex
FROM crm_employee_profile
WHERE position IS NOT NULL AND position != '';

-- 修复方法: 如果中文字段是通过 latin1 连接写入 utf8mb4 列的（双重编码），
-- 可用 CONVERT(BINARY CONVERT(col USING latin1) USING utf8mb4) 还原。
-- 此操作对已正确编码的数据会损坏，故先检查 position 的十六进制值。
--
-- 判断标准: 如果您在 position 中看到的乱码类似 "èæ¯" / "Ã©" / "ç" 等
-- 拉丁字符，说明字段确实是双重编码，请取消下面注释并执行修复:

-- UPDATE crm_employee_profile
-- SET position = CONVERT(BINARY CONVERT(position USING latin1) USING utf8mb4)
-- WHERE position IS NOT NULL AND position != '';

-- 如果 position 乱码是另一种形式（如全角问号、方框），可能是原始数据已损坏，
-- 需要从备份重新导入该字段。请联系管理员检查导入脚本的字符集设置。

-- ============================================================
-- 第三部分: 验证结果
-- ============================================================

SELECT '=== 清理结果 ===' AS step;

SELECT '剩余客户总数' AS metric, COUNT(*) AS value FROM crm_customer WHERE deleted_at IS NULL
UNION ALL
SELECT '已软删除客户', COUNT(*) FROM crm_customer WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'owner_id为NULL的客户', COUNT(*) FROM crm_customer WHERE owner_id IS NULL AND deleted_at IS NULL
UNION ALL
SELECT '剩余跟进记录', COUNT(*) FROM crm_follow_up
UNION ALL
SELECT '剩余商机', COUNT(*) FROM crm_opportunity
UNION ALL
SELECT '剩余提醒', COUNT(*) FROM crm_follow_up_reminder
UNION ALL
SELECT '剩余分配日志', COUNT(*) FROM crm_assign_log;

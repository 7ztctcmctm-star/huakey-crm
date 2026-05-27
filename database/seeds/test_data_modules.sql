-- ============================================================
-- 三大模块功能验证测试数据
-- 包含：老板权限、客户分配、团队看板、逾期提醒
-- ============================================================

USE huakey_crm;

-- ========== 1. 用户数据 ==========

-- 确保角色存在（如果迁移脚本未执行，这里补执行）
INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all)
VALUES ('老板', 'boss', '公司老板，查看全公司数据，分配客户', 1, 1, 1);

-- 获取角色ID
SET @boss_role_id = (SELECT id FROM sys_role WHERE code = 'boss');
SET @manager_role_id = (SELECT id FROM sys_role WHERE code = 'sales_manager');
SET @sales_role_id = (SELECT id FROM sys_role WHERE code = 'sales');

-- 插入老板用户 (密码: 123456)
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status, manager_id)
SELECT 'boss', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '王老板', '13900000001', 'boss@huakey.com', 1, @boss_role_id, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM sys_user WHERE username = 'boss');

-- 插入销售经理 (密码: 123456)
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status, manager_id)
SELECT 'manager_zhang', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '张经理', '13900000002', 'zhang@huakey.com', 2, @manager_role_id, 1, (SELECT id FROM sys_user WHERE username = 'boss')
WHERE NOT EXISTS (SELECT 1 FROM sys_user WHERE username = 'manager_zhang');

-- 获取老板ID
SET @boss_id = (SELECT id FROM sys_user WHERE username = 'boss');
SET @manager_id = (SELECT id FROM sys_user WHERE username = 'manager_zhang');

-- 插入销售人员（密码: 123456）
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status, manager_id) VALUES
('sales_wang', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '王销售', '13900000010', 'wang_sales@huakey.com', 2, @sales_role_id, 1, @manager_id),
('sales_li', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '李销售', '13900000011', 'li_sales@huakey.com', 2, @sales_role_id, 1, @manager_id),
('sales_zhao', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '赵销售', '13900000012', 'zhao_sales@huakey.com', 2, @sales_role_id, 1, @manager_id),
('sales_chen', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '陈销售', '13900000013', 'chen_sales@huakey.com', 2, @sales_role_id, 1, @manager_id)
ON DUPLICATE KEY UPDATE real_name = VALUES(real_name);

-- 获取销售ID
SET @sales_wang_id = (SELECT id FROM sys_user WHERE username = 'sales_wang');
SET @sales_li_id = (SELECT id FROM sys_user WHERE username = 'sales_li');
SET @sales_zhao_id = (SELECT id FROM sys_user WHERE username = 'sales_zhao');
SET @sales_chen_id = (SELECT id FROM sys_user WHERE username = 'sales_chen');

-- ========== 2. 客户数据 ==========

-- 王销售：56个客户，其中5个超15天未跟进
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time) VALUES
('深圳华科科技有限公司', '赵总', '13800138001', '通信设备', '展会', 'A', @sales_wang_id, 1, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 60 DAY)),
('广州明源电子有限公司', '钱经理', '13800138002', '电子制造', 'Facebook', 'B', @sales_wang_id, 1, DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 50 DAY)),
('珠海航宇通讯技术公司', '孙工', '13800138003', '通讯技术', 'LinkedIn', 'A', @sales_wang_id, 1, DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 90 DAY)),
('佛山顺德电器制造厂', '李厂长', '13800138004', '电器制造', '转介绍', 'B', @sales_wang_id, 1, DATE_SUB(NOW(), INTERVAL 18 DAY), DATE_SUB(NOW(), INTERVAL 80 DAY)),
('中山市灯饰有限公司', '周采购', '13800138005', '照明行业', '独立站', 'C', @sales_wang_id, 1, NULL, DATE_SUB(NOW(), INTERVAL 45 DAY)),
('东莞五金精密加工厂', '吴技术', '13800138006', '五金加工', '电话', 'C', @sales_wang_id, 1, NULL, DATE_SUB(NOW(), INTERVAL 40 DAY)),
('惠州TCL配套供应商', '郑经理', '13800138007', '家电配套', '展会', 'B', @sales_wang_id, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 35 DAY)),
('汕头市澄海玩具厂', '陈总', '13800138008', '玩具制造', '其他', 'D', @sales_wang_id, 1, NULL, DATE_SUB(NOW(), INTERVAL 30 DAY)),
('肇庆市新材料科技公司', '刘博士', '13800138009', '新材料', 'Instagram', 'B', @sales_wang_id, 2, DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 70 DAY)),
('江门市摩托车配件厂', '黄厂长', '13800138010', '汽摩配件', '其他网络渠道', 'C', @sales_wang_id, 2, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 65 DAY));

-- 批量生成王销售其余46个普通客户（按日递减）
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time)
SELECT CONCAT('王销售客户-', n, '号公司'), CONCAT('联系人', n), CONCAT('139', 10000000 + n),
       CASE n % 5 WHEN 0 THEN '通信' WHEN 1 THEN '电子' WHEN 2 THEN '制造' WHEN 3 THEN '互联网' ELSE '贸易' END,
       CASE n % 7 WHEN 0 THEN '展会' WHEN 1 THEN 'Facebook' WHEN 2 THEN 'Instagram' WHEN 3 THEN 'LinkedIn' WHEN 4 THEN '独立站' WHEN 5 THEN '转介绍' ELSE '电话' END,
       CASE n % 4 WHEN 0 THEN 'A' WHEN 1 THEN 'B' WHEN 2 THEN 'C' ELSE 'D' END,
       @sales_wang_id,
       CASE WHEN n % 5 = 0 THEN 2 ELSE 1 END,
       DATE_SUB(NOW(), INTERVAL (n % 12) DAY),
       DATE_SUB(NOW(), INTERVAL (n + 30) DAY)
FROM (
  SELECT ones.n + tens.n * 10 + 1 as n
  FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) ones,
       (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) tens
  WHERE ones.n + tens.n * 10 + 1 <= 46
) nums;

-- 李销售：42个客户，0个超15天（全部近期跟进过）
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time) VALUES
('北京中关村软件科技公司', '何总', '13800138020', '软件', 'Facebook', 'A', @sales_li_id, 1, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 90 DAY)),
('上海浦东集成电路设计公司', '吕经理', '13800138021', '集成电路', '展会', 'A', @sales_li_id, 2, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 85 DAY)),
('杭州西湖区互联网公司', '施总监', '13800138022', '互联网', 'LinkedIn', 'B', @sales_li_id, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 80 DAY)),
('成都高新区游戏公司', '张开发', '13800138023', '游戏', 'Instagram', 'B', @sales_li_id, 1, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 75 DAY)),
('重庆市渝中区金融科技公司', '孔经理', '13800138024', '金融科技', '独立站', 'C', @sales_li_id, 1, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 70 DAY));

-- 批量生成李销售其余37个客户（全部近期跟进）
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time)
SELECT CONCAT('李销售客户-', n, '号公司'), CONCAT('联系', n), CONCAT('138', 20000000 + n),
       CASE n % 5 WHEN 0 THEN '软件' WHEN 1 THEN '互联网' WHEN 2 THEN '金融' WHEN 3 THEN '零售' ELSE '制造' END,
       CASE n % 7 WHEN 0 THEN '展会' WHEN 1 THEN 'Facebook' WHEN 2 THEN 'Instagram' WHEN 3 THEN 'LinkedIn' WHEN 4 THEN '独立站' WHEN 5 THEN '转介绍' ELSE '其他' END,
       CASE n % 4 WHEN 0 THEN 'A' WHEN 1 THEN 'B' WHEN 2 THEN 'C' ELSE 'D' END,
       @sales_li_id,
       1,
       DATE_SUB(NOW(), INTERVAL (n % 5) DAY),
       DATE_SUB(NOW(), INTERVAL (n + 40) DAY)
FROM (
  SELECT ones.n + tens.n * 10 + 1 as n
  FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) ones,
       (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) tens
  WHERE ones.n + tens.n * 10 + 1 <= 37
) nums;

-- 赵销售：28个客户（新人），3个超15天
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time) VALUES
('南京雨花台区大数据公司', '曹总', '13800138050', '大数据', '展会', 'A', @sales_zhao_id, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY)),
('武汉光谷通信技术公司', '严经理', '13800138051', '通信', 'Facebook', 'B', @sales_zhao_id, 1, DATE_SUB(NOW(), INTERVAL 25 DAY), DATE_SUB(NOW(), INTERVAL 25 DAY)),
('西安高新区半导体公司', '华工', '13800138052', '半导体', 'LinkedIn', 'A', @sales_zhao_id, 1, NULL, DATE_SUB(NOW(), INTERVAL 22 DAY));

-- 批量生成赵销售其余25个客户
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time)
SELECT CONCAT('赵销售客户-', n, '号公司'), CONCAT('联系', n), CONCAT('138', 30000000 + n),
       CASE n % 5 WHEN 0 THEN '通信' WHEN 1 THEN '软件' WHEN 2 THEN '制造' WHEN 3 THEN '金融' ELSE '医疗' END,
       CASE n % 5 WHEN 0 THEN '展会' WHEN 1 THEN 'Facebook' WHEN 2 THEN 'LinkedIn' WHEN 3 THEN '电话' ELSE '其他' END,
       CASE n % 4 WHEN 0 THEN 'B' WHEN 1 THEN 'C' WHEN 2 THEN 'C' ELSE 'D' END,
       @sales_zhao_id,
       1,
       DATE_SUB(NOW(), INTERVAL (n % 10) DAY),
       DATE_SUB(NOW(), INTERVAL (n + 10) DAY)
FROM (
  SELECT ones.n + tens.n * 10 + 1 as n
  FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) ones,
       (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) tens
  WHERE ones.n + tens.n * 10 + 1 <= 25
) nums;

-- 陈销售：16个客户，1个客户从未跟进且已超15天（灯饰公司，最后跟进为NULL且创建>45天前）
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time) VALUES
('厦门市思明区软件外包公司', '金经理', '13800138070', '软件外包', 'LinkedIn', 'B', @sales_chen_id, 1, DATE_SUB(NOW(), INTERVAL 17 DAY), DATE_SUB(NOW(), INTERVAL 45 DAY)),
('福州市马尾区电子制造厂', '魏工', '13800138071', '电子制造', '电话', 'C', @sales_chen_id, 1, NULL, DATE_SUB(NOW(), INTERVAL 50 DAY)),
('泉州市石狮服装制造厂', '陶总', '13800138072', '服装制造', '展会', 'B', @sales_chen_id, 2, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 60 DAY));

-- 批量生成陈销售其余13个客户
INSERT INTO crm_customer (company_name, contact_name, phone, industry, source, level, owner_id, status, last_follow_time, create_time)
SELECT CONCAT('陈销售客户-', n, '号公司'), CONCAT('联系', n), CONCAT('138', 40000000 + n),
       CASE n % 5 WHEN 0 THEN '电子' WHEN 1 THEN '服装' WHEN 2 THEN '机械' WHEN 3 THEN '化工' ELSE '物流' END,
       CASE n % 4 WHEN 0 THEN '展会' WHEN 1 THEN 'Facebook' WHEN 2 THEN '转介绍' ELSE '其他' END,
       'C',
       @sales_chen_id, 1,
       CASE WHEN n = 7 THEN NULL ELSE DATE_SUB(NOW(), INTERVAL (n % 7) DAY) END,
       DATE_SUB(NOW(), INTERVAL (n + 30) DAY)
FROM (
  SELECT ones.n + tens.n * 10 + 1 as n
  FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) ones,
       (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) tens
  WHERE ones.n + tens.n * 10 + 1 <= 13
) nums;

-- ========== 3. 跟进记录（部分客户） ==========

-- 王销售的5条跟进记录
INSERT INTO crm_follow_up (customer_id, follow_type, content, next_time, create_by, create_time) VALUES
((SELECT id FROM crm_customer WHERE company_name = '深圳华科科技有限公司'), '电话', '赵总表示对UPS产品很感兴趣，已发送产品手册，约下周面谈', DATE_ADD(NOW(), INTERVAL 5 DAY), @sales_wang_id, DATE_SUB(NOW(), INTERVAL 2 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '广州明源电子有限公司'), '微信', '钱经理需要100台UPS的报价，已转报价部门处理', DATE_ADD(NOW(), INTERVAL 3 DAY), @sales_wang_id, DATE_SUB(NOW(), INTERVAL 5 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '惠州TCL配套供应商'), '拜访', '到现场考察了生产线，评估了负载需求，初步方案已提交', DATE_ADD(NOW(), INTERVAL 7 DAY), @sales_wang_id, DATE_SUB(NOW(), INTERVAL 3 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '珠海航宇通讯技术公司'), '电话', '孙工表示项目还在立项阶段，预计下月启动招标', DATE_ADD(NOW(), INTERVAL 20 DAY), @sales_wang_id, DATE_SUB(NOW(), INTERVAL 20 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '佛山顺德电器制造厂'), '邮件', '已发送合作方案和报价单，等待内部审批', DATE_ADD(NOW(), INTERVAL 7 DAY), @sales_wang_id, DATE_SUB(NOW(), INTERVAL 18 DAY));

-- 李销售的3条跟进记录
INSERT INTO crm_follow_up (customer_id, follow_type, content, next_time, create_by, create_time) VALUES
((SELECT id FROM crm_customer WHERE company_name = '北京中关村软件科技公司'), '拜访', '何总对我们的机房解决方案非常满意，基本确定合作', DATE_ADD(NOW(), INTERVAL 3 DAY), @sales_li_id, DATE_SUB(NOW(), INTERVAL 1 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '上海浦东集成电路设计公司'), '电话', '合同条款已确认，下周可以签约', DATE_ADD(NOW(), INTERVAL 5 DAY), @sales_li_id, DATE_SUB(NOW(), INTERVAL 2 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '杭州西湖区互联网公司'), '微信', '施总监希望增加售后服务的条款，已转法务审核', DATE_ADD(NOW(), INTERVAL 2 DAY), @sales_li_id, DATE_SUB(NOW(), INTERVAL 3 DAY));

-- ========== 4. 商机数据 ==========

-- 王销售：8个活跃商机
INSERT INTO crm_opportunity (customer_id, name, expected_amount, expected_date, stage, win_rate, owner_id, create_time) VALUES
((SELECT id FROM crm_customer WHERE company_name = '深圳华科科技有限公司'), '华科UPS采购项目', 500000, DATE_ADD(NOW(), INTERVAL 30 DAY), 3, 70, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 15 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '广州明源电子有限公司'), '明源电子机房改造', 300000, DATE_ADD(NOW(), INTERVAL 20 DAY), 2, 50, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 10 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '珠海航宇通讯技术公司'), '航宇通讯基站电源', 800000, DATE_ADD(NOW(), INTERVAL 60 DAY), 1, 30, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 20 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '惠州TCL配套供应商'), 'TCL配套工厂UPS升级', 200000, DATE_ADD(NOW(), INTERVAL 15 DAY), 4, 85, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 15 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '佛山顺德电器制造厂'), '顺德电器新厂区配电', 600000, DATE_ADD(NOW(), INTERVAL 45 DAY), 2, 40, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 15 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '中山市灯饰有限公司'), '灯饰厂电池采购', 150000, DATE_ADD(NOW(), INTERVAL 25 DAY), 2, 55, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 10 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '东莞五金精密加工厂'), '精密加工UPS采购', 80000, DATE_ADD(NOW(), INTERVAL 15 DAY), 3, 75, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 10 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '汕头市澄海玩具厂'), '澄海玩具厂电源改造', 350000, DATE_ADD(NOW(), INTERVAL 30 DAY), 1, 25, @sales_wang_id, DATE_SUB(NOW(), INTERVAL 10 DAY));

-- 李销售：5个活跃商机
INSERT INTO crm_opportunity (customer_id, name, expected_amount, expected_date, stage, win_rate, owner_id, create_time) VALUES
((SELECT id FROM crm_customer WHERE company_name = '北京中关村软件科技公司'), '中关村数据中心项目', 1200000, DATE_ADD(NOW(), INTERVAL 25 DAY), 4, 90, @sales_li_id, DATE_SUB(NOW(), INTERVAL 20 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '上海浦东集成电路设计公司'), '浦东IC设计中心UPS', 450000, DATE_ADD(NOW(), INTERVAL 10 DAY), 5, 100, @sales_li_id, DATE_SUB(NOW(), INTERVAL 25 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '杭州西湖区互联网公司'), '西湖互联网机房扩建', 350000, DATE_ADD(NOW(), INTERVAL 15 DAY), 3, 65, @sales_li_id, DATE_SUB(NOW(), INTERVAL 15 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '成都高新区游戏公司'), '高新区游戏公司UPS采购', 200000, DATE_ADD(NOW(), INTERVAL 20 DAY), 2, 50, @sales_li_id, DATE_SUB(NOW(), INTERVAL 10 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '重庆市渝中区金融科技公司'), '重庆金融科技灾备中心', 280000, DATE_ADD(NOW(), INTERVAL 30 DAY), 2, 45, @sales_li_id, DATE_SUB(NOW(), INTERVAL 10 DAY));

-- 赵销售：3个活跃商机
INSERT INTO crm_opportunity (customer_id, name, expected_amount, expected_date, stage, win_rate, owner_id, create_time) VALUES
((SELECT id FROM crm_customer WHERE company_name = '南京雨花台区大数据公司'), '南京大数据中心配电', 700000, DATE_ADD(NOW(), INTERVAL 40 DAY), 1, 30, @sales_zhao_id, DATE_SUB(NOW(), INTERVAL 10 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '武汉光谷通信技术公司'), '光谷通信UPS改造', 220000, DATE_ADD(NOW(), INTERVAL 30 DAY), 2, 45, @sales_zhao_id, DATE_SUB(NOW(), INTERVAL 10 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '西安高新区半导体公司'), '西安半导体净化车间电源', 550000, DATE_ADD(NOW(), INTERVAL 60 DAY), 1, 25, @sales_zhao_id, DATE_SUB(NOW(), INTERVAL 10 DAY));

-- 陈销售：0个商机（需跟进）

-- ========== 5. 逾期提醒数据（模拟今日已生成） ==========

-- 为超15天未跟进的客户生成今日提醒
INSERT IGNORE INTO crm_follow_up_reminder (customer_id, owner_id, manager_id, reminder_type, reminder_date)
SELECT c.id, c.owner_id, u.manager_id, 'overdue', CURDATE()
FROM crm_customer c
LEFT JOIN sys_user u ON c.owner_id = u.id
WHERE c.status NOT IN (2, 3) AND c.status != 0
  AND c.owner_id IS NOT NULL
  AND (c.last_follow_time IS NULL OR c.last_follow_time < DATE_SUB(NOW(), INTERVAL 15 DAY))
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up_reminder r
    WHERE r.customer_id = c.id AND r.reminder_date = CURDATE()
  );

-- ========== 6. 几条分配日志（历史） ==========

INSERT INTO crm_assign_log (customer_id, from_user_id, to_user_id, operator_id, remark, create_time) VALUES
((SELECT id FROM crm_customer WHERE company_name = '深圳华科科技有限公司'), NULL, @sales_wang_id, @manager_id, '初始分配', DATE_SUB(NOW(), INTERVAL 60 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '北京中关村软件科技公司'), @sales_wang_id, @sales_li_id, @manager_id, '王销售负责区域调整', DATE_SUB(NOW(), INTERVAL 40 DAY)),
((SELECT id FROM crm_customer WHERE company_name = '南京雨花台区大数据公司'), NULL, @sales_zhao_id, @boss_id, '新客户直接分配给赵销售', DATE_SUB(NOW(), INTERVAL 20 DAY));

-- ========== 7. 验证查询 ==========
SELECT '========== 测试数据生成完毕 ==========' AS result;
SELECT '用户' AS type, COUNT(*) AS cnt FROM sys_user WHERE role_id IN (@boss_role_id, @manager_role_id, @sales_role_id) UNION ALL
SELECT '客户', COUNT(*) FROM crm_customer WHERE status != 0 UNION ALL
SELECT '跟进记录', COUNT(*) FROM crm_follow_up UNION ALL
SELECT '商机', COUNT(*) FROM crm_opportunity UNION ALL
SELECT '今日提醒', COUNT(*) FROM crm_follow_up_reminder WHERE reminder_date = CURDATE() UNION ALL
SELECT '分配日志', COUNT(*) FROM crm_assign_log;

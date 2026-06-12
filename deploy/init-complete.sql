-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: huakey_crm
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `crm_ai_suggestion`
--

DROP TABLE IF EXISTS `crm_ai_suggestion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_ai_suggestion` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('customer','opportunity','pricing','follow_up') COLLATE utf8mb4_unicode_ci NOT NULL,
  `ref_id` int NOT NULL,
  `suggestion` text COLLATE utf8mb4_unicode_ci,
  `confidence` decimal(5,2) DEFAULT NULL,
  `is_accepted` tinyint DEFAULT '0',
  `feedback` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type_ref` (`type`,`ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_api_key`
--

DROP TABLE IF EXISTS `crm_api_key`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_api_key` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密钥名称',
  `api_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'API Key',
  `api_secret` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'API Secret',
  `permissions` text COLLATE utf8mb4_unicode_ci COMMENT '权限列表JSON',
  `rate_limit` int DEFAULT '100' COMMENT '每小时请求限制',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态',
  `last_used_at` datetime DEFAULT NULL COMMENT '最后使用时间',
  `expires_at` datetime DEFAULT NULL COMMENT '过期时间',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_key` (`api_key`),
  KEY `idx_ak_key` (`api_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API密钥';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_approval_record`
--

DROP TABLE IF EXISTS `crm_approval_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_approval_record` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workflow_id` int NOT NULL COMMENT '流程ID',
  `business_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型',
  `business_id` int NOT NULL COMMENT '业务ID',
  `step_id` int NOT NULL COMMENT '步骤ID',
  `step_order` int NOT NULL COMMENT '步骤顺序',
  `approver_id` int NOT NULL COMMENT '审批人ID',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '状态：pending/approved/rejected',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审批意见',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ar_approver` (`approver_id`,`status`),
  KEY `idx_ar_business` (`business_type`,`business_id`),
  KEY `fk_ar_workflow` (`workflow_id`),
  KEY `fk_ar_step` (`step_id`),
  KEY `idx_approval_approver` (`approver_id`,`status`),
  KEY `idx_approval_business` (`business_type`,`business_id`),
  CONSTRAINT `fk_ar_approver` FOREIGN KEY (`approver_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `fk_ar_step` FOREIGN KEY (`step_id`) REFERENCES `crm_approval_step` (`id`),
  CONSTRAINT `fk_ar_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `crm_approval_workflow` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_approval_step`
--

DROP TABLE IF EXISTS `crm_approval_step`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_approval_step` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workflow_id` int NOT NULL COMMENT '流程ID',
  `step_order` int NOT NULL COMMENT '步骤顺序',
  `step_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '步骤名称',
  `approver_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '审批人类型：user/role/manager',
  `approver_id` int DEFAULT NULL COMMENT '审批人ID',
  `is_required` tinyint(1) DEFAULT '1' COMMENT '是否必须审批',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_as_workflow` (`workflow_id`),
  CONSTRAINT `fk_as_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `crm_approval_workflow` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批步骤';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_approval_workflow`
--

DROP TABLE IF EXISTS `crm_approval_workflow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_approval_workflow` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '流程名称',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '流程类型：quote/contract/purchase/discount',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '流程描述',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态：1启用 0禁用',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_aw_type` (`type`),
  KEY `idx_aw_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批流程';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_assign_log`
--

DROP TABLE IF EXISTS `crm_assign_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_assign_log` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `from_user_id` int DEFAULT NULL COMMENT '原负责人ID',
  `to_user_id` int DEFAULT NULL,
  `operator_id` int DEFAULT NULL,
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '分配时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_assign_customer` (`customer_id`),
  KEY `idx_assign_operator` (`operator_id`),
  KEY `idx_assign_to_user` (`to_user_id`),
  KEY `idx_assign_create_time` (`create_time`),
  KEY `fk_assign_log_from_user` (`from_user_id`),
  CONSTRAINT `fk_assign_log_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assign_log_from_user` FOREIGN KEY (`from_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assign_log_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assign_log_to_user` FOREIGN KEY (`to_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1103 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户分配日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_assign_rule`
--

DROP TABLE IF EXISTS `crm_assign_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_assign_rule` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rule_name` varchar(100) NOT NULL COMMENT '规则名称',
  `assign_type` enum('round_robin','by_source','by_region') NOT NULL COMMENT '分配方式',
  `source_value` varchar(100) DEFAULT NULL COMMENT '来源值（by_source时使用）',
  `region_value` varchar(100) DEFAULT NULL COMMENT '区域值（by_region时使用）',
  `user_ids` json NOT NULL COMMENT '可分配的用户ID列表',
  `last_assigned_index` int DEFAULT '0' COMMENT '上次分配索引（轮询用）',
  `priority` int DEFAULT '0' COMMENT '优先级（越大越优先）',
  `is_active` tinyint DEFAULT '1' COMMENT '是否启用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_assign_rule_active` (`is_active`,`priority` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户自动分配规则';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_attachment`
--

DROP TABLE IF EXISTS `crm_attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_attachment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `business_type` varchar(50) NOT NULL COMMENT '关联业务类型: service_order, follow_up',
  `business_id` int NOT NULL COMMENT '关联业务ID',
  `file_name` varchar(255) NOT NULL COMMENT '原始文件名',
  `file_path` varchar(500) NOT NULL COMMENT '存储路径',
  `file_size` int DEFAULT '0' COMMENT '文件大小(字节)',
  `file_type` varchar(50) DEFAULT NULL COMMENT '文件MIME类型',
  `create_by` int DEFAULT NULL COMMENT '上传人',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_business` (`business_type`,`business_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通用附件表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_calendar_event`
--

DROP TABLE IF EXISTS `crm_calendar_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_calendar_event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标题',
  `event_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '类型：meeting/followup/task/reminder',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '描述',
  `start_time` datetime NOT NULL COMMENT '开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `all_day` tinyint(1) DEFAULT '0' COMMENT '全天事件',
  `location` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地点',
  `customer_id` int DEFAULT NULL COMMENT '关联客户',
  `contact_id` int DEFAULT NULL COMMENT '关联联系人',
  `related_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联类型',
  `related_id` int DEFAULT NULL COMMENT '关联ID',
  `attendees` text COLLATE utf8mb4_unicode_ci COMMENT '参与人ID列表JSON',
  `reminder_minutes` int DEFAULT '15' COMMENT '提前提醒分钟',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'confirmed' COMMENT '状态',
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#2563EB' COMMENT '显示颜色',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ce_time` (`start_time`,`end_time`),
  KEY `idx_ce_customer` (`customer_id`),
  KEY `idx_ce_type` (`event_type`),
  KEY `idx_calendar_time` (`start_time`,`end_time`),
  KEY `idx_calendar_create_by` (`create_by`,`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日程会议';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_commission_record`
--

DROP TABLE IF EXISTS `crm_commission_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_commission_record` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '销售人员ID',
  `rule_id` int DEFAULT NULL COMMENT '规则ID',
  `business_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型：contract/payment',
  `business_id` int NOT NULL COMMENT '业务ID',
  `base_amount` decimal(12,2) NOT NULL COMMENT '计算基数',
  `commission_rate` decimal(5,2) DEFAULT NULL COMMENT '佣金比例(%)',
  `commission_amount` decimal(12,2) NOT NULL COMMENT '佣金金额',
  `period` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '归属月份',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'calculated' COMMENT '状态：calculated/confirmed/paid',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ccr_biz` (`business_type`,`business_id`,`user_id`),
  KEY `idx_ccr_user` (`user_id`),
  KEY `idx_ccr_period` (`period`),
  KEY `idx_ccr_status` (`status`),
  KEY `idx_commission_user` (`user_id`,`period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='佣金记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_commission_rule`
--

DROP TABLE IF EXISTS `crm_commission_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_commission_rule` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称',
  `rule_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则类型：fixed/tiered/amount',
  `apply_to` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'contract' COMMENT '适用对象：contract/payment',
  `config` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则配置JSON',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cr_type` (`rule_type`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='佣金规则';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_competitor`
--

DROP TABLE IF EXISTS `crm_competitor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_competitor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '竞争对手名称',
  `website` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '官网',
  `industry` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '行业',
  `scale` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规模：large/medium/small/micro',
  `headquarters` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '总部所在地',
  `strengths` text COLLATE utf8mb4_unicode_ci COMMENT '优势JSON数组',
  `weaknesses` text COLLATE utf8mb4_unicode_ci COMMENT '劣势JSON数组',
  `products` text COLLATE utf8mb4_unicode_ci COMMENT '主要产品/服务',
  `price_range` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '价格区间',
  `market_share` decimal(5,2) DEFAULT NULL COMMENT '市场份额(%)',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '公司简介',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态：1活跃 0不再竞争',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comp_industry` (`industry`),
  KEY `idx_comp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞争对手';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_competitor_encounter`
--

DROP TABLE IF EXISTS `crm_competitor_encounter`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_competitor_encounter` (
  `id` int NOT NULL AUTO_INCREMENT,
  `competitor_id` int NOT NULL COMMENT '竞争对手ID',
  `customer_id` int DEFAULT NULL COMMENT '关联客户',
  `opportunity_id` int DEFAULT NULL COMMENT '关联商机',
  `encounter_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交锋类型：lost/won/competing/encountered',
  `our_price` decimal(12,2) DEFAULT NULL COMMENT '我方报价',
  `their_price` decimal(12,2) DEFAULT NULL COMMENT '对方报价',
  `win_reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '赢单/丢单原因',
  `our_advantage` text COLLATE utf8mb4_unicode_ci COMMENT '我方优势体现',
  `their_advantage` text COLLATE utf8mb4_unicode_ci COMMENT '对方优势体现',
  `lesson_learned` text COLLATE utf8mb4_unicode_ci COMMENT '经验教训',
  `encounter_date` date DEFAULT NULL COMMENT '交锋日期',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ce_competitor` (`competitor_id`),
  KEY `idx_ce_customer` (`customer_id`),
  KEY `idx_ce_type` (`encounter_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞品交锋记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_competitor_intel`
--

DROP TABLE IF EXISTS `crm_competitor_intel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_competitor_intel` (
  `id` int NOT NULL AUTO_INCREMENT,
  `competitor_id` int NOT NULL COMMENT '竞争对手ID',
  `intel_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '情报类型：product/pricing/strategy/partnership/market',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '情报标题',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '情报内容',
  `source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '信息来源',
  `importance` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'medium' COMMENT '重要程度：high/medium/low',
  `verified` tinyint(1) DEFAULT '0' COMMENT '是否已验证',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ci_competitor` (`competitor_id`),
  KEY `idx_ci_type` (`intel_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞品情报';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_contact`
--

DROP TABLE IF EXISTS `crm_contact`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_contact` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '姓名',
  `position` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职位',
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `wechat` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '微信',
  `is_decision` tinyint DEFAULT '0' COMMENT '是否决策人（1是0否）',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_contact_customer_id` (`customer_id`),
  KEY `idx_contact_name` (`name`),
  KEY `idx_contact_phone` (`phone`),
  KEY `idx_contact_is_decision` (`is_decision`),
  KEY `idx_contact_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_contact_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_contact_is_decision` CHECK ((`is_decision` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='联系人表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_contract`
--

DROP TABLE IF EXISTS `crm_contract`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_contract` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contract_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int NOT NULL,
  `opportunity_id` int DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT '0.00',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'CNY' COMMENT '合同货币',
  `exchange_rate` decimal(10,4) DEFAULT '1.0000' COMMENT '使用汇率',
  `sign_date` date DEFAULT NULL,
  `delivery_date` date DEFAULT NULL,
  `payment_terms` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` tinyint DEFAULT '1',
  `approval_status` tinyint NOT NULL DEFAULT '2' COMMENT '审批状态: 1=待审批, 2=已通过, 3=已拒绝',
  `approver_id` int DEFAULT NULL COMMENT '审批人ID',
  `approval_remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审批备注（拒绝原因）',
  `remark` text COLLATE utf8mb4_unicode_ci,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `contract_no` (`contract_no`),
  KEY `fk_contract_opportunity` (`opportunity_id`),
  KEY `fk_contract_create_by` (`create_by`),
  KEY `idx_contract_no` (`contract_no`),
  KEY `idx_contract_customer` (`customer_id`),
  KEY `idx_contract_status` (`status`),
  KEY `idx_contract_create_time` (`create_time`),
  KEY `idx_contract_deleted_at` (`deleted_at`),
  KEY `idx_contract_status_ctime` (`status`,`create_time`),
  KEY `idx_contract_del_status_ctime` (`deleted_at`,`status`,`create_time`),
  KEY `idx_contract_approval` (`approval_status`),
  KEY `idx_contract_sign_date` (`sign_date`),
  CONSTRAINT `fk_contract_create_by` FOREIGN KEY (`create_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_opportunity` FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunity` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合同表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_contract_template`
--

DROP TABLE IF EXISTS `crm_contract_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_contract_template` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板名称',
  `amount` decimal(15,2) DEFAULT '0.00' COMMENT '默认金额',
  `payment_terms` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '付款条款',
  `delivery_days` int DEFAULT '30' COMMENT '默认交付天数',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT '默认备注',
  `sort` int DEFAULT '0' COMMENT '排序',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合同模板表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_currency`
--

DROP TABLE IF EXISTS `crm_currency`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_currency` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(10) NOT NULL COMMENT '货币代码：CNY/USD/EUR/INR/GBP/AED/THB',
  `name` varchar(50) NOT NULL COMMENT '货币名称',
  `symbol` varchar(10) NOT NULL COMMENT '符号：¥/$/€/₹',
  `exchange_rate` decimal(10,4) DEFAULT '1.0000' COMMENT '对人民币汇率',
  `is_default` tinyint(1) DEFAULT '0' COMMENT '是否默认货币',
  `status` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='货币配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_customer`
--

DROP TABLE IF EXISTS `crm_customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_customer` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `company_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '公司名称',
  `contact_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系人姓名',
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地址',
  `industry` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '所属行业',
  `source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户来源（展会/网络/转介绍/电话/其他）',
  `level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'C' COMMENT '客户等级（A/B/C/D）',
  `lead_level` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '意向等级：高/中/低',
  `follow_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '跟进状态：初次联系/需求确认/报价中/已流失',
  `converted_at` datetime DEFAULT NULL COMMENT '转化为客户的时间',
  `owner_id` int DEFAULT NULL COMMENT '负责销售ID',
  `status` tinyint DEFAULT '5' COMMENT '状态: 0=删除, 1=潜客, 2=正式客户, 3=流失, 5=线索',
  `customer_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'prospect' COMMENT '对象类型: prospect/customer',
  `lifecycle_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'new' COMMENT '生命周期: new/nurturing/intent/active/lost/inactive',
  `score` int DEFAULT '0' COMMENT '客户评分',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  `pool_status` tinyint DEFAULT '0' COMMENT '0=归属销售 1=在公海',
  `pool_type` enum('public','private') COLLATE utf8mb4_unicode_ci DEFAULT 'public' COMMENT '池类型',
  `protect_until` datetime DEFAULT NULL COMMENT '保护期截止时间',
  `last_follow_time` datetime DEFAULT NULL COMMENT '最后跟进时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_phone` (`company_name`,`phone`),
  KEY `idx_customer_company_name` (`company_name`),
  KEY `idx_customer_phone` (`phone`),
  KEY `idx_customer_industry` (`industry`),
  KEY `idx_customer_source` (`source`),
  KEY `idx_customer_level` (`level`),
  KEY `idx_customer_owner_id` (`owner_id`),
  KEY `idx_customer_status` (`status`),
  KEY `idx_customer_create_time` (`create_time`),
  KEY `idx_pool_status` (`pool_status`),
  KEY `idx_customer_deleted_at` (`deleted_at`),
  KEY `idx_customer_pool_type` (`pool_type`),
  KEY `idx_customer_type` (`customer_type`),
  KEY `idx_lifecycle_status` (`lifecycle_status`),
  KEY `idx_customer_pool_status` (`pool_status`),
  KEY `idx_customer_protect_until` (`protect_until`),
  KEY `idx_customer_last_follow` (`last_follow_time`),
  KEY `idx_cust_owner_status_ctime` (`owner_id`,`status`,`create_time`),
  KEY `idx_cust_status_owner_follow` (`status`,`owner_id`,`last_follow_time`),
  KEY `idx_customer_status_lifecycle` (`status`,`lifecycle_status`),
  KEY `idx_customer_owner` (`owner_id`,`deleted_at`),
  CONSTRAINT `fk_customer_owner` FOREIGN KEY (`owner_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=635 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_customer_score_log`
--

DROP TABLE IF EXISTS `crm_customer_score_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_customer_score_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `rule_id` int DEFAULT NULL COMMENT '触发规则',
  `score` int NOT NULL COMMENT '分数变化',
  `total_score` int NOT NULL COMMENT '总分',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_csl_customer` (`customer_id`),
  KEY `idx_csl_rule` (`rule_id`),
  CONSTRAINT `fk_csl_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_csl_rule` FOREIGN KEY (`rule_id`) REFERENCES `crm_score_rule` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户评分记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_customer_supplier_relation`
--

DROP TABLE IF EXISTS `crm_customer_supplier_relation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_customer_supplier_relation` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `supplier_id` int NOT NULL COMMENT '供应商ID',
  `relationship_type` enum('主要','次要','禁用') COLLATE utf8mb4_unicode_ci DEFAULT '主要' COMMENT '关联类型',
  `effective_date` date DEFAULT NULL COMMENT '生效日期',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_by` int DEFAULT NULL COMMENT '创建人ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_supplier` (`customer_id`,`supplier_id`),
  KEY `idx_csr_customer` (`customer_id`),
  KEY `idx_csr_supplier` (`supplier_id`),
  CONSTRAINT `fk_csr_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_csr_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `crm_supplier` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户供应商关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_customer_tag`
--

DROP TABLE IF EXISTS `crm_customer_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_customer_tag` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `tag_id` int NOT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_tag` (`customer_id`,`tag_id`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_tag` (`tag_id`),
  CONSTRAINT `fk_ct_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ct_tag` FOREIGN KEY (`tag_id`) REFERENCES `crm_tag` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户标签关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_email`
--

DROP TABLE IF EXISTS `crm_email`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_email` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL COMMENT '邮件账号ID',
  `message_id` varchar(200) DEFAULT NULL COMMENT '邮件Message-ID（用于去重）',
  `direction` varchar(10) NOT NULL COMMENT '方向：in收件/out发件',
  `from_address` varchar(200) DEFAULT NULL COMMENT '发件人',
  `to_addresses` text COMMENT '收件人（JSON数组）',
  `cc_addresses` text COMMENT '抄送（JSON数组）',
  `subject` varchar(500) DEFAULT NULL COMMENT '邮件主题',
  `body_text` text COMMENT '纯文本内容',
  `body_html` text COMMENT 'HTML内容',
  `has_attachments` tinyint(1) DEFAULT '0' COMMENT '有附件',
  `attachment_count` int DEFAULT '0',
  `customer_id` int DEFAULT NULL COMMENT '关联客户',
  `contact_id` int DEFAULT NULL COMMENT '关联联系人',
  `is_read` tinyint(1) DEFAULT '0' COMMENT '是否已读',
  `is_starred` tinyint(1) DEFAULT '0' COMMENT '星标',
  `folder` varchar(20) DEFAULT 'inbox' COMMENT '文件夹：inbox/sent/draft/trash',
  `sent_at` timestamp NULL DEFAULT NULL COMMENT '发送时间',
  `received_at` timestamp NULL DEFAULT NULL COMMENT '接收时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_message_id` (`message_id`),
  KEY `idx_email_account` (`account_id`),
  KEY `idx_email_customer` (`customer_id`),
  KEY `idx_email_contact` (`contact_id`),
  KEY `idx_email_folder` (`folder`),
  KEY `idx_email_message_id` (`message_id`),
  KEY `idx_email_direction` (`direction`),
  CONSTRAINT `crm_email_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `crm_email_account` (`id`),
  CONSTRAINT `crm_email_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`),
  CONSTRAINT `crm_email_ibfk_3` FOREIGN KEY (`contact_id`) REFERENCES `crm_contact` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_email_account`
--

DROP TABLE IF EXISTS `crm_email_account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_email_account` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '关联用户',
  `email` varchar(100) NOT NULL COMMENT '邮箱地址',
  `display_name` varchar(50) DEFAULT NULL COMMENT '发件人显示名称',
  `imap_host` varchar(100) DEFAULT NULL COMMENT 'IMAP服务器',
  `imap_port` int DEFAULT '993' COMMENT 'IMAP端口',
  `smtp_host` varchar(100) DEFAULT NULL COMMENT 'SMTP服务器',
  `smtp_port` int DEFAULT '587' COMMENT 'SMTP端口',
  `password_encrypted` varchar(200) DEFAULT NULL COMMENT '加密存储的密码/授权码',
  `use_ssl` tinyint(1) DEFAULT '1',
  `sync_status` varchar(20) DEFAULT 'pending' COMMENT '同步状态：pending/syncing/active/error',
  `last_sync_at` timestamp NULL DEFAULT NULL COMMENT '上次同步时间',
  `status` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ea_user` (`user_id`),
  CONSTRAINT `crm_email_account_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件账号配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_email_attachment`
--

DROP TABLE IF EXISTS `crm_email_attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_email_attachment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email_id` int NOT NULL,
  `filename` varchar(200) NOT NULL COMMENT '文件名',
  `file_path` varchar(500) DEFAULT NULL COMMENT '存储路径',
  `file_size` int DEFAULT NULL COMMENT '文件大小（字节）',
  `mime_type` varchar(100) DEFAULT NULL COMMENT 'MIME类型',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ea_email` (`email_id`),
  CONSTRAINT `crm_email_attachment_ibfk_1` FOREIGN KEY (`email_id`) REFERENCES `crm_email` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件附件表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_employee_profile`
--

DROP TABLE IF EXISTS `crm_employee_profile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_employee_profile` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '关联sys_user.id',
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '性别',
  `birth_date` date DEFAULT NULL COMMENT '出生日期',
  `id_card` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '身份证号',
  `hire_date` date DEFAULT NULL COMMENT '入职日期',
  `leave_date` date DEFAULT NULL COMMENT '离职日期',
  `position` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职位',
  `employment_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'fulltime' COMMENT '用工类型',
  `contract_start` date DEFAULT NULL COMMENT '合同起始日',
  `contract_end` date DEFAULT NULL COMMENT '合同到期日',
  `salary_base` decimal(10,2) DEFAULT NULL COMMENT '基本工资',
  `salary_commission_rate` decimal(5,2) DEFAULT '0.00' COMMENT '提成比例(%)',
  `bank_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '开户银行',
  `bank_account` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行账号',
  `emergency_contact` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '紧急联系人',
  `emergency_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '紧急联系电话',
  `address` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '家庭住址',
  `education` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '学历',
  `university` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '毕业院校',
  `major` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '专业',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `fk_ep_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工档案扩展';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_follow_plan`
--

DROP TABLE IF EXISTS `crm_follow_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_follow_plan` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `contact_id` int DEFAULT NULL COMMENT '联系人ID',
  `plan_time` datetime NOT NULL COMMENT '计划跟进时间',
  `plan_content` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计划内容',
  `follow_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '电话' COMMENT '跟进方式',
  `status` enum('pending','completed','overdue') COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '状态',
  `create_by` int DEFAULT NULL COMMENT '创建人ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_fp_customer` (`customer_id`),
  KEY `idx_fp_plan_time` (`plan_time`),
  KEY `idx_fp_status` (`status`),
  KEY `idx_fp_create_by` (`create_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进计划表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_follow_up`
--

DROP TABLE IF EXISTS `crm_follow_up`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_follow_up` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `contact_id` int DEFAULT NULL COMMENT '联系人ID',
  `follow_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '电话' COMMENT '跟进方式',
  `content` text COLLATE utf8mb4_unicode_ci COMMENT '跟进内容',
  `next_time` datetime DEFAULT NULL COMMENT '下次提醒时间',
  `next_content` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '下次计划',
  `create_by` int DEFAULT NULL COMMENT '创建人ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `fk_follow_contact` (`contact_id`),
  KEY `idx_follow_customer` (`customer_id`),
  KEY `idx_follow_create_by` (`create_by`),
  KEY `idx_follow_next_time` (`next_time`),
  KEY `idx_follow_create_time` (`create_time`),
  KEY `idx_follow_deleted_at` (`deleted_at`),
  KEY `idx_follow_cust_del_time` (`customer_id`,`deleted_at`,`create_time`),
  KEY `idx_followup_customer_time` (`customer_id`,`create_time` DESC),
  KEY `idx_followup_next_time` (`next_time`),
  CONSTRAINT `fk_follow_contact` FOREIGN KEY (`contact_id`) REFERENCES `crm_contact` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_follow_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_follow_user` FOREIGN KEY (`create_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_follow_type` CHECK ((`follow_type` in (_utf8mb4'电话',_utf8mb4'拜访',_utf8mb4'微信',_utf8mb4'邮件',_utf8mb4'其他')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_follow_up_reminder`
--

DROP TABLE IF EXISTS `crm_follow_up_reminder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_follow_up_reminder` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `owner_id` int DEFAULT NULL COMMENT '客户负责人ID',
  `manager_id` int DEFAULT NULL COMMENT '负责人上级ID',
  `follow_plan_id` int DEFAULT NULL COMMENT '关联跟进计划ID',
  `reminder_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'overdue' COMMENT '提醒类型: overdue=逾期未跟进',
  `reminder_date` date NOT NULL COMMENT '提醒日期',
  `is_read` tinyint DEFAULT '0' COMMENT '是否已读(0未读/1已读)',
  `is_dismissed` tinyint DEFAULT '0' COMMENT '是否已处理(0未处理/1已处理)',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_date` (`customer_id`,`reminder_date`),
  KEY `idx_reminder_owner` (`owner_id`),
  KEY `idx_reminder_is_read` (`is_read`),
  KEY `idx_reminder_create_time` (`create_time`),
  KEY `idx_reminder_follow_plan` (`follow_plan_id`),
  KEY `fk_reminder_manager` (`manager_id`),
  CONSTRAINT `fk_reminder_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reminder_manager` FOREIGN KEY (`manager_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reminder_owner` FOREIGN KEY (`owner_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=399 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进提醒表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_followup_template`
--

DROP TABLE IF EXISTS `crm_followup_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_followup_template` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板名称',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'general' COMMENT '类型：first首次/quote报价/deal成交/general通用',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板内容',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ft_type` (`type`),
  KEY `idx_ft_creator` (`create_by`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进模板';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_invoice`
--

DROP TABLE IF EXISTS `crm_invoice`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_invoice` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `invoice_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '发票编号',
  `contract_id` int NOT NULL COMMENT '合同ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `type` tinyint DEFAULT '1' COMMENT '发票类型：1=增值税普票 2=增值税专票 3=电子发票',
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT '发票金额',
  `tax_rate` decimal(5,2) DEFAULT NULL COMMENT '税率(%)',
  `tax_amount` decimal(15,2) DEFAULT NULL COMMENT '税额',
  `invoice_date` date DEFAULT NULL COMMENT '开票日期',
  `status` tinyint DEFAULT '1' COMMENT '状态：1=待开票 2=已开票 3=已邮寄 4=已作废',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_by` int DEFAULT NULL COMMENT '创建人ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_invoice_no` (`invoice_no`),
  KEY `idx_contract` (`contract_id`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发票表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_knowledge_document`
--

DROP TABLE IF EXISTS `crm_knowledge_document`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_knowledge_document` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文档名称',
  `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文档类型：contract/quote/general',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文档说明',
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件路径',
  `file_size` int DEFAULT NULL COMMENT '文件大小(字节)',
  `file_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件类型',
  `download_count` int DEFAULT '0' COMMENT '下载次数',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kd_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档模板';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_knowledge_faq`
--

DROP TABLE IF EXISTS `crm_knowledge_faq`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_knowledge_faq` (
  `id` int NOT NULL AUTO_INCREMENT,
  `question` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '问题',
  `answer` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '答案',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '分类',
  `view_count` int DEFAULT '0' COMMENT '查看次数',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kf_category` (`category`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FAQ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_knowledge_product`
--

DROP TABLE IF EXISTS `crm_knowledge_product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_knowledge_product` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品分类',
  `model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品型号',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '产品描述',
  `specs` text COLLATE utf8mb4_unicode_ci COMMENT '产品参数(JSON)',
  `price` decimal(12,2) DEFAULT NULL COMMENT '参考价格',
  `images` text COLLATE utf8mb4_unicode_ci COMMENT '产品图片(JSON数组)',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态：1启用 0停用',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kp_category` (`category`),
  KEY `idx_kp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品知识库';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_knowledge_script`
--

DROP TABLE IF EXISTS `crm_knowledge_script`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_knowledge_script` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '话术标题',
  `scene` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '适用场景',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '话术内容',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `usage_count` int DEFAULT '0' COMMENT '使用次数',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ks_scene` (`scene`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售话术';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_notification`
--

DROP TABLE IF EXISTS `crm_notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_notification` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '通知类型: quote_approval, contract_approval, remind, ...',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '通知标题',
  `content` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '通知内容',
  `business_type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务类型: quote, contract, ...',
  `business_id` int DEFAULT NULL COMMENT '业务记录ID',
  `from_user_id` int DEFAULT NULL COMMENT '触发人ID',
  `to_user_id` int DEFAULT NULL COMMENT '接收人ID（NULL表示角色组广播）',
  `to_role_id` int DEFAULT NULL COMMENT '接收角色ID（当to_user_id为空时按角色广播）',
  `is_read` tinyint DEFAULT '0' COMMENT '是否已读(0未读/1已读)',
  `is_dismissed` tinyint DEFAULT '0' COMMENT '是否已处理(0未处理/1已处理)',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_to_user` (`to_user_id`,`is_read`),
  KEY `idx_to_role` (`to_role_id`,`is_read`),
  KEY `idx_business` (`business_type`,`business_id`),
  KEY `idx_type` (`type`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统通知表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_opportunity`
--

DROP TABLE IF EXISTS `crm_opportunity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_opportunity` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expected_amount` decimal(15,2) DEFAULT '0.00',
  `expected_date` date DEFAULT NULL,
  `stage` tinyint DEFAULT '1',
  `win_rate` tinyint DEFAULT '10',
  `remark` text COLLATE utf8mb4_unicode_ci,
  `owner_id` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_opp_customer` (`customer_id`),
  KEY `idx_opp_owner` (`owner_id`),
  KEY `idx_opp_stage` (`stage`),
  KEY `idx_opp_expected_date` (`expected_date`),
  KEY `idx_opp_deleted_at` (`deleted_at`),
  KEY `idx_opp_owner_stage_ctime` (`owner_id`,`stage`,`create_time`),
  KEY `idx_opp_del_stage_amount` (`deleted_at`,`stage`,`expected_amount`),
  CONSTRAINT `fk_opp_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_opp_owner` FOREIGN KEY (`owner_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_opp_stage` CHECK ((`stage` between 1 and 6)),
  CONSTRAINT `chk_opp_win_rate` CHECK ((`win_rate` between 0 and 100))
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_opportunity_stage_log`
--

DROP TABLE IF EXISTS `crm_opportunity_stage_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_opportunity_stage_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `opportunity_id` int NOT NULL COMMENT '商机ID',
  `from_stage` int DEFAULT NULL COMMENT '原阶段（NULL表示初始创建）',
  `to_stage` int NOT NULL COMMENT '新阶段',
  `change_reason` varchar(500) DEFAULT NULL COMMENT '变更原因',
  `changed_by` int DEFAULT NULL COMMENT '操作人ID',
  `changed_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
  PRIMARY KEY (`id`),
  KEY `idx_opportunity_id` (`opportunity_id`),
  KEY `idx_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商机阶段变更日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_payment`
--

DROP TABLE IF EXISTS `crm_payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_payment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contract_id` int NOT NULL,
  `plan_id` int DEFAULT NULL,
  `pay_date` date NOT NULL,
  `pay_amount` decimal(15,2) DEFAULT '0.00',
  `pay_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `fk_payment_plan` (`plan_id`),
  KEY `idx_payment_contract` (`contract_id`),
  KEY `idx_payment_date` (`pay_date`),
  KEY `idx_payment_deleted_at` (`deleted_at`),
  KEY `idx_payment_contract_del` (`contract_id`,`deleted_at`),
  CONSTRAINT `fk_payment_contract` FOREIGN KEY (`contract_id`) REFERENCES `crm_contract` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_plan` FOREIGN KEY (`plan_id`) REFERENCES `crm_payment_plan` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回款记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_payment_plan`
--

DROP TABLE IF EXISTS `crm_payment_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_payment_plan` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contract_id` int NOT NULL,
  `plan_date` date NOT NULL,
  `plan_amount` decimal(15,2) DEFAULT '0.00',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','partial','completed','overdue') COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '回款状态',
  `paid_amount` decimal(15,2) DEFAULT '0.00' COMMENT '已回金额',
  `overdue_days` int DEFAULT '0' COMMENT '逾期天数',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_payment_plan_contract` (`contract_id`),
  KEY `idx_payment_plan_date` (`plan_date`),
  KEY `idx_plan_contract` (`contract_id`),
  KEY `idx_plan_date` (`plan_date`),
  CONSTRAINT `fk_payment_plan_contract` FOREIGN KEY (`contract_id`) REFERENCES `crm_contract` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回款计划表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_payment_reminder`
--

DROP TABLE IF EXISTS `crm_payment_reminder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_payment_reminder` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contract_id` int NOT NULL COMMENT '合同ID',
  `plan_id` int DEFAULT NULL COMMENT '回款计划ID',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `remind_date` date NOT NULL COMMENT '提醒日期',
  `remind_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '提醒类型：upcoming/overdue/weekly',
  `remind_days` int DEFAULT NULL COMMENT '距到期天数',
  `amount` decimal(12,2) DEFAULT NULL COMMENT '应回款金额',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '状态：pending/acknowledged/sent',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pr_contract` (`contract_id`),
  KEY `idx_pr_customer` (`customer_id`),
  KEY `idx_pr_status` (`status`),
  KEY `idx_pr_date` (`remind_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回款提醒记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_pool_log`
--

DROP TABLE IF EXISTS `crm_pool_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_pool_log` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键',
  `customer_id` int NOT NULL COMMENT '客户ID',
  `action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作: release/claim/auto_release',
  `from_user_id` int DEFAULT NULL COMMENT '原负责人ID',
  `to_user_id` int DEFAULT NULL COMMENT '新负责人ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_action` (`action`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_pool_log_deleted_at` (`deleted_at`),
  KEY `fk_pool_log_from_user` (`from_user_id`),
  KEY `fk_pool_log_to_user` (`to_user_id`),
  CONSTRAINT `fk_pool_log_from_user` FOREIGN KEY (`from_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pool_log_to_user` FOREIGN KEY (`to_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户池操作记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_prediction_config`
--

DROP TABLE IF EXISTS `crm_prediction_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_prediction_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模型名称',
  `model_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模型类型：moving_avg/linear_reg/seasonal',
  `config` text COLLATE utf8mb4_unicode_ci COMMENT '模型参数JSON',
  `accuracy` decimal(5,2) DEFAULT NULL COMMENT '准确率',
  `last_run_at` datetime DEFAULT NULL,
  `status` tinyint(1) DEFAULT '1',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预测模型配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_product`
--

DROP TABLE IF EXISTS `crm_product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_product` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '件',
  `price` decimal(15,2) DEFAULT '0.00',
  `cost_price` decimal(15,2) DEFAULT '0.00',
  `stock` int DEFAULT '0',
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` tinyint DEFAULT '1',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_product_code` (`code`),
  KEY `idx_product_category` (`category`),
  KEY `idx_product_status` (`status`),
  KEY `idx_deleted_at` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_product_price`
--

DROP TABLE IF EXISTS `crm_product_price`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_product_price` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL COMMENT '产品ID',
  `price_type` varchar(20) NOT NULL COMMENT '价格类型：retail/wholesale/vip/custom',
  `customer_level` varchar(20) DEFAULT NULL COMMENT '适用客户等级：A/B/C',
  `unit_price` decimal(12,2) NOT NULL COMMENT '单价',
  `min_quantity` int DEFAULT '1' COMMENT '最小起订量',
  `currency` varchar(10) DEFAULT 'CNY' COMMENT '货币',
  `valid_from` date DEFAULT NULL COMMENT '生效日期',
  `valid_to` date DEFAULT NULL COMMENT '失效日期',
  `status` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pp_product` (`product_id`),
  KEY `idx_pp_type` (`price_type`),
  KEY `idx_pp_level` (`customer_level`),
  CONSTRAINT `crm_product_price_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `crm_product` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品价格表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_purchase_item`
--

DROP TABLE IF EXISTS `crm_purchase_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_purchase_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL COMMENT '采购单ID',
  `product_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `product_spec` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规格型号',
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '个' COMMENT '单位',
  `quantity` decimal(12,3) NOT NULL COMMENT '采购数量',
  `unit_price` decimal(12,4) NOT NULL COMMENT '单价',
  `discount_rate` decimal(5,2) DEFAULT '0.00' COMMENT '折扣率%',
  `discount_amount` decimal(15,2) DEFAULT '0.00' COMMENT '折扣金额',
  `amount` decimal(15,2) NOT NULL COMMENT '小计金额',
  `received_qty` decimal(12,3) DEFAULT '0.000' COMMENT '已收货数量',
  `quality_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '待检' COMMENT '质检状态：待检/合格/不合格',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_poi_order` (`order_id`),
  CONSTRAINT `fk_poi_order` FOREIGN KEY (`order_id`) REFERENCES `crm_purchase_order` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单明细表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_purchase_order`
--

DROP TABLE IF EXISTS `crm_purchase_order`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_purchase_order` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '采购单号 PO-YYMMDD-XXX',
  `supplier_id` int NOT NULL COMMENT '供应商ID',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '采购标题',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '常规' COMMENT '类型：常规/紧急/样品/返修',
  `expected_date` date DEFAULT NULL COMMENT '预计到货日期',
  `payment_terms` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '付款条款',
  `delivery_address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '交货地址',
  `remark` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `total_amount` decimal(15,2) DEFAULT '0.00' COMMENT '商品总金额(不含税)',
  `tax_rate` decimal(5,2) DEFAULT '13.00' COMMENT '税率%',
  `tax_amount` decimal(15,2) DEFAULT '0.00' COMMENT '税额',
  `total_with_tax` decimal(15,2) DEFAULT '0.00' COMMENT '含税总金额',
  `actual_date` date DEFAULT NULL COMMENT '实际到货日期',
  `owner_id` int DEFAULT NULL COMMENT '采购负责人ID',
  `create_by` int DEFAULT NULL COMMENT '创建人ID',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '草稿' COMMENT '状态：草稿/待审核/已确认/部分收货/已完成/已取消',
  `approval_status` tinyint NOT NULL DEFAULT '2' COMMENT '审批状态：0草稿 1待审批 2已通过 3已拒绝',
  `approver_id` int DEFAULT NULL COMMENT '审批人',
  `approval_remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审批备注',
  `approve_time` datetime DEFAULT NULL COMMENT '审批时间',
  `approveRemark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审批备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_po_no` (`order_no`),
  KEY `fk_po_owner` (`owner_id`),
  KEY `fk_po_create_by` (`create_by`),
  KEY `idx_po_supplier` (`supplier_id`),
  KEY `idx_po_status` (`status`),
  KEY `idx_po_create_time` (`create_time`),
  CONSTRAINT `fk_po_create_by` FOREIGN KEY (`create_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_po_owner` FOREIGN KEY (`owner_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_po_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `crm_supplier` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_purchase_payment`
--

DROP TABLE IF EXISTS `crm_purchase_payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_purchase_payment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL COMMENT '采购单ID',
  `amount` decimal(15,2) NOT NULL COMMENT '付款金额',
  `pay_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '付款方式',
  `pay_date` date DEFAULT NULL COMMENT '付款日期',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `payer_id` int DEFAULT NULL COMMENT '付款人ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `fk_pp_payer` (`payer_id`),
  KEY `idx_pp_order` (`order_id`),
  CONSTRAINT `fk_pp_order` FOREIGN KEY (`order_id`) REFERENCES `crm_purchase_order` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pp_payer` FOREIGN KEY (`payer_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购付款记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_purchase_plan`
--

DROP TABLE IF EXISTS `crm_purchase_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_purchase_plan` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计划编号',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计划名称',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'draft' COMMENT '状态',
  `total_amount` decimal(12,2) DEFAULT '0.00' COMMENT '计划总金额',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_by` int DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pp_status` (`status`),
  KEY `idx_pp_no` (`plan_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购计划';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_purchase_plan_item`
--

DROP TABLE IF EXISTS `crm_purchase_plan_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_purchase_plan_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL COMMENT '计划ID',
  `product_id` int NOT NULL COMMENT '产品ID',
  `supplier_id` int DEFAULT NULL COMMENT '建议供应商',
  `quantity` int NOT NULL COMMENT '计划数量',
  `unit_price` decimal(12,2) DEFAULT NULL COMMENT '预估单价',
  `amount` decimal(12,2) DEFAULT NULL COMMENT '预估金额',
  `reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购原因',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '状态',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ppi_plan` (`plan_id`),
  KEY `fk_ppi_product` (`product_id`),
  CONSTRAINT `fk_ppi_plan` FOREIGN KEY (`plan_id`) REFERENCES `crm_purchase_plan` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppi_product` FOREIGN KEY (`product_id`) REFERENCES `crm_product` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购计划明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_purchase_receipt`
--

DROP TABLE IF EXISTS `crm_purchase_receipt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_purchase_receipt` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL COMMENT '采购单ID',
  `item_id` int NOT NULL COMMENT '明细项ID',
  `receipt_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '收货单号 RCV-YYMMDD-XXX',
  `quantity` decimal(12,3) NOT NULL COMMENT '本次收货数量',
  `quality_check` tinyint DEFAULT '1' COMMENT '是否质检：0=免检 1=质检',
  `quality_result` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '待检' COMMENT '质检结果：合格/不合格/待检',
  `defect_desc` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '不良描述',
  `warehouse` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '入库仓库',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `operator_id` int DEFAULT NULL COMMENT '操作人ID',
  `receive_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '收货时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_pr_no` (`receipt_no`),
  KEY `fk_pr_operator` (`operator_id`),
  KEY `idx_pr_order` (`order_id`),
  KEY `idx_pr_item` (`item_id`),
  CONSTRAINT `fk_pr_item` FOREIGN KEY (`item_id`) REFERENCES `crm_purchase_item` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pr_operator` FOREIGN KEY (`operator_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_order` FOREIGN KEY (`order_id`) REFERENCES `crm_purchase_order` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购收货记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_quote`
--

DROP TABLE IF EXISTS `crm_quote`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_quote` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int NOT NULL,
  `opportunity_id` int DEFAULT NULL COMMENT '关联商机ID',
  `amount` decimal(15,2) DEFAULT '0.00',
  `discount` decimal(5,2) DEFAULT '0.00',
  `final_amount` decimal(15,2) DEFAULT '0.00',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'CNY' COMMENT '报价货币',
  `exchange_rate` decimal(10,4) DEFAULT '1.0000' COMMENT '使用汇率',
  `valid_days` int DEFAULT '30',
  `remark` text COLLATE utf8mb4_unicode_ci,
  `status` tinyint DEFAULT '1',
  `approval_status` tinyint NOT NULL DEFAULT '2' COMMENT '审批状态: 1=待审批, 2=已通过, 3=已拒绝',
  `approver_id` int DEFAULT NULL COMMENT '审批人ID',
  `approval_remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审批备注（拒绝原因）',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `quote_no` (`quote_no`),
  KEY `fk_quote_create_by` (`create_by`),
  KEY `idx_quote_no` (`quote_no`),
  KEY `idx_quote_customer` (`customer_id`),
  KEY `idx_quote_status` (`status`),
  KEY `idx_quote_create_time` (`create_time`),
  KEY `idx_quote_deleted_at` (`deleted_at`),
  KEY `idx_quote_opportunity` (`opportunity_id`),
  KEY `idx_quote_approval` (`approval_status`),
  CONSTRAINT `fk_quote_create_by` FOREIGN KEY (`create_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_opportunity` FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunity` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_quote_item`
--

DROP TABLE IF EXISTS `crm_quote_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_quote_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_id` int NOT NULL,
  `product_id` int NOT NULL,
  `product_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` int DEFAULT '1',
  `unit_price` decimal(15,2) DEFAULT '0.00',
  `total_price` decimal(15,2) DEFAULT '0.00',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_quote_item_quote` (`quote_id`),
  KEY `idx_quote_item_product` (`product_id`),
  CONSTRAINT `fk_quote_item_product` FOREIGN KEY (`product_id`) REFERENCES `crm_product` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_item_quote` FOREIGN KEY (`quote_id`) REFERENCES `crm_quote` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_reconciliation`
--

DROP TABLE IF EXISTS `crm_reconciliation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_reconciliation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recon_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对账单号',
  `recon_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对账类型：customer/supplier',
  `target_id` int NOT NULL COMMENT '客户/供应商ID',
  `target_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `period_start` date NOT NULL COMMENT '起始日',
  `period_end` date NOT NULL COMMENT '截止日',
  `total_amount` decimal(12,2) DEFAULT '0.00' COMMENT '总金额',
  `paid_amount` decimal(12,2) DEFAULT '0.00' COMMENT '已付金额',
  `unpaid_amount` decimal(12,2) DEFAULT '0.00' COMMENT '未付金额',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'draft' COMMENT '状态：draft/confirmed/disputed',
  `detail_data` text COLLATE utf8mb4_unicode_ci COMMENT '明细JSON',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rc_type` (`recon_type`),
  KEY `idx_rc_target` (`target_id`),
  KEY `idx_rc_no` (`recon_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对账单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_report_config`
--

DROP TABLE IF EXISTS `crm_report_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_report_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报表名称',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报表说明',
  `report_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报表类型：table/bar/line/pie',
  `data_source` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '数据来源：customer/contract/payment/purchase/opportunity',
  `columns_config` text COLLATE utf8mb4_unicode_ci COMMENT '列配置JSON',
  `filter_config` text COLLATE utf8mb4_unicode_ci COMMENT '筛选条件JSON',
  `chart_config` text COLLATE utf8mb4_unicode_ci COMMENT '图表配置JSON',
  `is_public` tinyint(1) DEFAULT '0' COMMENT '是否公开',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rc_type` (`report_type`),
  KEY `idx_rc_source` (`data_source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自定义报表配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_sales_target`
--

DROP TABLE IF EXISTS `crm_sales_target`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_sales_target` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `year` int NOT NULL,
  `month` int NOT NULL,
  `target_amount` decimal(15,2) DEFAULT '0.00',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_period` (`user_id`,`year`,`month`),
  KEY `idx_target_user_year_month` (`user_id`,`year`,`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_score_rule`
--

DROP TABLE IF EXISTS `crm_score_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_score_rule` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称',
  `condition_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '条件类型：source来源/action行为/interaction互动',
  `condition_field` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '条件字段',
  `condition_operator` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '条件运算符：eq/gt/lt/contains',
  `condition_value` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '条件值',
  `score` int NOT NULL DEFAULT '0' COMMENT '分数',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态：1启用 0禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sr_type` (`condition_type`),
  KEY `idx_sr_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评分规则';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_service_order`
--

DROP TABLE IF EXISTS `crm_service_order`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_service_order` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int NOT NULL,
  `contract_id` int DEFAULT NULL,
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` tinyint DEFAULT '1',
  `priority` tinyint DEFAULT '3',
  `assignee_id` int DEFAULT NULL,
  `finish_time` datetime DEFAULT NULL,
  `finish_desc` text COLLATE utf8mb4_unicode_ci,
  `satisfaction` tinyint DEFAULT NULL,
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_no` (`order_no`),
  KEY `fk_service_contract` (`contract_id`),
  KEY `fk_service_create_by` (`create_by`),
  KEY `idx_order_no` (`order_no`),
  KEY `idx_service_status` (`status`),
  KEY `idx_service_priority` (`priority`),
  KEY `idx_service_customer` (`customer_id`),
  KEY `idx_service_create_time` (`create_time`),
  KEY `idx_service_deleted_at` (`deleted_at`),
  KEY `idx_service_assignee_status` (`assignee_id`,`status`),
  CONSTRAINT `fk_service_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_service_contract` FOREIGN KEY (`contract_id`) REFERENCES `crm_contract` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_service_create_by` FOREIGN KEY (`create_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_service_customer` FOREIGN KEY (`customer_id`) REFERENCES `crm_customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='服务工单表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_smart_reminder`
--

DROP TABLE IF EXISTS `crm_smart_reminder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_smart_reminder` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称',
  `reminder_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '提醒类型',
  `config` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置JSON',
  `notify_to` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'owner' COMMENT '通知对象',
  `notify_method` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'system' COMMENT '通知方式',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态',
  `last_run_at` datetime DEFAULT NULL,
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sr_type` (`reminder_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒规则';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_smart_reminder_log`
--

DROP TABLE IF EXISTS `crm_smart_reminder_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_smart_reminder_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rule_id` int NOT NULL,
  `target_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` int NOT NULL,
  `remind_date` date NOT NULL,
  `user_id` int NOT NULL COMMENT '通知目标用户',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reminder_once` (`rule_id`,`target_type`,`target_id`,`remind_date`),
  KEY `idx_srl_user` (`user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_social_contact`
--

DROP TABLE IF EXISTS `crm_social_contact`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_social_contact` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int DEFAULT NULL COMMENT '关联客户',
  `contact_id` int DEFAULT NULL COMMENT '关联联系人',
  `platform` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '平台',
  `direction` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '方向：in/out',
  `content` text COLLATE utf8mb4_unicode_ci COMMENT '沟通内容摘要',
  `attachment_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '附件路径',
  `message_time` datetime DEFAULT NULL COMMENT '消息时间',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sc_customer` (`customer_id`),
  KEY `idx_sc_platform` (`platform`),
  KEY `idx_sc_time` (`message_time`),
  KEY `idx_social_customer` (`customer_id`,`message_time` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社交通讯记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_stock_alert`
--

DROP TABLE IF EXISTS `crm_stock_alert`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_stock_alert` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL COMMENT '产品ID',
  `min_qty` int DEFAULT '0' COMMENT '最低库存',
  `max_qty` int DEFAULT '9999' COMMENT '最高库存',
  `alert_enabled` tinyint(1) DEFAULT '1' COMMENT '启用预警',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_id` (`product_id`),
  CONSTRAINT `fk_sa_product` FOREIGN KEY (`product_id`) REFERENCES `crm_product` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存预警配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_stock_movement`
--

DROP TABLE IF EXISTS `crm_stock_movement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_stock_movement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL COMMENT '产品ID',
  `movement_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '变动类型：in/out/adjust/return',
  `quantity` int NOT NULL COMMENT '变动数量',
  `before_qty` int NOT NULL COMMENT '变动前库存',
  `after_qty` int NOT NULL COMMENT '变动后库存',
  `related_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联类型',
  `related_id` int DEFAULT NULL COMMENT '关联单据ID',
  `remark` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `operator_id` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sm_product` (`product_id`),
  KEY `idx_sm_type` (`movement_type`),
  KEY `idx_sm_time` (`create_time`),
  KEY `idx_stock_product` (`product_id`,`create_time` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存变动记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_supplier`
--

DROP TABLE IF EXISTS `crm_supplier`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_supplier` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `supplier_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商编号',
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商名称',
  `short_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '简称',
  `type` enum('生产','贸易','服务') COLLATE utf8mb4_unicode_ci DEFAULT '贸易' COMMENT '类型',
  `industry` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '所属行业',
  `level` enum('核心','重点','普通','备用') COLLATE utf8mb4_unicode_ci DEFAULT '普通' COMMENT '等级',
  `status` tinyint DEFAULT '1' COMMENT '状态：1=合作中 2=暂停 3=终止',
  `rating` decimal(2,1) DEFAULT '0.0' COMMENT '综合评分（0-5）',
  `contact_person` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '主要联系人',
  `contact_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系电话',
  `contact_email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系邮箱',
  `address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地址',
  `payment_terms` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '结算方式',
  `delivery_days` int DEFAULT NULL COMMENT '交货周期（天）',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `owner_id` int DEFAULT NULL COMMENT '负责人ID',
  `create_by` int DEFAULT NULL COMMENT '创建人ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_supplier_name` (`name`),
  KEY `fk_supplier_create_by` (`create_by`),
  KEY `idx_supplier_no` (`supplier_no`),
  KEY `idx_supplier_name` (`name`),
  KEY `idx_supplier_type` (`type`),
  KEY `idx_supplier_level` (`level`),
  KEY `idx_supplier_status` (`status`),
  KEY `idx_supplier_owner` (`owner_id`),
  KEY `idx_supplier_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_supplier_create_by` FOREIGN KEY (`create_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_supplier_owner` FOREIGN KEY (`owner_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_supplier_contact`
--

DROP TABLE IF EXISTS `crm_supplier_contact`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_supplier_contact` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `supplier_id` int NOT NULL COMMENT '供应商ID',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '姓名',
  `position` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职位',
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '部门',
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `mobile` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机',
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `wechat` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '微信',
  `role` enum('决策人','对接人','财务','技术','其他') COLLATE utf8mb4_unicode_ci DEFAULT '对接人' COMMENT '角色',
  `is_primary` tinyint DEFAULT '0' COMMENT '是否主要联系人：0=否 1=是',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_contact_supplier` (`supplier_id`),
  KEY `idx_contact_role` (`role`),
  CONSTRAINT `fk_contact_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `crm_supplier` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商联系人表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_supplier_qualification`
--

DROP TABLE IF EXISTS `crm_supplier_qualification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_supplier_qualification` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `supplier_id` int NOT NULL COMMENT '供应商ID',
  `cert_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '证照类型（营业执照/许可证/认证等）',
  `cert_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '证照编号',
  `cert_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '证照名称',
  `issue_date` date DEFAULT NULL COMMENT '发证日期',
  `expire_date` date DEFAULT NULL COMMENT '有效期至',
  `issuing_authority` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发证机构',
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '扫描件路径',
  `status` tinyint DEFAULT '1' COMMENT '状态：1=有效 2=即将到期 3=已过期',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_qual_supplier` (`supplier_id`),
  KEY `idx_qual_type` (`cert_type`),
  KEY `idx_qual_expire` (`expire_date`),
  CONSTRAINT `fk_qual_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `crm_supplier` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商资质证照表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_supplier_rating`
--

DROP TABLE IF EXISTS `crm_supplier_rating`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_supplier_rating` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `supplier_id` int NOT NULL COMMENT '供应商ID',
  `purchase_order_id` int DEFAULT NULL COMMENT '关联采购单',
  `quality_score` decimal(2,1) DEFAULT '0.0' COMMENT '质量评分（0-5）',
  `delivery_score` decimal(2,1) DEFAULT '0.0' COMMENT '交期评分（0-5）',
  `service_score` decimal(2,1) DEFAULT '0.0' COMMENT '服务评分（0-5）',
  `price_score` decimal(2,1) DEFAULT '0.0' COMMENT '价格评分（0-5）',
  `quality_rate` decimal(5,2) DEFAULT '0.00' COMMENT '质量合格率',
  `delivery_rate` decimal(5,2) DEFAULT '0.00' COMMENT '准时交付率',
  `total_score` decimal(2,1) DEFAULT '0.0' COMMENT '总分（0-5）',
  `rating_period` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '评分周期（如2024-Q1）',
  `evaluator_id` int DEFAULT NULL COMMENT '评估人ID',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT '评估说明',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `fk_rating_evaluator` (`evaluator_id`),
  KEY `idx_rating_supplier` (`supplier_id`),
  KEY `idx_rating_period` (`rating_period`),
  CONSTRAINT `fk_rating_evaluator` FOREIGN KEY (`evaluator_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_rating_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `crm_supplier` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商评分记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_survey_campaign`
--

DROP TABLE IF EXISTS `crm_survey_campaign`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_survey_campaign` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '调查名称',
  `template_id` int NOT NULL COMMENT '使用的模板',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'draft' COMMENT '状态：draft/active/closed',
  `target_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'all' COMMENT '目标：all/specific',
  `target_ids` text COLLATE utf8mb4_unicode_ci COMMENT '指定客户ID列表JSON',
  `send_method` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'link' COMMENT '发送方式',
  `total_sent` int DEFAULT '0' COMMENT '已发送数',
  `total_responded` int DEFAULT '0' COMMENT '已回复数',
  `start_date` date DEFAULT NULL COMMENT '开始日期',
  `end_date` date DEFAULT NULL COMMENT '结束日期',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sc_status` (`status`),
  KEY `idx_sc_template` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查活动';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_survey_response`
--

DROP TABLE IF EXISTS `crm_survey_response`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_survey_response` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL COMMENT '活动ID',
  `customer_id` int DEFAULT NULL COMMENT '关联客户',
  `answers` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '回答JSON',
  `nps_score` int DEFAULT NULL COMMENT 'NPS分数(0-10)',
  `csat_score` decimal(3,1) DEFAULT NULL COMMENT 'CSAT平均分',
  `respondent_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '回复人',
  `respondent_contact` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系方式',
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sr_campaign` (`campaign_id`),
  KEY `idx_sr_customer` (`customer_id`),
  CONSTRAINT `fk_sr_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `crm_survey_campaign` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查回复';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_survey_template`
--

DROP TABLE IF EXISTS `crm_survey_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_survey_template` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板名称',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '模板说明',
  `survey_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'csat' COMMENT '调查类型：nps/csat/custom',
  `questions` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '问题配置JSON',
  `is_system` tinyint(1) DEFAULT '0' COMMENT '是否系统预设',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_st_type` (`survey_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查模板';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_tag`
--

DROP TABLE IF EXISTS `crm_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_tag` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签名称',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'custom' COMMENT '标签类型: region/industry/scale/custom',
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#1a56db' COMMENT '标签颜色(hex)',
  `sort` int DEFAULT '0' COMMENT '排序',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户标签表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_webhook`
--

DROP TABLE IF EXISTS `crm_webhook`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_webhook` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Webhook名称',
  `url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '回调URL',
  `events` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '订阅事件JSON',
  `secret` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '签名密钥',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态',
  `last_triggered_at` datetime DEFAULT NULL COMMENT '最后触发时间',
  `fail_count` int DEFAULT '0' COMMENT '连续失败次数',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook订阅';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_webhook_log`
--

DROP TABLE IF EXISTS `crm_webhook_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_webhook_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `webhook_id` int NOT NULL,
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` text COLLATE utf8mb4_unicode_ci COMMENT '发送的JSON数据',
  `response_status` int DEFAULT NULL COMMENT 'HTTP响应状态码',
  `response_body` text COLLATE utf8mb4_unicode_ci COMMENT '响应内容',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'success/failed/timeout',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wl_webhook` (`webhook_id`),
  KEY `idx_wl_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook发送日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_workflow_log`
--

DROP TABLE IF EXISTS `crm_workflow_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_workflow_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rule_id` int NOT NULL,
  `trigger_event` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_id` int DEFAULT NULL,
  `action_type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_result` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_detail` text COLLATE utf8mb4_unicode_ci,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wl_rule` (`rule_id`),
  KEY `idx_wl_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流执行日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crm_workflow_rule`
--

DROP TABLE IF EXISTS `crm_workflow_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crm_workflow_rule` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trigger_event` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发事件',
  `conditions` text COLLATE utf8mb4_unicode_ci COMMENT '触发条件JSON',
  `actions` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '执行动作JSON',
  `status` tinyint(1) DEFAULT '1' COMMENT '状态',
  `last_run_at` datetime DEFAULT NULL,
  `run_count` int DEFAULT '0',
  `create_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wr_event` (`trigger_event`),
  KEY `idx_wr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流规则';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_owner_cleanup_20260604`
--

DROP TABLE IF EXISTS `customer_owner_cleanup_20260604`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_owner_cleanup_20260604` (
  `id` int NOT NULL,
  `owner_id` int DEFAULT NULL,
  `pool_status` tinyint DEFAULT '0',
  `status` tinyint DEFAULT '1',
  `update_time` datetime DEFAULT NULL,
  `batch_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_owner_reclaim_non_admin_20260604`
--

DROP TABLE IF EXISTS `customer_owner_reclaim_non_admin_20260604`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_owner_reclaim_non_admin_20260604` (
  `id` int NOT NULL,
  `owner_id` int DEFAULT NULL,
  `pool_status` tinyint DEFAULT '0',
  `status` tinyint DEFAULT '1',
  `update_time` datetime DEFAULT NULL,
  `batch_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '迁移版本号',
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '迁移名称',
  `executed_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_version` (`version`)
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移追踪表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_analysis_config`
--

DROP TABLE IF EXISTS `sys_analysis_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_analysis_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('prediction','anomaly','alert') COLLATE utf8mb4_unicode_ci NOT NULL,
  `config` json DEFAULT NULL,
  `is_active` tinyint DEFAULT '1',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_backup_record`
--

DROP TABLE IF EXISTS `sys_backup_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_backup_record` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '备份ID',
  `backup_type` enum('full','incremental') COLLATE utf8mb4_unicode_ci DEFAULT 'full' COMMENT '备份类型',
  `file_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '备份文件名',
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '备份文件路径',
  `file_size` bigint DEFAULT '0' COMMENT '文件大小(bytes)',
  `status` enum('running','success','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'running' COMMENT '状态',
  `error_msg` text COLLATE utf8mb4_unicode_ci COMMENT '错误信息',
  `create_by` int DEFAULT NULL COMMENT '创建人',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据备份记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_config`
--

DROP TABLE IF EXISTS `sys_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) NOT NULL,
  `config_value` varchar(500) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `config_key` (`config_key`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_data_permission`
--

DROP TABLE IF EXISTS `sys_data_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_data_permission` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `role_id` int NOT NULL COMMENT '角色ID',
  `module` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模块名称',
  `data_scope` enum('all','dept','dept_and_sub','self','custom') COLLATE utf8mb4_unicode_ci DEFAULT 'self' COMMENT '数据范围',
  `custom_dept_ids` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '自定义部门ID列表',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_module` (`role_id`,`module`),
  KEY `idx_role_id` (`role_id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据权限配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_data_quality_report`
--

DROP TABLE IF EXISTS `sys_data_quality_report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_data_quality_report` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '报告ID',
  `table_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '表名',
  `total_count` int DEFAULT '0' COMMENT '总记录数',
  `duplicate_count` int DEFAULT '0' COMMENT '重复记录数',
  `invalid_count` int DEFAULT '0' COMMENT '无效记录数',
  `missing_count` int DEFAULT '0' COMMENT '缺失记录数',
  `quality_score` decimal(5,2) DEFAULT '0.00' COMMENT '质量评分',
  `check_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '检查时间',
  PRIMARY KEY (`id`),
  KEY `idx_table_name` (`table_name`),
  KEY `idx_check_time` (`check_time`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据质量报告表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_dept`
--

DROP TABLE IF EXISTS `sys_dept`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dept` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '部门ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '部门名称',
  `parent_id` int DEFAULT '0' COMMENT '上级部门ID',
  `sort` int DEFAULT '0' COMMENT '排序',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='部门表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_email_log`
--

DROP TABLE IF EXISTS `sys_email_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_email_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `to_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('sent','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'sent',
  `error_msg` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref_id` int DEFAULT NULL,
  `send_by` int DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_ref` (`ref_type`,`ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_integration`
--

DROP TABLE IF EXISTS `sys_integration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_integration` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('email','sms','erp','finance') COLLATE utf8mb4_unicode_ci NOT NULL,
  `config` json DEFAULT NULL,
  `status` enum('active','inactive','error') COLLATE utf8mb4_unicode_ci DEFAULT 'inactive',
  `last_sync_time` datetime DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_log`
--

DROP TABLE IF EXISTS `sys_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `module` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `params` text COLLATE utf8mb4_unicode_ci,
  `changed_fields` text COLLATE utf8mb4_unicode_ci COMMENT '变更字段列表(JSON)',
  `old_value` text COLLATE utf8mb4_unicode_ci COMMENT '变更前数据(JSON)',
  `new_value` text COLLATE utf8mb4_unicode_ci COMMENT '变更后数据(JSON)',
  `ip_address` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `user_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` tinyint DEFAULT '1',
  `error_msg` text COLLATE utf8mb4_unicode_ci,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_module` (`module`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_action` (`action`),
  CONSTRAINT `fk_log_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11738 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_operation_log`
--

DROP TABLE IF EXISTS `sys_operation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_operation_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `user_id` int DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户名',
  `module` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '模块名称',
  `operation` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '操作类型',
  `method` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '方法名',
  `params` text COLLATE utf8mb4_unicode_ci COMMENT '请求参数',
  `result` text COLLATE utf8mb4_unicode_ci COMMENT '返回结果摘要',
  `ip` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '操作IP',
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户代理',
  `execution_time` int DEFAULT NULL COMMENT '执行时长(ms)',
  `status` tinyint DEFAULT '1' COMMENT '状态：1成功 0失败',
  `error_msg` text COLLATE utf8mb4_unicode_ci COMMENT '错误信息',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_module` (`module`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='详细操作日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_permission`
--

DROP TABLE IF EXISTS `sys_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_permission` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '权限ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '权限名称',
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '权限编码',
  `type` enum('menu','button','api') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '权限类型',
  `parent_id` int DEFAULT '0' COMMENT '父权限ID',
  `path` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '权限路径（菜单路径或API路径）',
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '图标',
  `sort` int DEFAULT '0' COMMENT '排序',
  `is_visible` tinyint DEFAULT '1' COMMENT '是否可见',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_parent_id` (`parent_id`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB AUTO_INCREMENT=119 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色名称',
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色编码',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `status` tinyint DEFAULT '1' COMMENT '状态(1正常0禁用)',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `view_all` tinyint DEFAULT '0' COMMENT '查看全部数据权限',
  `manage_all` tinyint DEFAULT '0' COMMENT '管理全部数据权限',
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_role_permission`
--

DROP TABLE IF EXISTS `sys_role_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role_permission` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `role_id` int NOT NULL COMMENT '角色ID',
  `permission_id` int NOT NULL COMMENT '权限ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`role_id`,`permission_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_permission_id` (`permission_id`),
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `sys_permission` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=256 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户名',
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码',
  `real_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '真实姓名',
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `dept_id` int DEFAULT NULL COMMENT '部门ID',
  `role_id` int DEFAULT NULL COMMENT '角色ID',
  `status` tinyint DEFAULT '1' COMMENT '状态(1正常0禁用)',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `last_login_time` datetime DEFAULT NULL COMMENT '最后登录时间',
  `last_login_ip` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后登录IP',
  `manager_id` int DEFAULT NULL COMMENT '直属上级ID',
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_dept_id` (`dept_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `fk_user_manager` (`manager_id`),
  CONSTRAINT `fk_user_dept` FOREIGN KEY (`dept_id`) REFERENCES `sys_dept` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_manager` FOREIGN KEY (`manager_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_validation_rule`
--

DROP TABLE IF EXISTS `sys_validation_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_validation_rule` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  `table_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '表名',
  `column_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '列名',
  `rule_type` enum('required','unique','format','range','custom') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则类型',
  `rule_config` json DEFAULT NULL COMMENT '规则配置',
  `error_message` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '错误提示',
  `is_active` tinyint DEFAULT '1' COMMENT '是否启用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_table_col_type` (`table_name`,`column_name`,`rule_type`),
  KEY `idx_table_column` (`table_name`,`column_name`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据验证规则表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `v_user_permissions`
--

DROP TABLE IF EXISTS `v_user_permissions`;
/*!50001 DROP VIEW IF EXISTS `v_user_permissions`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_user_permissions` AS SELECT 
 1 AS `user_id`,
 1 AS `username`,
 1 AS `real_name`,
 1 AS `role_id`,
 1 AS `role_name`,
 1 AS `permission_code`,
 1 AS `permission_name`,
 1 AS `permission_type`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `v_user_permissions`
--

/*!50001 DROP VIEW IF EXISTS `v_user_permissions`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`crm_user`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_user_permissions` AS select `u`.`id` AS `user_id`,`u`.`username` AS `username`,`u`.`real_name` AS `real_name`,`u`.`role_id` AS `role_id`,`r`.`name` AS `role_name`,`p`.`code` AS `permission_code`,`p`.`name` AS `permission_name`,`p`.`type` AS `permission_type` from (((`sys_user` `u` left join `sys_role` `r` on((`u`.`role_id` = `r`.`id`))) left join `sys_role_permission` `rp` on((`r`.`id` = `rp`.`role_id`))) left join `sys_permission` `p` on((`rp`.`permission_id` = `p`.`id`))) where ((`u`.`status` = 1) and (`p`.`id` is not null)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-12 11:52:34

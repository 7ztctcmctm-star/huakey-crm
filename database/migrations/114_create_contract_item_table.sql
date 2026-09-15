-- Migration 114: 创建合同明细表
-- 为 R-02 报价转合同修复：报价单产品明细需复制到合同明细表
-- 参照 crm_quote_item 结构，字段名对齐：total_price（非 subtotal）、product_code

CREATE TABLE IF NOT EXISTS `crm_contract_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contract_id` int NOT NULL COMMENT '关联合同ID',
  `product_id` int NOT NULL COMMENT '产品ID',
  `product_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `product_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品编码',
  `quantity` int DEFAULT '1' COMMENT '数量',
  `unit_price` decimal(15,2) DEFAULT '0.00' COMMENT '单价',
  `total_price` decimal(15,2) DEFAULT '0.00' COMMENT '小计',
  `remark` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `create_by` int DEFAULT NULL COMMENT '创建人',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_contract_item_contract` (`contract_id`),
  KEY `idx_contract_item_product` (`product_id`),
  CONSTRAINT `fk_contract_item_contract` FOREIGN KEY (`contract_id`) REFERENCES `crm_contract` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_item_product` FOREIGN KEY (`product_id`) REFERENCES `crm_product` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合同明细表';

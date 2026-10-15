-- ============================================================
-- 迁移: 幂等键记录表（AGENTS.md 7.18 幂等机制 · 2026-10-15）
-- 背景（2026-10-15 交付前自检实测）：
--   crm_payment 无任何唯一约束、recordPayment/createContract 无代码层幂等校验
--   ⇒ 重复提交 / 双击 / 网络重试会产生【重复回款】（资金账目错误）与【重复合同】。
-- 方案：
--   客户端传 Idempotency-Key（请求头）或 body.idempotency_key；
--   服务端以 key 为主键记录首次成功结果，重复 key 直接返回缓存结果（不重复落库）。
--   无 key 时退化直跑（渐进增强，不破坏未改造的前端调用方）。
-- 语义：仅【成功】才记 key —— fn 失败不插记录，客户端可安全重试。
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_idempotency (
  idempotency_key varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（客户端生成的唯一请求标识）',
  biz_type varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型: payment=回款登记 contract=合同创建',
  result_json text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '首次成功的结果（JSON）',
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idempotency_key),
  KEY idx_idem_biz (biz_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='幂等键记录表';

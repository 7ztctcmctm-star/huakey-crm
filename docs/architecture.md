# 铧旗 CRM 系统架构

## 架构总览（单体架构）

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Nginx      │────▶│  Express App │
│  (Vue 3 SPA) │     │  (反向代理)   │     │  (Node.js)   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                   │
                           ┌───────────────────────┼───────────────────────┐
                           │                       │                       │
                    ┌──────▼──────┐         ┌──────▼──────┐        ┌──────▼──────┐
                    │   MySQL 8.0 │         │  Redis 7    │        │  WeChat     │
                    │  (主数据库)   │         │  (可选缓存)  │        │  Webhook    │
                    └─────────────┘         └─────────────┘        └─────────────┘
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Element Plus + ECharts + Pinia |
| 后端 | Node.js + Express 4 + mysql2 + Joi |
| 数据库 | MySQL 8.0 (utf8mb4) |
| 缓存 | Redis 7 (ioredis，可选) |
| 认证 | JWT (jsonwebtoken + bcryptjs) |
| 定时任务 | node-cron |
| 文件存储 | Supabase Storage / 本地磁盘 |
| 部署 | Docker + Container Manager (NAS) |
| AI | Ollama (qwen2.5:3b，Text-to-SQL) |

---

## 已冻结模块（Architectural Constraints）

> 以下模块已冻结，修改需走 RFC 流程。Delta Audit 时间：2026-08-04。

### Customer Center v1.0（2026-08-04 冻结）

**范围**：潜客池（leads）/ 正式客户（customer）/ 公海池（pool）/ 客户生命周期 / 客户权限体系 / 客户相关 API / 客户相关测试

**冻结边界文件**：见 [docs/customer-center-freeze-v1.md](file:///c:/huakey-crm/docs/customer-center-freeze-v1.md) §「冻结边界文件清单」

**关键架构约束**：

| 约束 | 说明 |
|------|------|
| 单表模型 | `crm_customer` 单表，禁止拆分为 `crm_lead` / `crm_customer_pool` 等多表 |
| 双字段状态模型 | `business_status`（销售漏斗阶段）+ `pool_status`（资源归属），禁止回退到单 `status` 字段模型 |
| API 端点 | `/api/v1/leads`、`/api/v1/customers`、`/api/v1/pool` 三组端点独立，旧 `/api/v1/customer/*` 仅作兼容层 |
| 权限码 | `leads:*` / `customer:*` / `pool:*` 三组权限码独立，CRUD 统一为 `add/edit/delete` 风格 |
| 后续模块依赖 | 商机 / 报价 / 合同 / 订单 / 回款 / 服务工单等只能**读取**客户中心数据，不得修改其表结构、权限码、API 契约 |

**修改例外条件**（仅以下情况允许修改）：
1. P0 Bug — 影响生产数据正确性或服务可用性
2. 安全漏洞 — 权限绕过、SQL 注入、XSS 等
3. 数据错误 — 数据损坏、状态流转错误、级联删除异常
4. 法规要求 — 合规性强制修改

**修改流程**：提交 RFC（架构变更说明）→ 团队评审 → 实施方案 → 回滚方案 → 测试方案 → 确认后实施

### 领域边界（Domain Boundary）— 全局架构约束

> 此约束适用于所有 CRM 模块，详见 [docs/customer-center-freeze-v1.md](file:///c:/huakey-crm/docs/customer-center-freeze-v1.md) §「领域边界」。

**核心规则**：禁止任何非客户中心模块直接或间接修改 `crm_customer` 表。

| 模块 | 允许操作 | 禁止操作 |
|------|----------|----------|
| 商机 / 报价 / 合同 / 订单 / 回款 / 服务工单 | SELECT 读取客户数据、JOIN 关联查询 | UPDATE crm_customer、调用 customerService 写方法、cron 同步客户状态 |

客户状态推进由客户中心模块自治，后续模块不得自动触发。违反此约束视为 P0 级架构违反。

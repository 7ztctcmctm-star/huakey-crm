# 第三轮：数据库审计报告

> 审计日期：2026-07-04

## 总览

| 指标 | 数值 |
|------|------|
| 数据库表 | 90+ |
| 迁移脚本 | 69 up / 26 down |
| 发现的问题 | 20 |
| 🔴 高危 | 3 |
| 🟡 中危 | 10 |
| 🟢 低危 | 5 |
| ℹ️ 建议 | 2 |

## 🔴 高危问题

### 1. 仪表盘/报表查询缺失 deleted_at IS NULL（统计虚高）
- **位置**：`dashboardService.js`（7处）、`reportAnalyticsService.js`（5处）、`dashboardService.js` getQuickStats（1处）
- **影响**：已软删除的记录被计入统计，首页仪表盘数据不准确
- **修复**：所有统计查询补 `AND deleted_at IS NULL`

### 2. claimCustomer / releaseCustomer 多表写入无事务
- **位置**：`backend/services/customerService.js:413`、`:462`
- **问题**：UPDATE + INSERT 操作未包裹事务，故障时主表状态已变但日志丢失
- **修复**：参照 `poolService.batchClaimCustomers()` 添加事务

### 3. 只读连接池太小（5 连接 + queueLimit=0）
- **位置**：`backend/config/database.js:75`
- **问题**：AI 查询 + 报表并发时第 6 个请求立即失败
- **修复**：提升 connectionLimit 至 10，queueLimit 至 20

## 🟡 中危问题

### 4. 058 迁移 7 表 deleted_at 字段缺少索引
### 5. DATE(f.next_time) 导致索引失效
### 6. assignService / customerService N+1 循环
### 7. aiRouteService 存在 N+1 查询
### 8. dashboardService getTodayTasks 缺失 deleted_at 过滤
### 9. 报表 analytics 多处缺失 deleted_at 过滤（与同文件 sourceDist 不一致）
### 10. fk_poollog_customer 可能在分区迁移中丢失
### 11. crm_payment 缺少 plan_id 覆盖索引

## 🟢 低危问题

### 12. 深分页全使用 OFFSET 模式
### 13. emailService 循环查联系人
### 14. 只读账号未配置时警告不明显
### 15. logAction fire-and-forget 模式
### 16. 32 个文件使用 SELECT *

## 良好方面
- 核心表索引覆盖全面（customer 7 个、opportunity 5 个、contract 4 个）
- 事务使用规范：所有 beginTransaction 都有 commit/rollback + finally release
- 慢查询拦截器设计良好（AOP 模式）
- 关键多表写入场景（合同、发票、批量分配）事务保护完整
- AI 查询有 SQL 白名单 + LIMIT 50 保护

## 优先修复顺序

1. 所有仪表盘/报表查询补 `deleted_at IS NULL`
2. claimCustomer / releaseCustomer 加事务
3. 只读连接池扩容
4. DATE() 改为范围查询
5. 058 迁移 7 表补索引
6. 消除 N+1 循环

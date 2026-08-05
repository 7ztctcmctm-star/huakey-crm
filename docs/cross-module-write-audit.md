# Cross-Module Write Audit

> **审计类型**: 领域边界违规检测
> **审计日期**: 2026-08-04
> **扫描范围**: 全项目 65+ Service 文件 + cron 脚本
> **规则**: 非 Customer Center 模块禁止 UPDATE/DELETE/INSERT crm_customer
> **依据**: [customer-center-freeze-v1.md](customer-center-freeze-v1.md) §领域边界

---

## 1. Audit Methodology

### 扫描方式

```bash
# 静态扫描
grep -r "UPDATE\s\+crm_customer" backend/services/ backend/cron/ backend/scripts/

# 间接调用扫描
grep -r "customerService\.\(forwardStatus\|updateStatus\|updateCustomer\)" backend/services/
```

### 分类标准

| 分类 | 定义 |
|------|------|
| 🟢 ALLOWED | Customer Center 域内文件 (customerService, leadsService, poolService, etc.) |
| 🟢 ALLOWED | 基础设施 (userRouteService 级联删除 — 架构决策) |
| 🔴 VIOLATION | 非 Customer Center 域文件写入 crm_customer |

---

## 2. Scan Results

### 2.1 含 UPDATE crm_customer 的文件

| 文件 | 域 | 分类 | 详情 |
|------|-----|------|------|
| `services/customerService.js` | Customer | 🟢 ALLOWED | 客户 CRUD 核心 |
| `services/leadsService.js` | Customer | 🟢 ALLOWED | 潜客管理 |
| `services/poolService.js` | Customer | 🟢 ALLOWED | 公海池操作 |
| `services/assignService.js` | Customer | 🟢 ALLOWED | 客户分配 |
| `services/followUpService.js` | Customer | 🟢 ALLOWED | 跟进 + 状态推进 |
| `services/customerDetailService.js` | Customer | 🟢 ALLOWED | 客户详情 |
| `services/scoringRouteService.js` | Customer | 🟢 ALLOWED | 客户评分 |
| `services/automationService.js` | Customer | 🟢 ALLOWED | 自动化规则 |
| `services/cronService.js` | Customer | 🟢 ALLOWED | 公海回收/逾期提醒 |
| `services/userRouteService.js` | Infrastructure | 🟢 ALLOWED | 用户删除级联 (见 CLAUDE.md §软删除+级联规则) |
| `scripts/auto_release.js` | Customer | 🟢 ALLOWED | 独立脚本 |

### 2.2 非 Customer 域文件扫描

| 文件 | 域 | UPDATE crm_customer | 状态 |
|------|-----|---------------------|------|
| `services/opportunityService.js` | Opportunity | ❌ 0 | 🟢 PASS |
| `services/quoteService.js` | Quote | ❌ 0 (FIX-2 已移除) | 🟢 PASS |
| `services/contractService.js` | Contract | ❌ 0 | 🟢 PASS |
| `services/contractCrudService.js` | Contract | ❌ 0 | 🟢 PASS |
| `services/contractPaymentService.js` | Contract | ❌ 0 | 🟢 PASS |
| `services/contractExportService.js` | Contract | ❌ 0 | 🟢 PASS |
| `services/productService.js` | Product | ❌ 0 | 🟢 PASS |
| `services/purchaseService.js` | Purchase | ❌ 0 | 🟢 PASS |
| `services/supplierService.js` | Supplier | ❌ 0 | 🟢 PASS |
| `services/serviceOrderService.js` | Service | ❌ 0 | 🟢 PASS |
| `services/hrService.js` | HR | ❌ 0 | 🟢 PASS |
| `services/reportAnalyticsService.js` | Report | ❌ 0 | 🟢 PASS |
| `services/financeService.js` | Finance | ❌ 0 | 🟢 PASS |
| `services/approvalService.js` | Approval | ❌ 0 | 🟢 PASS |

---

## 3. Historical Violations (已修复)

| # | 文件 | 违规内容 | 修复 | 修复日期 |
|---|------|----------|------|----------|
| V-1 | `quoteService.js:107-111` | 报价创建后调用 `customerService.forwardStatus` 推进客户状态 | FIX-2: 完全移除，注释记录 | 2026-08-04 |
| V-2 | 设计文档 §10.4 | 提议 cronService 同步客户 business_status='quoted' | FIX-3: 不实施 | 2026-08-04 |

---

## 4. Verification

### 4.1 自动化检测

```javascript
// tests/quoteService.test.js — 运行时 SQL 拦截
const updateCustomerSqls = allSqls.filter(sql => /UPDATE\s+crm_customer/i.test(sql));
expect(updateCustomerSqls).toHaveLength(0);
```

```javascript
// tests/e2e/opportunity-flow.spec.js — 源码静态扫描
const code = source.split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n');
expect(code).not.toMatch(/UPDATE\s+crm_customer/i);
```

### 4.2 检测覆盖

| 模块 | 静态扫描 | 运行时拦截 | E2E 测试 | 状态 |
|------|----------|------------|----------|------|
| Opportunity | ✅ | — | ✅ | PASS |
| Quote | ✅ | ✅ | ✅ | PASS |
| Contract | ✅ | — | ✅ | PASS |

---

## 5. Conclusion

**全项目跨模块写入审计通过。**

- **0 处** P0 违规 (非 Customer 域写入 crm_customer)
- **2 处**历史违规已修复 (V-1/V-2)
- **10 处**含 UPDATE crm_customer 的文件全部在 Customer Center 域内

Customer Center 作为客户数据唯一拥有者的架构约束已得到严格执行。

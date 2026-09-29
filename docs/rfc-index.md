# RFC 索引总览：R-10 / R-12 / R-13 / R-15

> 维护：David ｜ 最近更新：2026-09-28
> 本页是这批 RFC 的**唯一入口**：清单、状态、依赖、排期与决策汇总。
> **6 份 RFC 已全部 ACCEPTED，无遗留待拍板事项。**

---

## 一、RFC 状态流转

```
DRAFT（草案） → REVIEW（评审中） → ACCEPTED（通过，排期实施）
                              ↘ REJECTED（否决，归档）
                              ↘ DEFERRED（暂缓）
ACCEPTED 实施完成 → IMPLEMENTED
```

## 二、本批 RFC 清单（全部 ACCEPTED）

| 编号 | 标题 | 影响域 | 改表 | 排期 | 状态 |
|---|---|---|---|---|---|
| [RFC-R13](rfc-R13-owner-id-create-by-naming-2026-09-17.md) | 列名命名规范 | 全库 | 否（规范生效） | 即刻生效 | **ACCEPTED** |
| [RFC-R12](rfc-R12-relax-customer-status-2026-09-17.md) | 客户状态模型收敛 + 放宽创建 | 客户域 | 是（v2.0 收敛） | **v2.0 初** | **ACCEPTED** |
| [RFC-R10](rfc-R10-contract-status-log-2026-09-17.md) | 合同状态日志 + 流转矩阵 + 可见性 | 合同域 | 新增 1 表 | **v2.0 初** | **ACCEPTED** |
| [RFC-R15a](rfc-R15a-opportunity-8-stages-2026-09-17.md) | 商机扩为 8 阶段 | 商机域/报表 | 数据迁移 | **v2.0 初** | **ACCEPTED** |
| [RFC-R15b](rfc-R15b-restful-migration-2026-09-17.md) | 全局 RESTful 迁移 | API/前端 | v2.0 末下线旧端点 | **v2.0 初启动** | **ACCEPTED** |
| [RFC-R15c](rfc-R15c-fk-cascade-2026-09-17.md) | FK CASCADE 规则统一 | 全库约束 | 改 FK | **v2.0 初** | **ACCEPTED** |

## 三、全部已拍板决策

| 事项 | 结论 | 拍板 |
|---|---|---|
| 命名方向（R13） | **按现状主流**：`create_by` / `update_by` / `owner_id` / `create_time` / `update_time` / `deleted_at`；新表强制、异类借道 | 09-24 |
| CI 守卫（R13） | 加「新表提交前 lint / CI 守卫」，随 v2.0 落地 | 09-28 |
| 客户阶段（R12） | business_status 为唯一阶段，**7 值含 `paused`（可恢复搁置态：不进公海、暂停不提醒、恢复回原阶段）** | 09-24 |
| 生命周期（R12） | **`lifecycle_status` 废弃删列**，new/nurturing/active 由 last_follow_time + business_status 现算 | 09-24 |
| 合同可见性（R10） | **boss + 管理员 + 客户绑定业务员**；数据范围按 `crm_customer.owner_id`（非合同录入人） | 09-24 |
| 合同守卫 / 回填（R10） | 建合同放宽到 `business_status IN (following/quoted/negotiating)`；存量合同**回填初始日志**；日志外键 **SET NULL** | 09-24 |
| 商机 8 阶段（R15a） | 询盘/需求确认/方案报价/商务谈判/**合同审批/合同签署**/成交/流失（流失占第 8） | 09-24 |
| RESTful（R15b） | 并存→逐域切换；优先序「问题优先、兼顾高频」；**v2.0 末下线旧端点（接受破坏性、不永久保留别名）** | 09-24 |
| FK（R15c） | 明细 CASCADE、日志 SET NULL、主数据 RESTRICT、弱引用 SET NULL；业务主数据保持软删；整改指向 customer 的 11 个 CASCADE | 09-24 |
| 排期 | R10 / R12 / R15a-c 统一 **v2.0 初**；R13 规范即刻生效 | 09-24 |

## 四、依赖与 v2.0 实施顺序

- **R13（已生效）是命名基座**：所有新表、日志表按标准列名。
- **R12 客户状态收敛先行**：合同 / 商机创建守卫与报表都引用客户字段。
- **R10 ↔ R15a 联动**：合同状态机与商机 8 阶段在「合同审批 / 签署 / 成交」环节一一对应，同期开发。
- **R15b / R15c**：贯穿性技术债，随各域借道推进、末期收尾。

| v2.0 顺序 | RFC | 前置 |
|---|---|---|
| 1 | R12 客户状态收敛 | — |
| 2 | R10 合同状态日志 + 可见性 | R12、R13 |
| 3 | R15a 商机 8 阶段 | 与 R10 联动 |
| 4 | R15b RESTful、R15c FK | 随各域借道 |

## 五、待确认事项

**无。** 6 份 RFC 全部拍板；后续仅为工程实施与测试，按第四节顺序推进。

## 六、数据核对基线（2026-09-24，本地 `huakey_crm`）

| 指标 | 数值 |
|---|---|
| 应用表数 | **106**（BASE 107，含 1 张迁移备份表） |
| 外键 / 规则 | **101**：CASCADE 42 · SET NULL 48 · NO ACTION 7 · RESTRICT 4 |
| 指向 `crm_customer` 的外键 | 21：CASCADE 11 · SET NULL 9 · NO ACTION 1 |
| 创建人列 | `create_by` **38** · `created_by` 2（异类） |
| 归属人列 | `owner_id` **5** 应用表 |
| 软删 / 更新人 | `deleted_at` 62；现状无更新人列（新标准 `update_by`） |
| 时间列 | `create_time` 86 · `update_time` 47 · `created_at` 12 · `updated_at` 6 |
| 动词型端点 | **106**：add 26 · update 21 · delete 21 · list 37 · save 1 |

### 排查出、将在 v2.0 修复的真实缺陷

| 等级 | 缺陷 | 位置 | 归属 RFC |
|---|---|---|---|
| **P1** | 建合同要求客户先 signed（因果倒置、流程走不通） | `contractService.createContract:193` | R10 |
| P2 | `crm_contract.status='signed'` 隐式转 0，合同统计恒空 | `analysisService.js:170` | R10 |
| P2 | 合同终态锁定可被 /update 绕过 | `contractCrudService.updateContract` | R10 |

> 复核方式：`information_schema` + 全量脚本扫描。数字随代码变更可能过期，引用前重新核对。

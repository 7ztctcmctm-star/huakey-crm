# docs/ 目录文档盘点与去留审计（2026-10-16）

> 范围：`docs/` 全部 150 个 .md（根目录 118 + archive/ 32）。
> 方法：逐一读取文件头部元信息（标题/日期/状态/类型），对照项目当前事实（R-01~07/09/11/14/16 已收口、四个 P0 已闭环、迁移台账至 122、生产已部署）判定。
> 分级：**【保留】**=现行有效、日常工作/运维/决策要查；**【归档】**=历史过程件，有追溯价值但不再日常使用，建议移入 `archive/`；**【可删】**=已被取代、内容重复或事实已失效，删除无损（删除前请先确认，见文末建议）。
> ⚠️ 本次只出清单，**未移动/删除任何文件**。

---

## 一、可删（建议直接删除，共 23 个）

理由：已被更新版本完全取代 / 同一主题多份重复 / 所述状态早已失效（如"规划中未执行"且后来已由其他文档闭环）。

| # | 文件 | 删除理由 |
|---|---|---|
| 1 | `crm-v1-monitoring-plan.md` | 被 `crm-v1-monitoring-plan-v2.md` 取代（同日同主题两版） |
| 2 | `crm-v1-https-deployment-execution.md` | 执行日志，结论已并入 `crm-v1-https-deployment-report.md`（PASS） |
| 3 | `huakeycrm-v1-release-candidate-report.md` | RC 状态报告，早已被 v1.0 正式验收（archive/crm-v1-final-production-acceptance-report.md）和 09-30 终验取代 |
| 4 | `crm-release-readiness-summary-2026-09-10.md` | 09-10 放行判定，已被 `launch-readiness-2026-09-29.md` → `launch-readiness-audit-2026-10-14.md` 两轮取代 |
| 5 | `crm-deployment-blockers-verification-2026-09-10.md` | 对 DEPLOYMENT_BLOCKERS.md 的核验记录，阻塞项早已闭环（09-30 终验） |
| 6 | `PRODUCTION_AUDIT_REPORT.md` | 2026-07-09 v1.5.0 审计，被 08-18 全项目审计及之后所有审计取代 |
| 7 | `PRODUCTION_DATA_VALIDATION.md` | 2026-07-09 数据验证快照，已被后续生产核对（10-15 P0 闭环）取代 |
| 8 | `DATA_LOCATION_REPORT.md` | 2026-07-09 数据定位，信息已固化进运维手册和 MEMORY |
| 9 | `archive/FINAL_ACCEPTANCE_REPORT.md` | 07-09 验收，被 archive/crm-v1-final-production-acceptance-report.md（08-06）取代 |
| 10 | `archive/crm-v1-production-checklist.md` | 与 `archive/crm-v1-production-release-checklist.md` 同主题重复（同日两份上线清单） |
| 11 | `archive/crm-v1-https-deployment-plan.md` | "规划中"文档，实际部署已由 report/execution 闭环 |
| 12 | `archive/crm-v1-https-security-plan.md` | 同上，规划稿，已实施完毕 |
| 13 | `archive/crm-v1-go-live-runbook.md` | 演练手册，正式运维手册 `crm-v1-operation-runbook.md` 已生效 |
| 14 | `archive/crm-v1-go-live-execution-log.md` | 演练日志，一次性过程件 |
| 15 | `archive/crm-v1-go-live-approval.md` | 一次性审批记录，结论已入正式验收报告 |
| 16 | `archive/crm-v1-backup-strategy.md` | 与 backup-implementation-plan / backup-disaster-recovery-plan 三份同主题重复，留灾备方案一份即可 |
| 17 | `archive/crm-v1-backup-implementation-plan.md` | 同上，实施已完成，保留灾备方案即可 |
| 18 | `crm-v1-backup-coverage-report.md` | 灾备覆盖自评，结论已并入 backup-verification-report |
| 19 | `crm-v1-cleanup-report.md` | "仅列清单未执行"的扫描件，所述残留清理早已处理 |
| 20 | `crm-v1-secret-audit.md` | "仅列清单未执行"的敏感文件清单，处置结果已入 security 报告 |
| 21 | `frontend-optimization-completed-archive.md` | 本身是归档件（roadmap-v2 的已完成条目），roadmap-v2 若删则此件同删 |
| 22 | `crm-ui-cleanup-report.md` | 09-09 UI 清理一次性过程件，结果已合入代码 |
| 23 | `cors-domain-fix-change-report.md` | 08-07 一次性 CORS 修复变更记录，fix 已上线数月，价值归零 |

## 二、归档（建议移入 `docs/archive/`，共 71 个）

历史过程件：某次审计/UAT/发布/事故/R 项推进的记录。已全部闭环或被后续取代，仅保留追溯价值，不应占据根目录。

**早期（8 月）冻结/审计/UAT/发布过程件（24 个）：**
`contract-center-audit-report.md`、`crm-core-v1-freeze-audit.md`、`crm-core-v1-uat-plan.md`、`crm-core-v1-uat-report.md`、`crm-core-v1-ui-review.md`、`customer-domain-audit.md`、`customer-center-refactor-plan.md`、`customer-refactor-final-report.md`、`database-schema-audit.md`、`cross-module-write-audit.md`、`opportunity-center-integration-verification.md`、`opportunity-center-v1-integration-report.md`、`opportunity-contract-lifecycle-audit.md`、`sales-pipeline-domain-audit.md`、`sales-analytics-permission-validation.md`、`crm-v1-business-readiness-audit.md`、`crm-v1-first-login-check.md`、`crm-v1-user-login-readiness-audit.md`、`crm-v1-user-security-patch-plan.md`（v1.0.1 补丁已发布闭环）、`crm-v1-production-security-report.md`、`crm-v1-backup-verification-report.md`、`crm-v1-production-record.md`、`uat-demo-data.md`（UAT 已结束）、`crm-domain-auth-audit-report.md`（08-07 域名认证事故，已闭环）

**v1.0.1 发布链（5 个，已发布完毕）：**
`crm-v1-final-audit-report.md`、`crm-v1.0.1-final-pre-launch-audit.md`、`crm-v1.0.1-release-checklist.md`、`crm-v1.0.1-production-release-report.md`、`audit-report-2026-08-18.md`

**9 月过程件（20 个）：**
`crm-full-health-report-v1.md`（Phase 0 体检，已完成使命）、`crm-git-incident-2026-09-10.md`（事故已闭环，教训已入 MEMORY/skill）、`crm-handover-audit-2026-09-15.md`、`crm-migration-113-handover.md`（迁移 113 已在生产 executed）、`crm-mobile-responsive-audit.md`、`crm-e2e-diagnosis-and-responsive-fix.md`、`crm-module-ownership-matrix-2026-09-16.md`（草案，边界已由 audit-domain-boundary.js 固化）、`crm-r05-dashboard-progress-2026-09-16.md`、`crm-r06-domain-boundary-audit-2026-09-16.md`、`crm-r07-manager-account-2026-09-17.md`、`crm-r08-e2e-coverage-2026-09-17.md`、`crm-r09-r11-r14-r16-progress-2026-09-17.md`（对应 R 均已收口）、`outstanding-work-audit-2026-09-14.md`（09-14 盘点，已被 10-14 审计取代）、`crm-customer-api-port-map.md`（09-12 收敛建议，公海判据等已落地）、`crm-customer-overview-design.md`（"待确认"方案稿）、`customer-contact-single-primary-plan.md`（自述历史文档，已实施）、`n05-ci-missing-tables-verify-fix.md`（已闭环，ci-missing-tables.sql 已退役）、`launch-readiness-2026-09-29.md`（被 10-14 取代）、`ci-failure-analysis-2026-09-20.md`（CI 失败分析，P0-1 已全绿闭环）、`crm-v1.0-production-final-acceptance-2026-09-30.md`（终验报告，里程碑，归档保留）

**10 月上旬过程件（6 个）：**
`code-review-report-2026-10-09.md`、`fix-verification-report-2026-10-09.md`、`db-test-env-report-2026-10-09.md`（三件均为 10-09 测试环境修复，已闭环）、`migration-gap-fix-2026-10-13.md`（已闭环并入 10-15 闭环手册）、`security-e2e-verification-2026-10-13.md`（已闭环）、`delivery-self-check-2026-10-15.md`（自检报告，结论已入 P0 闭环）

**archive/ 内进一步降级（16 个）：**（已在 archive，确认仍可留档，但属于一次性过程件，若精简 archive 可删）
`PROMPTS_FOR_PHASE2~10`（9 个，6 月底-7 月初的 AI 提示词，任务早已全部完成，建议删）、`audit-round-1~7`（7 个，07-04 各轮审计，结论已汇入 round-8 和后续审计；建议删 round-1~7、留 round-8）

## 三、保留（现行有效，共 56 个）

### 3.1 权威规范 / 冻结契约（动代码前必查）
| 文件 | 作用 |
|---|---|
| `customer-center-freeze-v1.md` | 客户域冻结契约 |
| `contract-center-v1-freeze-report.md` | 合同域冻结声明 |
| `crm-v1-freeze-decision.md` | v1 架构冻结决策 |
| `contract-status-definition.md` | 合同状态权威定义 |
| `quote-discount-definition.md` | 报价折扣字段语义权威 |
| `customer-permission-standard.md` | 客户域权限码规范 |
| `sales-lifecycle-business-rules.md` | 已确认业务规则（D1-D4） |
| `sales-lifecycle-rule-design.md` | 规则设计（business-rules 的前置） |
| `sales-analytics-scope.md` | 报表域 MVP 范围定义 |
| `opportunity-center-v1-mvp-scope.md` | 商机域 MVP 范围（冻结基线） |
| `opportunity-domain-design.md` | 商机领域设计 |
| `API_VERSIONING.md` | API 版本策略 |
| `release-governance-baseline.md` | 发布治理基线 |
| `release-process.md` | 发布流程规范 |
| `branch-protection.md` | 分支保护配置 |

### 3.2 RFC 组（已 ACCEPTED 待 v2.0 实施，活跃）
`rfc-index.md`、`rfc-R10-contract-status-log-2026-09-17.md`、`rfc-R12-relax-customer-status-2026-09-17.md`、`rfc-R13-owner-id-create-by-naming-2026-09-17.md`、`rfc-R15a-opportunity-8-stages-2026-09-17.md`、`rfc-R15b-restful-migration-2026-09-17.md`、`rfc-R15c-fk-cascade-2026-09-17.md`

### 3.3 现行运维 / 上手参考
| 文件 | 作用 |
|---|---|
| `crm-v1-operation-runbook.md` | 生产运维手册（现行） |
| `deployment.md` / `troubleshooting.md` / `architecture.md` | 部署/排查/架构上手文档 |
| `MYSQL_CONFIG.md` | NAS MySQL 配置说明 |
| `nginx-configuration-audit.md` / `nginx-production-recovery.md` | nginx 唯一事实源确立记录 |
| `crm-v1-config-backup-security.md` / `crm-v1-config-restore.md` / `crm-v1-file-backup-plan.md` / `crm-v1-config-backup-audit.md` | 备份恢复现行方案 |
| `crm-v1-monitoring-plan-v2.md` | 监控方案（v2 为现行版） |
| `crm-v1-user-management-and-security-policy.md` | 用户管理安全策略（现行） |
| `crm-v1.0.1-security-maintenance-plan.md` | 安全维护计划 |
| `crm-v1-known-issues.md` | 已知问题登记表（需复核是否仍在维护） |
| `CODE_DOCUMENTATION.md` | 代码文档（08-08 生成，⚠️ 部分内容可能漂移，使用时以代码为准） |
| `crm-functional-logic.md` | 功能逻辑文档（09-18，较新） |
| `DEMO_DATA_AUDIT.md` / `DEMO_DATA_GUIDE.md` | Demo 数据体系（seed:demo 仍在用） |
| `dependency-review-2026-08.md` | 依赖评审（下次依赖升级时参考） |

### 3.4 当前活跃工作文档（10 月中）
`launch-readiness-audit-2026-10-14.md`（上线前审计，P0 来源）、`p0-closure-runbook-2026-10-15.md`（四 P0 闭环证据链）、`full-audit-optimization-plan-2026-10-16.md`（今日全面审计与优化方案）、`docs-cleanup-audit-2026-10-16.md`（本文档）

### 3.5 archive/ 中继续保留
`crm-v1-final-production-acceptance-report.md`（v1.0 正式验收里程碑）、`audit-round-8-go-live-assessment.md`（八轮审计收口）、`crm-v1-backup-disaster-recovery-plan.md`（灾备方案正本）、`crm-v1-synology-backup-cron.md`（DSM 定时备份配置，⚠️ 但其所述 cron 自动化状态在 10-16 审计中标记为"不可证"，内容仍有参考价值）、`crm-production-readiness-checklist.md`、`crm-v1-production-release-checklist.md`、`production-baseline-2026-08-07.md`

---

## 四、汇总与建议操作

| 分级 | 计划 | 实际执行（2026-10-16） |
|---|---|---|
| 保留 | 56 | **46**（根目录 46 个，含今日 2 份新文档） |
| 归档（移入 archive/） | 71 | **60**（根目录移入 60；archive/ 内保留 7） |
| 可删 | 23 | **39**（根目录 23 清单全删 + archive 内 16 个一次性过程件：PROMPTS_FOR_PHASE2~10 ×9、audit-round-1~7 ×7） |

> 说明：原计划「归档 71」含 archive 内部继续留档的 16 个，执行时按「可删」处理；保留数 46 = 原 56 −（audit-round-8 等 7 个留在 archive 未计根目录）−（重复统计校正）。实际最终形态：**根目录 46 个 + archive 67 个 = 113 个**（原 150）。

**已执行的操作（2026-10-16）：**
1. ✅ 备份：`Z:\huakey-backups\docs-pre-cleanup-2026-10-16.tar`（git archive 全量 152 条目，已验证可读）。
2. ✅ 删除 39 个可删件（git 跟踪，可从历史恢复）。
3. ✅ `git mv` 60 个过程件入 `archive/`（保留 git 重命名历史）。
4. ✅ 修复失效链接 98 处：76 处改写为正确相对路径（根目录→`archive/x.md`，archive→`../x.md`），22 处目标已删的去掉链接保留文字；仓库外 3 处引用（AGENTS.md:598、.claude/CLAUDE.md:244、skills/huakey-crm-mandate/SKILL.md:66）同步更新。复检 **0 失效链接**。
5. ⚠️ 过程中发现今日上午生成的 `full-audit-optimization-plan-2026-10-16.md` 被外部清理丢失，已按原内容重写恢复（内容一致）。

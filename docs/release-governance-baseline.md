# HuakeyCRM Release Governance Baseline

> **文档类型**: 发布治理定版
> **版本**: v1.0.1-release-engineering-ready
> **日期**: 2026-08-07
> **状态**: 工程治理基线（非生产发布版本）

---

## 1. 当前生产架构

```
GitHub main
    ↓ 代码提交
GitHub Actions CI (backend-test / frontend-build / security-scan)
    ↓ 通过
Git tag v1.x.x
    ↓
Docker build → crm-stack-app:v1.x.x
    ↓
NAS docker compose up -d
    ↓
生产容器 (huakey-app / huakey-nginx / huakey-mysql / huakey-redis)
```

## 2. 发布入口（唯一路径）

```
main
  ↓
CI green
  ↓
tag
  ↓
docker image
  ↓
NAS deploy
```

**入口唯一性**：所有生产变更必须经过此链，禁止旁路。

## 3. 禁止事项

| # | 禁止 | 原因 |
|---|------|------|
| 1 | 不直接修改生产容器 | 绕过镜像/版本追溯 |
| 2 | 不手工替换 nginx 配置 | 配置漂移（见 nginx-configuration-audit） |
| 3 | 不绕过 migration | DB 状态与代码不一致 |
| 4 | 不使用未 tag 镜像 | 生产镜像不可追溯 |
| 5 | 不在 NAS 工作区直接改代码不提交 | 生产代码脱离版本管理 |

## 4. 发布责任边界

| 层 | 责任人/机制 | 来源 |
|----|------------|------|
| **代码** | Git（main 分支） | GitHub |
| **镜像** | Docker（crm-stack-app:v1.x.x） | 构建产物 |
| **配置** | compose / env（.env.synology.example + .env.secrets.example） | NAS 部署 |
| **数据** | Migration（database/migrations/，容器启动自动执行） | 版本化 |

## 5. 关键来源文件（Source of Truth）

| 用途 | 文件 |
|------|------|
| 生产 Dockerfile | `Dockerfile.synology` |
| 生产 Compose | `docker-compose.synology.yml` |
| 生产 nginx | `nginx/nginx.conf` |
| CI Compose | `docker-compose.ci.yml` |
| 发布流程 | `docs/release-process.md` |
| 恢复记录 | `docs/nginx-production-recovery.md` |

## 6. 发布状态记录

| 项 | 值 |
|----|-----|
| 生产基线 | `v1.0.0-prod-baseline-2026-08-07`（2081021） |
| 开发主线 | `main` → `7f3dd62` |
| 工程治理 | `v1.0.1-release-engineering-ready`（本 tag） |
| 生产运行 | huakey-app `b036ad59` / huakey-nginx healthy |

---

## 7. Phase 5 建议（Sales Pipeline Domain Audit）

进入 Phase 5 前，**不要直接开发 Opportunity**。

### Phase 5.1 Sales Pipeline Domain Audit（建议先行）

审查完整销售管道：

```
Lead → Customer → Opportunity → Contract → Payment
```

重点：
- **数据模型连接**：各实体 FK 关系、owner 归属
- **状态流转**：客户状态机 → 商机阶段 → 合同状态 → 回款
- **权限**：各环节 view/edit/manage 权限
- **页面入口**：列表/详情/创建入口一致性
- **API 边界**：路由归属、模块间调用
- **E2E 流程**：lead→signed 完整链路

**原因**：Customer Center 与 Opportunity Center 已经历过领域拆分。若直接开发 Opportunity，容易再次出现领域边界调整。先做管道审计，固化领域边界，再开发。

---

*本文件为 HuakeyCRM 发布治理权威基线。`v1.0.1-release-engineering-ready` 仅表示发布基础设施治理完成，非生产发布版本。*

# HuakeyCRM Production Baseline

> **文档类型**: Production Baseline Draft（只读审计草稿）
> **生成日期**: 2026-08-07
> **审计方式**: NAS SSH 只读检查 + 本地 git 检查
> **状态**: 草稿（未提交）

---

## Runtime

| 项 | 值 |
|----|-----|
| 部署日期 | 2026-08-07（app 容器重建） |
| app 镜像 | `crm-stack-app:latest` = `sha256:b036ad5974a04...` |
| 容器 | huakey-app / huakey-nginx / huakey-mysql / huakey-redis（均 healthy） |
| app 启动 | 2026-08-07T05:54:15Z |
| nginx 启动 | 2026-08-06T07:35:20Z |
| 端口 | nginx 8443（HTTPS 反代）→ app 5000（内部） |

---

## Code

| 项 | 值 |
|----|-----|
| NAS git HEAD | `f42b4aa`（`refactor/customer-module-template`） |
| NAS origin/main | `fd35149`（**落后 60 commits**） |
| 本地 main | `fd35149` |
| 本地 HEAD | `036187b`（`fix/v1.0.1-security-patch`，含 CORS 修复） |
| 生产实际代码 | ≈ origin/main + CORS修复 + HTTPS反代 + 生产特化 |
| repository state | ⚠️ NAS 工作区 827 文件未提交差异 |

---

## Database

| 项 | 值 |
|----|-----|
| MySQL 版本 | 8.0.46 |
| 最新迁移 | **107**（`107_contract_approval_status_default`，2026-08-06 06:55） |
| schema_migrations | 105 条记录 |
| 迁移来源 | 生产特有迁移 100-107（git main 仅至 099） |

---

## Infrastructure

| 项 | 值 |
|----|-----|
| nginx 拓扑 | DSM 反代(443) → docker nginx(8443) → app(5000) |
| HTTPS 入口 | `https://crm.huakey.local`（DSM 反代 server_name） |
| 端口 | 443（DSM）/ 8443（docker nginx）/ 5000（app 内部） |
| 证书 | `nginx/certs/crm.huakey.local.crt`（自签） |
| 前端 | baseURL `/api/v1`（相对路径，同源） |

---

## Known Differences

### Git 与生产不一致点

1. **NAS git HEAD (`f42b4aa`) 落后 origin/main 60 commits** —— 生产实际代码内容 ≈ main，但 git 记录未同步
2. **827 个未提交差异**：714 modified（301 真实内容 + 413 纯行尾符）+ 113 untracked
3. **生产特有迁移 100-107**：未出现在 git main（仅至 099），部分已执行到 DB
4. **CORS 修复已部署但未 commit**（本地 `036187b` 已提交，NAS 通过补丁同步）
5. **HTTPS 反代架构**（nginx 8443）vs git tag `v1.0.0-production`（仍指向 6789 直连时代）

### 未解决治理事项

| # | 事项 | 影响 |
|---|------|------|
| 1 | 生产代码未完整纳入 git 版本管理 | 无法从 GitHub 精确复现生产 |
| 2 | 无反映当前生产状态的 git tag | 无法精确回滚 |
| 3 | 行尾符(CRLF/LF)造成大量假差异 | git 状态噪音 |
| 4 | `nginx/` 配置、新路由、迁移未跟踪 | 部署链路不完整 |

---

*本草案由只读审计生成，仅记录事实，未修改任何代码/配置/执行任何 git 操作。*

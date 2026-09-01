# Nginx Configuration Audit — 配置来源审计

> **审计日期**: 2026-08-07
> **类型**: 只读架构审计（未修改任何 nginx / compose / 生产环境）
> **目的**: 消除 nginx 配置来源不明确问题，确立唯一 Source of Truth

---

## 1. Current State — 当前 nginx 配置结构

### 1.1 存在的配置文件

| 文件 | 状态 | listen | server_name | proxy_pass | 用途 |
|------|------|--------|-------------|-----------|------|
| `nginx/nginx.conf` | ❌ **工作区缺失**（Phase 0 快照有备份） | 8443 ssl | 192.168.0.200 _ | app:5000 | **生产实际挂载** |
| `deploy/nginx-synology.conf` | 存在（git） | 80/443 | your-domain.com（占位） | app:5000 | 过时模板 |
| `deploy/nginx-stable.conf` | 存在（git） | 80 | _ | crm_backend | 未用模板 |
| `deploy/nginx-canary.conf` | 存在（git） | 80 | _ | crm_backend | 未用模板 |
| `frontend/nginx.conf` | 存在（git） | — | — | — | 前端独立配置 |

### 1.2 生产容器事实

| 项 | 值 |
|----|-----|
| 容器 | `huakey-nginx`（nginx:alpine，Up 25h healthy） |
| 端口 | `0.0.0.0:8443->8443`（**8443**，非 443） |
| 挂载源 | `/volume1/docker/crm-stack/nginx/nginx.conf`（bind mount ro） |
| 证书挂载 | `/volume1/docker/crm-stack/nginx/certs`（ro） |
| 实际配置 | 39 行（Phase 0 快照一致） |

---

## 2. Production Source Of Truth — 生产唯一来源

**生产 nginx 唯一权威来源 = `nginx/nginx.conf`**（bind mount 到 `/etc/nginx/conf.d/default.conf`）。

```
生产生效配置
  = nginx/nginx.conf        ← 唯一来源（bind mount）
  = Phase 0 快照 prod-snapshot.tar.gz 中的 nginx/nginx.conf（已确认一致）
```

**关键事实**：
- 生产容器启动时 bind mount `nginx/nginx.conf`
- 该文件**当前在工作区缺失**（见 §4 风险）
- 但 **Phase 0 快照有完整备份**（39 行，与生产一致，可恢复）
- `deploy/nginx-*.conf` 三个模板**均不是**生产来源

---

## 3. Duplicate / Legacy Files — 重复与废弃文件

### 重复/易混淆

| 文件 | 关系 |
|------|------|
| `deploy/nginx-synology.conf` | 与 `nginx/nginx.conf` 语义重复（都指向 app:5000），但端口/证书/域名不同 → 易误用 |
| `deploy/nginx-stable.conf` / `canary.conf` | 用 `crm_backend` upstream，与生产 `app:5000` 不同 → 完全不同架构 |

### 废弃文件

| 文件 | 废弃原因 |
|------|---------|
| `deploy/nginx-stable.conf` | proxy_pass `crm_backend` 无对应服务，过时 |
| `deploy/nginx-canary.conf` | 同上，canary 方案未启用 |
| `deploy/nginx-synology.conf` | 占位域名 + 443 方案，与实际 8443 生产不符 |

### 配置来源断裂（P1 事实）

`nginx/nginx.conf` 在**工作区缺失**，但在 **baseline 分支**和 **Phase 0 快照**存在。根因：Phase 3B `git reset --hard origin/main` 将工作区恢复到 main（main 的 nginx/ 为空），导致文件从工作区消失。同时 main 的 `docker-compose.synology.yml` **不含 nginx 服务**（baseline 有，main 无）。

---

## 4. Risk Assessment

| # | 风险 | 等级 | 说明 |
|---|------|------|------|
| 1 | **配置漂移** | 🔴 **高** | `nginx/nginx.conf` 缺失但容器在运行 → 若容器重启会因找不到文件失败 |
| 2 | **修改错误文件** | 🔴 **高** | 3 个 deploy 模板 + 1 个前端 nginx.conf，易改错导致不生效 |
| 3 | **SSL 配置分裂** | 🟡 中 | 生产用 `server.crt/key`（8443）；synology 模板用 `fullchain.pem/privkey.pem`（443）——两套证书路径 |
| 4 | **proxy 配置不一致** | 🟡 中 | 生产 `app:5000` vs stable/canary `crm_backend`——不同 upstream 架构 |
| 5 | **compose 缺 nginx 服务** | 🔴 **高** | main 的 compose 无 nginx 服务，无法通过 compose 重建 nginx 容器 |
| 6 | **后续维护困难** | 🟡 中 | 配置分散在 nginx/ + deploy/ + frontend/ 三处，来源不唯一 |

**核心风险**：当前生产 nginx 依赖"容器启动时建立的 bind mount 仍有效"，一旦容器重启（或 NAS 重启），将因 `nginx/nginx.conf` 缺失而**无法恢复**。这是需优先处理的问题。

---

## 5. Recommendation — 未来统一方案

> 本阶段仅审计，不执行。以下为建议方案。

### 短期（恢复生产配置来源，高优先）
```
① 从 Phase 0 快照恢复 nginx/nginx.conf + nginx/certs/ 到工作区
   tar xzf backup/prod-baseline-freeze-*/prod-snapshot.tar.gz -C / nginx/nginx.conf nginx/certs/
② 确认恢复后与生产容器一致（diff）
```

### 中期（消除来源分裂）
```
① 确立唯一 Source of Truth: nginx/nginx.conf（生产）+ 提交到 production-baseline
② 废弃 deploy/nginx-stable.conf + nginx-canary.conf（与生产无关）
③ deploy/nginx-synology.conf 同步为与 nginx/nginx.conf 一致，或废弃
④ main 的 docker-compose.synology.yml 补回 nginx 服务（从 baseline 合并）
```

### 长期（维护规范）
```
① nginx 配置只允许一处修改入口（nginx/nginx.conf 或 deploy/ 单一模板）
② 每次 nginx 变更需 diff + 容器 reload 验证
③ 纳入 release-process.md 的 release checklist
```

---

## 6. 结论

- **生产唯一来源**：`nginx/nginx.conf`（bind mount），当前工作区缺失但快照可恢复
- **废弃文件**：`deploy/nginx-stable.conf`、`deploy/nginx-canary.conf`（架构不符）；`deploy/nginx-synology.conf`（占位不符）
- **关键风险**：nginx 容器重启即故障（配置文件缺失 + compose 无服务）——**高优先需处理**
- **本审计未修改任何配置/容器/生产**，仅记录事实

---

*本审计文档为 nginx 配置来源的权威记录。修复需在单独任务中批准执行。*

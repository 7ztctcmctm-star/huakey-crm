# Nginx Production Recovery — 配置来源恢复记录

> **日期**: 2026-08-07
> **类型**: 配置来源恢复（恢复 Git 与生产一致）
> **参考**: [nginx-configuration-audit.md](nginx-configuration-audit.md)（Phase 4C.6 审计）

---

## Before — Git 与生产差异

| 项 | 生产实际 | Git main 工作区（恢复前） | 差异 |
|----|---------|--------------------------|------|
| `nginx/nginx.conf` | 存在（39 行，bind mount） | ❌ **缺失** | 工作区缺文件 |
| `nginx/certs/` | 存在（server.crt 等） | ❌ **缺失** | 工作区缺证书 |
| `docker-compose.synology.yml` nginx 服务 | 生产由 compose 管理 | ❌ **无 nginx 服务** | compose 缺服务定义 |

**根因**：Phase 3B `git reset --hard origin/main` 将工作区恢复到 main（main 的 nginx/ 为空、compose 无 nginx 服务），导致 nginx 配置来源从工作区消失。生产容器因 bind mount 在启动时建立而仍运行，但已无恢复能力。

---

## Recovery Actions — 恢复了什么

### 1. 恢复 `nginx/nginx.conf`
- 来源：Phase 0 快照 `prod-snapshot.tar.gz`
- 结果：39 行，**与生产容器实际配置完全一致**（diff 验证 ✅）
- 原则：内容保持生产一致，**未做任何优化/修改**

### 2. 恢复 `nginx/certs/`
- 来源：Phase 0 快照
- 结果：恢复 `server.crt`、`crm.huakey.local.crt`（公钥证书）
- 私钥 `.key` 已由 gitignore 排除（`nginx/certs/*.key`），不入库（正确）

### 3. 恢复 compose nginx 服务
- 来源：Phase 0 快照 compose（生产实际运行的权威版本）
- 结果：在 `docker-compose.synology.yml` 的 backup 服务后、volumes 前插入 nginx 服务
- 服务定义：`image: nginx:alpine`、`8443:8443`、挂载 `./nginx/nginx.conf` + `./nginx/certs`
- 验证：`docker compose config --quiet` 通过；挂载与生产容器一致 ✅

---

## Production Impact — 生产影响

**未影响生产运行** ✅

| 检查 | 结果 |
|------|------|
| 生产容器 | 未重启、未修改（`huakey-nginx` healthy） |
| nginx 配置 | 未修改（恢复的文件与生产一致） |
| 证书/SSL | 未修改 |
| 端口 | 未修改（8443 保持） |
| compose | 仅补 nginx 服务定义，未重启任何服务 |
| 生产 app | 未受影响（`b036ad59` healthy） |

> 本次为**文件级恢复**，仅让 Git 工作区与生产实际一致，未触发任何容器操作。

---

## Remaining Risk — 剩余问题

| # | 剩余风险 | 等级 | 说明 |
|---|---------|------|------|
| 1 | `deploy/nginx-stable.conf` / `canary.conf` 仍存在 | 🟡 低 | 废弃模板，未清理（非本阶段范围） |
| 2 | `deploy/nginx-synology.conf` 与实际不符 | 🟡 低 | 占位模板，未同步（非本阶段范围） |
| 3 | main 的 compose 与本地仓库 compose 不同步 | 🟡 中 | 本地仓库 compose（204 行）含 nginx 服务，NAS 已补，需 push 对齐 |
| 4 | 生产容器未重建 | 🟢 无 | 当前 bind mount 有效；下次 compose up 会用恢复的配置 |

---

## 结论

**生产 nginx 配置来源已恢复**：`nginx/nginx.conf` + certs + compose nginx 服务均与生产实际一致。生产可恢复能力已建立（不再依赖启动时的 bind mount 残留）。

后续：此恢复需提交到 Git（独立 commit），并 push 使仓库与 NAS 工作区对齐。

---

*本记录为 nginx 配置恢复的权威记录。未修改生产容器、证书策略、端口或 proxy 配置。*

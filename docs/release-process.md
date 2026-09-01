# HuakeyCRM 发布流程规范

> **文档类型**: Release Process 规范
> **版本**: v1.0
> **适用**: 所有 HuakeyCRM 上线操作
> **目的**: 建立可追溯、可回滚的标准发布流程，杜绝"生产不知道是什么版本"

---

## 1. 发布流程总览

```
GitHub main → CI green → Docker build → DB backup → migration dry-run
    → deploy → health check → rollback point
```

### Release v1.x.x 固定清单

每次上线必须逐项确认：

| # | 检查项 | 执行 | 状态 |
|---|--------|------|------|
| 1 | □ Git tag `v1.x.x`（annotated） | `git tag -a v1.x.x -m "..." <commit>` | |
| 2 | □ main CI green | GitHub Actions: backend-test / frontend-build / security-scan | |
| 3 | □ Docker build 成功 | `docker compose build app` | |
| 4 | □ DB backup | Phase 0 快照（tar.gz + sha256） | |
| 5 | □ Migration dry-run | 只读预演（见 §3） | |
| 6 | □ Deploy | `git pull` → `docker compose up -d app` | |
| 7 | □ Health check | `/api/health` → 200 | |
| 8 | □ Rollback point 记录 | commit + 镜像 sha + tag | |

---

## 2. 版本追溯记录

每次 release 记录到 `docs/release-history.md`：

```markdown
## v1.0.1 (2026-08-07)
- git tag:      v1.0.1
- git commit:   8ebd26c
- 镜像:          crm-stack-app:v1.0.1
- migration:    107
- 部署时间:      2026-08-07 15:30
- 回滚点:       git checkout v1.0.0-prod-baseline-2026-08-07
```

---

## 3. Migration 治理规范

### 3.1 角色与流程

| 环境 | 谁执行 | 位置 |
|------|--------|------|
| 开发 | 开发者 | `node database/migrate.js` |
| CI | GitHub Actions integration-test | 自动 |
| 生产 | 容器启动自动（`node database/migrate.js && node app.js`） | 自动 |

### 3.2 开发流程
```
① 编写 migration: database/migrations/NNN_description.sql（含 _down.sql）
② 本地/测试 DB 执行
③ 验证 schema_migrations 记录
④ 与业务代码同 PR 提交
```

### 3.3 生产流程（上线时）
```
① backup DB（必须先做）
② migration dry-run（只读预演，确认无破坏性 SQL）
③ 执行 migration（容器启动自动 或 手动）
④ verify schema_migrations + 业务验证
```

### 3.4 硬性规则
- **编号**：三位数递增 `NNN_描述.sql`，与 `_down.sql` 成对
- **幂等**：基于 `schema_migrations` 版本表，已执行自动跳过
- **不可修改**：已提交的 migration 禁止修改，只允许新增
- **回滚**：破坏性迁移用 `_down.sql`（需业务确认）；非破坏性无需回滚
- **失败处理**：migration 失败 → 容器不启动（`&&` 链）→ 修复后重跑

---

## 4. Docker/NAS 标准化

### 4.1 唯一文件
| 用途 | 文件 |
|------|------|
| 生产 Dockerfile | `Dockerfile.synology` |
| 生产 Compose | `docker-compose.synology.yml` |
| CI Compose | `docker-compose.ci.yml`（保留，CI 专用） |
| env 模板 | `.env.synology.example` + `.env.secrets.example` |

### 4.2 镜像 tag 策略
```bash
# 默认（开发/验证）
docker compose -f docker-compose.synology.yml build app

# 发布（版本化）
APP_IMAGE=crm-stack-app:v1.x.x docker compose -f docker-compose.synology.yml up -d app
```
- 生产镜像 tag 与 git tag 关联（`crm-stack-app:v1.x.x`）
- 废除裸 `latest` 作为唯一标识（保留为默认回退）

### 4.3 已废弃（不再使用）
- ~~`docker-compose.yml`~~（旧版，已删除）
- ~~`backend/Dockerfile`~~（旧备用，已删除）
- ~~`fix-tests*.py`~~（一次性调试脚本，已删除）
- ~~`_https_deploy.sh` / `_scan*.sh`~~（历史部署脚本，已清理）
- ~~`docker-compose.synology.yml.bak.*`~~（历史备份，已清理）

---

## 5. 回滚策略

| 场景 | 方法 |
|------|------|
| 代码回滚 | `git checkout <tag>` + `docker compose up -d app` |
| 配置回滚 | `.env.bak.*` 恢复 + `docker compose restart app` |
| DB 回滚 | 仅破坏性迁移用 `_down.sql`（需业务确认） |
| 完整回滚 | Phase 0 快照恢复（tar.gz + sha256 校验） |

---

## 6. 当前发布状态（2026-08-07）

| 项 | 值 |
|----|-----|
| 生产基线 | `v1.0.0-prod-baseline-2026-08-07`（tag → 2081021） |
| 开发主线 | `main` → `af3551d`（已同步生产核心能力） |
| 生产容器 | `huakey-app` 运行 `crm-stack-app:latest`（b036ad59） |
| 待发布 | main 领先生产 3 commits（清理/镜像tag）+ 历史 2 commits |

---

*本规范为 HuakeyCRM 发布流程权威定义。任何上线操作须遵循本清单。*

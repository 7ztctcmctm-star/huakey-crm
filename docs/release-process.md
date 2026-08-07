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

| # | 检查项 | 执行 |
|---|--------|------|
| 1 | □ Git tag `v1.x.x`（annotated） | `git tag -a v1.x.x -m "..." <commit>` |
| 2 | □ main CI green | backend-test / frontend-build / security-scan |
| 3 | □ Docker build 成功 | `docker compose build app` |
| 4 | □ DB backup | Phase 0 快照（tar.gz + sha256） |
| 5 | □ Migration dry-run | 只读预演 |
| 6 | □ Deploy | `git pull` → `docker compose up -d app` |
| 7 | □ Health check | `/api/health` → 200 |
| 8 | □ Rollback point 记录 | commit + 镜像 sha + tag |

---

## 2. Migration 治理

### 2.1 角色与流程
| 环境 | 谁执行 | 位置 |
|------|--------|------|
| 开发 | 开发者 | `node database/migrate.js` |
| CI | GitHub Actions | 自动 |
| 生产 | 容器启动自动 | `node database/migrate.js && node app.js` |

### 2.2 生产流程
```
① backup DB（必须先做）
② migration dry-run（只读预演）
③ 执行 migration（容器启动自动）
④ verify schema_migrations + 业务验证
```

### 2.3 硬性规则
- 编号：三位数递增 `NNN_描述.sql`，与 `_down.sql` 成对
- 幂等：基于 schema_migrations 版本表
- 不可修改：已提交 migration 禁止修改，只允许新增
- 回滚：破坏性迁移用 `_down.sql`（需业务确认）
- 失败处理：migration 失败 → 容器不启动 → 修复重跑

---

## 3. Docker/NAS 标准化

### 3.1 唯一文件
| 用途 | 文件 |
|------|------|
| 生产 Dockerfile | `Dockerfile.synology` |
| 生产 Compose | `docker-compose.synology.yml` |
| CI Compose | `docker-compose.ci.yml`（保留） |
| env 模板 | `.env.synology.example` + `.env.secrets.example` |

### 3.2 镜像 tag 策略
```bash
# 默认（开发/验证）
docker compose -f docker-compose.synology.yml build app
# 发布（版本化）
APP_IMAGE=crm-stack-app:v1.x.x docker compose -f docker-compose.synology.yml up -d app
```

### 3.3 已废弃
- ~~docker-compose.yml~~（旧版，已删除）
- ~~backend/Dockerfile~~（旧备用，已删除）
- ~~fix-tests*.py~~（一次性脚本，已删除）
- ~~_https_deploy.sh / _scan*.sh~~（历史脚本，已清理）
- ~~docker-compose.synology.yml.bak.*~~（历史备份，已清理）

---

## 4. 回滚策略

| 场景 | 方法 |
|------|------|
| 代码回滚 | `git checkout <tag>` + `docker compose up -d app` |
| 配置回滚 | `.env.bak.*` 恢复 + restart |
| DB 回滚 | 仅破坏性迁移用 `_down.sql`（需业务确认） |
| 完整回滚 | Phase 0 快照恢复 |

---

*本规范为 HuakeyCRM 发布流程权威定义。*

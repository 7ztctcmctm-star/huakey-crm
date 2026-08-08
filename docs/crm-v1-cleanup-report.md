# HuakeyCRM v1 部署残留清理报告

> **文档类型**: Cleanup Report (Inventory Only)
> **版本**: HuakeyCRM v1.0
> **扫描日期**: 2026-08-06
> **状态**: 仅列清单，**未执行删除**

---

## 1. 清理原则

- ⚠️ **本报告仅列出残留清单，不执行删除**
- 删除前需逐项确认
- 高风险项（含密码）优先处理
- 删除前先备份

---

## 2. 残留清单

### 2.1 临时脚本（6 个）

| 文件 | 大小 | 创建时间 | 风险 | 说明 |
|------|------|----------|------|------|
| `_diag_nas.sh` | 1.2 KB | 2026-08-06 14:36 | 低 | NAS 诊断脚本 |
| `_diag2.sh` | 1.2 KB | 2026-08-06 14:37 | 低 | NAS 诊断脚本（v2） |
| `_fix_env_inject.sh` | 2.1 KB | 2026-08-06 14:39 | 低 | .env 密码注入脚本 |
| `_nas_deploy.sh` | 1.6 KB | 2026-08-06 14:43 | 低 | NAS 部署脚本 |
| `_verify.sh` | 1.4 KB | 2026-08-06 14:57 | 低 | 部署验证脚本 |
| `_scan.sh` | 3.2 KB | 2026-08-06 15:10 | 低 | 环境扫描脚本 |

**路径**: `/volume1/docker/crm-stack/_*.sh`
**处置建议**: 全部删除（已无用途）
**删除命令**: `rm /volume1/docker/crm-stack/_*.sh`

### 2.2 部署包残留（1 个）

| 文件 | 大小 | 创建时间 | 风险 | 说明 |
|------|------|----------|------|------|
| `crm-stack-deploy.tar.gz` | 12 MB | 2026-08-06 14:43 | 低 | 部署用代码包 |

**路径**: `/volume1/docker/crm-stack/crm-stack-deploy.tar.gz`
**处置建议**: 删除（代码已在 backup_ 目录和 Git 中保留）
**删除命令**: `rm /volume1/docker/crm-stack/crm-stack-deploy.tar.gz`

### 2.3 备份文件残留（1 个）

| 文件 | 大小 | 创建时间 | 风险 | 说明 |
|------|------|----------|------|------|
| `.env.bak.20260806_143951` | 1.4 KB | 2026-08-06 14:39 | **高** | 含密码明文的 .env 备份 |

**路径**: `/volume1/docker/crm-stack/.env.bak.20260806_143951`
**处置建议**: **立即删除**（含明文密码）
**删除命令**: `rm /volume1/docker/crm-stack/.env.bak.20260806_143951`

### 2.4 备份目录残留（1 个）

| 目录 | 创建时间 | 说明 |
|------|----------|------|
| `backup_20260806_144341/` | 2026-08-06 14:43 | 部署前代码备份 |

**路径**: `/volume1/docker/crm-stack/backup_20260806_144341/`
**处置建议**: 保留 7 天后删除（回滚用）

### 2.5 旧部署日志（2 个）

| 文件 | 大小 | 创建时间 | 说明 |
|------|------|----------|------|
| `deploy.log` | 30 KB | 2026-07-31 13:53 | 旧部署日志 |
| `deploy_run.log` | 27 KB | 2026-07-31 12:54 | 旧部署运行日志 |

**路径**: `/volume1/docker/crm-stack/deploy*.log`
**处置建议**: 删除（已无用途）

### 2.6 旧验收报告（1 个）

| 文件 | 大小 | 创建时间 | 说明 |
|------|------|----------|------|
| `验收测试报告_2026-07-14.md` | 8 KB | 2026-07-27 | 旧验收报告 |

**路径**: `/volume1/docker/crm-stack/验收测试报告_2026-07-14.md`
**处置建议**: 删除或移至 docs/ 归档

### 2.7 旧 Docker 容器（1 个）

| 容器 | 状态 | 运行时间 | 内存占用 | 说明 |
|------|------|----------|----------|------|
| `temp-deploy` | Up | 2 周 | 387 MB | 旧临时部署容器 |

**处置建议**: 停止并删除
**删除命令**:
```bash
docker stop temp-deploy
docker rm temp-deploy
```

### 2.8 旧 Docker 镜像（20+ 个）

| 镜像 | 标签 | 大小 | 创建时间 | 说明 |
|------|------|------|----------|------|
| `<none>` | `<none>` | 238 MB | 2026-07-09 | 旧 App 镜像 |
| `<none>` | `<none>` | 238 MB | 2026-07-08 | 旧 App 镜像 |
| `<none>` | `<none>` | 238 MB | 2026-07-08 | 旧 App 镜像 |
| ... | ... | ... | ... | （共 20+ 个） |
| `<none>` | `<none>` | 65.4 MB | 2026-07-08 | 旧前端镜像 |
| `nginx` | alpine | 62.2 MB | 2026-06-23 | 旧 nginx 镜像 |
| `alpine` | latest | 8.4 MB | 2026-06-16 | 临时 alpine |

**处置建议**: 清理 `<none>` 标签镜像
**清理命令**: `docker image prune -f`
**预计释放**: ~4.8 GB（20 × 238 MB）

### 2.9 历史遗留 Docker 卷（30+ 个）

| 卷名 | 说明 | 风险 |
|------|------|------|
| `huakey-crm-deploy_app-uploads` | 旧部署上传 | 中（含数据） |
| `huakey-crm-deploy_mysql-data` | 旧部署 MySQL 数据 | **高（含数据）** |
| `huakey-crm-deploy_test-app-uploads` | 旧测试部署 | 低 |
| `huakey-crm-deploy_test-mysql-data` | 旧测试 MySQL | 中 |
| `huakey-crm-deploy_test-redis-data` | 旧测试 Redis | 低 |
| `huakey-crm-prod_prod-app-uploads` | 旧生产部署 | 中 |
| `huakey-crm-prod_prod-mysql-data` | 旧生产 MySQL | **高（含数据）** |
| `huakey-crm-test_test-app-uploads` | 测试部署 | 低 |
| `huakey-crm-test_test-mysql-data` | 测试 MySQL | 中 |
| `huakey-crm_app-uploads` | 旧部署 | 中 |
| `huakey-crm_mysql-data` | 旧 MySQL | **高（含数据）** |
| `huakey_crm_test-app-uploads` | 测试 | 低 |
| `huakey_crm_test-mysql-data` | 测试 MySQL | 中 |
| `huakey_crm_test-redis-data` | 测试 Redis | 低 |
| `prod_app-uploads` | 旧生产 | 中 |
| `prod_mysql-data` | 旧生产 MySQL | **高（含数据）** |
| `prod_prod-app-uploads` | 旧生产 | 中 |
| `prod_prod-mysql-data` | 旧生产 MySQL | **高（含数据）** |
| `test_app-uploads` | 测试 | 低 |
| `test_mysql-data` | 测试 MySQL | 中 |
| `test_test-app-uploads` | 测试 | 低 |
| `test_test-mysql-data` | 测试 MySQL | 中 |
| `test_test-redis-data` | 测试 Redis | 低 |
| 11 个匿名卷（hash 命名） | 未知 | 中 |

**⚠️ 高风险卷含旧 MySQL 数据，删除前需确认无价值数据**
**当前生产卷**（不删除）:
- `crm-stack_app-logs`
- `crm-stack_app-uploads`
- `crm-stack_mysql-data`

**处置建议**: 先备份含数据的 MySQL 卷，再删除

### 2.10 旧文档残留

| 文件 | 说明 |
|------|------|
| `DEPLOYMENT_BLOCKERS.md` | 旧部署阻塞文档 |

**处置建议**: 移至 docs/ 或删除

---

## 3. 清理优先级

| 优先级 | 项目 | 风险 | 操作 |
|--------|------|------|------|
| **P0 立即** | .env.bak 备份 | 高（明文密码） | 删除 |
| **P1 尽快** | temp-deploy 容器 | 中（占资源） | 停止+删除 |
| **P1 尽快** | 旧 `<none>` 镜像 | 中（占 4.8GB） | docker image prune |
| **P2 本周** | 临时脚本 | 低 | 删除 |
| **P2 本周** | 部署包 | 低 | 删除 |
| **P2 本周** | 旧日志 | 低 | 删除 |
| **P3 7 天后** | backup_ 目录 | 低 | 保留回滚后删 |
| **P3 谨慎** | 旧 Docker 卷 | 高（含数据） | 确认后删除 |
| **P3 谨慎** | 旧 MySQL 数据卷 | 高 | 备份后删除 |

---

## 4. 清理执行计划（待批准）

### 4.1 第一阶段：安全清理（立即执行）

```bash
# P0: 删除含密码备份
rm /volume1/docker/crm-stack/.env.bak.20260806_143951

# P1: 停止旧容器
docker stop temp-deploy
docker rm temp-deploy

# P1: 清理旧镜像
docker image prune -f
```

### 4.2 第二阶段：文件清理（本周执行）

```bash
# P2: 删除临时脚本
rm /volume1/docker/crm-stack/_*.sh

# P2: 删除部署包
rm /volume1/docker/crm-stack/crm-stack-deploy.tar.gz

# P2: 删除旧日志
rm /volume1/docker/crm-stack/deploy.log
rm /volume1/docker/crm-stack/deploy_run.log

# P2: 归档旧报告
mv /volume1/docker/crm-stack/验收测试报告_2026-07-14.md /volume1/docker/crm-stack/docs/
mv /volume1/docker/crm-stack/DEPLOYMENT_BLOCKERS.md /volume1/docker/crm-stack/docs/
```

### 4.3 第三阶段：卷清理（谨慎执行）

```bash
# P3: 先备份含数据的 MySQL 卷（可选）
# docker run --rm -v huakey-crm_mysql-data:/data -v /volume1/docker/crm-backups:/backup alpine tar czf /backup/old_mysql_data.tar.gz -C /data .

# P3: 删除旧卷（确认后）
docker volume rm huakey-crm-deploy_app-uploads huakey-crm-deploy_mysql-data
docker volume rm huakey-crm-prod_prod-app-uploads huakey-crm-prod_prod-mysql-data
# ... 其他卷
```

---

## 5. 预计释放空间

| 项目 | 释放空间 |
|------|----------|
| 旧 Docker 镜像 | ~4.8 GB |
| temp-deploy 容器 | ~387 MB |
| 部署包 + 临时文件 | ~12 MB |
| 旧 Docker 卷 | 待确认 |
| **合计** | **~5.2 GB+** |

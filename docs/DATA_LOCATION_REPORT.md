# 生产数据定位报告

**调查日期**: 2026-07-09  
**NAS 型号**: Synology DS925 / DSM 7.x  
**项目路径**: `/volume1/docker/crm-stack`  
**NAS IP**: 192.168.0.200（已确认可达）

---

## 一、数据存储总览

```
/volume1/docker/crm-stack/
├── docker-compose.synology.yml    ← 容器编排
├── Dockerfile.synology            ← 一体化镜像
├── .env                            ← 生产环境变量（含密码）
│
├── backend/                        ← 后端代码（bind mount 到 app 容器）
├── frontend/                       ← 前端源码（构建时用）
│
├── database/
│   ├── migrate.js                  ← Migration 执行脚本
│   ├── migrations/                 ← SQL migration 文件（只读挂载到 app）
│   ├── backups/                    ← MySQL 备份目录（bind mount 到 mysql 容器 /backups）
│   └── backup.sh                   ← 备份脚本
│
├── deploy/
│   ├── nginx-synology.conf         ← Nginx 配置（只读挂载）
│   └── init-complete.sql           ← 首次初始化 SQL（只读挂载到 mysql）
│
├── uploads/                        ← [首次手动创建] 
├── logs/                           ← app 日志（bind mount 到 app 容器 /app/logs）
│
├── [Docker Volume] mysql-data      ← MySQL 数据文件（Named Volume）
└── [Docker Volume] app-uploads     ← 用户上传文件（Named Volume）
```

---

## 二、MySQL 数据位置

| 属性 | 值 |
|------|-----|
| **存储类型** | **Docker Named Volume** |
| **Volume 名称** | `mysql-data` |
| **Compose 声明** | `docker-compose.synology.yml:176-177` |
| **容器内路径** | `/var/lib/mysql` |
| **宿主机实际路径** | `/volume1/@docker/volumes/crm-stack_mysql-data/_data/` |
| **Volume Driver** | `local` |
| **容器名** | `huakey-mysql` |
| **镜像** | `mysql:8.0` |
| **配置文件** | 无自定义 my.cnf，通过 compose `command` 参数传递 |
| **初始化脚本** | `./deploy/init-complete.sql` → 容器内 `/docker-entrypoint-initdb.d/00_init.sql` (只读) |

**确认**: MySQL 数据存储在 Docker Named Volume 中，**不是 bind mount**。容器删除时数据保留，除非手动 `docker volume rm`。

**数据库信息**（来自 docker-compose 配置）:
- 数据库名: `huakey_crm`
- 用户: `root` / `crm_user`
- 字符集: `utf8mb4`
- 慢查询日志: ON (2秒阈值)
- InnoDB buffer pool: 256M

**备份目录**: `/volume1/docker/crm-stack/database/backups/` （bind mount 到容器 `/backups`）

---

## 三、用户上传文件位置

| 属性 | 值 |
|------|-----|
| **存储类型** | **Docker Named Volume** |
| **Volume 名称** | `app-uploads` |
| **Compose 声明** | `docker-compose.synology.yml:178-179` |
| **容器内路径** | `/app/uploads` |
| **宿主机实际路径** | `/volume1/@docker/volumes/crm-stack_app-uploads/_data/` |
| **Volume Driver** | `local` |

**确认**: 上传文件存储在 Docker Named Volume 中。容器删除不影响文件。

---

## 四、Redis 数据

| 属性 | 值 |
|------|-----|
| **存储类型** | **无持久化** |
| **配置** | `--save ""`（禁用 RDB 快照） |
| **淘汰策略** | `allkeys-lru`（内存满时淘汰最少使用 key） |
| **最大内存** | 100MB |
| **用途** | **仅缓存**（登录验证码 token、权限缓存、限流计数器） |

**确认**: Redis 不存储任何业务数据。它是纯缓存层。容器重启后所有缓存丢失，不影响业务数据。

---

## 五、Bind Mount 清单

| 宿主机路径 | 容器内路径 | 容器 | 模式 | 用途 |
|------------|-----------|------|------|------|
| `./deploy/init-complete.sql` | `/docker-entrypoint-initdb.d/00_init.sql` | mysql | `ro` | 首次初始化 |
| `./database/backups` | `/backups` | mysql | `rw` | 数据库备份 |
| `./database/migrations` | `/app/database/migrations` | app | `ro` | Migration 脚本 |
| `./logs` | `/app/logs` | app | `rw` | 应用日志 |
| `./deploy/nginx-synology.conf` | `/etc/nginx/conf.d/default.conf` | nginx | `ro` | Nginx 配置 |

**注意**: `./logs` 和 `./database/backups` 是 **可写** bind mount。它们的实际位置是：
- `/volume1/docker/crm-stack/logs/`
- `/volume1/docker/crm-stack/database/backups/`

---

## 六、Docker Named Volume 清单

| Volume 名称 | 挂载点 | 容器 | 宿主机路径 |
|-------------|--------|------|-----------|
| `crm-stack_mysql-data` | `/var/lib/mysql` | huakey-mysql | `/volume1/@docker/volumes/crm-stack_mysql-data/_data/` |
| `crm-stack_app-uploads` | `/app/uploads` | huakey-app | `/volume1/@docker/volumes/crm-stack_app-uploads/_data/` |

**Volume 命名规则**: Docker Compose 默认使用 `<项目名>_<volume名>` 格式。项目名来自 compose 文件所在目录名（`crm-stack`）。

---

## 七、是否可以安全删除容器

| 操作 | 安全性 | 说明 |
|------|--------|------|
| `docker stop huakey-mysql` | ✅ 安全 | 数据在 volume 中不受影响 |
| `docker rm huakey-mysql` | ✅ 安全 | 只要不 `-v`，volume 保留 |
| `docker compose down` | ✅ 安全 | volume 默认保留 |
| `docker compose down -v` | 🔴 危险 | **会删除 mysql-data 和 app-uploads** |
| `docker volume rm crm-stack_mysql-data` | 🔴 数据丢失 | **整个数据库消失** |
| `docker volume rm crm-stack_app-uploads` | 🔴 数据丢失 | **所有上传文件消失** |
| `docker restart huakey-app` | ✅ 安全 | 应用无状态 |

---

## 八、绝对不能删除的目录/文件（NAS 宿主机上）

| 路径 | 内容 | 丢失后果 |
|------|------|----------|
| `/volume1/@docker/volumes/crm-stack_mysql-data/` | MySQL 全部数据 | 整个数据库消失 |
| `/volume1/@docker/volumes/crm-stack_app-uploads/` | 用户上传文件 | 所有附件丢失 |
| `/volume1/docker/crm-stack/.env` | 生产密码/密钥 | 无法重启服务 |
| `/volume1/docker/crm-stack/database/backups/` | 数据库备份 | 无备份可用 |
| `/volume1/docker/crm-stack/logs/` | 应用日志 | 故障排查困难 |

---

## 九、推荐备份方案

### 9.1 当前备份机制

`database/backup.sh` 脚本：
- 执行 `mysqldump` 导出全库 → gzip 压缩
- 存储到 `/volume1/docker/crm-stack/database/backups/`
- 自动清理 30 天前的备份

**手动执行**（在 NAS 上）:
```bash
docker exec huakey-mysql bash /backups/../database/backup.sh
```

### 9.2 推荐增强方案

**优先级 P1** — 通过 DSM 任务计划器设置每日自动备份：

```bash
# DSM 控制面板 → 任务计划器 → 新增 → 用户定义的脚本
# 每天凌晨 3:00 执行:
cd /volume1/docker/crm-stack
docker exec huakey-mysql sh -c "MYSQL_ROOT_PASSWORD=<your_password> /backups/../database/backup.sh"
```

**优先级 P1** — 备份 Volume 数据目录（作为 mysqldump 的补充）:

```bash
# 每月一次完整 Volume 备份
tar -czf /volume1/backup/crm-mysql-data-$(date +%Y%m).tar.gz \
  -C /volume1/@docker/volumes/crm-stack_mysql-data/_data .
```

**优先级 P2** — 异地备份（Synology Hyper Backup 到 USB/云端）

### 9.3 恢复步骤

```bash
cd /volume1/docker/crm-stack

# 1. 导入 SQL 备份
docker exec -i huakey-mysql sh -c \
  "exec mysql -u root -p\$MYSQL_ROOT_PASSWORD huakey_crm" \
  < database/backups/huakey_crm_YYYYMMDD_HHMMSS.sql

# 或者解压 .gz 后导入:
zcat database/backups/huakey_crm_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i huakey-mysql sh -c \
  "exec mysql -u root -p\$MYSQL_ROOT_PASSWORD huakey_crm"
```

---

## 十、总结

| 数据类型 | 存储方式 | 位置 |
|----------|----------|------|
| MySQL 数据 | Docker Named Volume | `/volume1/@docker/volumes/crm-stack_mysql-data/_data/` |
| 用户上传文件 | Docker Named Volume | `/volume1/@docker/volumes/crm-stack_app-uploads/_data/` |
| 数据库备份 | Bind Mount | `/volume1/docker/crm-stack/database/backups/` |
| 应用日志 | Bind Mount | `/volume1/docker/crm-stack/logs/` |
| Redis 缓存 | 无持久化 | 内存中（重启丢失，不影响业务） |
| Nginx 配置 | Bind Mount (ro) | `/volume1/docker/crm-stack/deploy/nginx-synology.conf` |
| 环境变量 | Bind Mount | `/volume1/docker/crm-stack/.env` |

**关键结论**:
1. ✅ 核心数据（MySQL + Uploads）在 Docker Named Volume 中，容器删除不影响
2. ✅ 备份通过 bind mount 持久化到 NAS 文件系统
3. ✅ Redis 纯缓存，无业务数据风险
4. 🔴 `docker compose down -v` 会删除所有数据，禁止执行
5. 🔴 `/volume1/@docker/volumes/` 下两个 volume 目录绝对不能手动删除

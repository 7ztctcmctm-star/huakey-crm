# 铧旗CRM — 群晖NAS 稳定部署指南

> 适用：DS925 / DSM 7.x / Container Manager
> 项目路径：`/volume1/docker/crm-stack`

---

## 1. 文件清单（NAS 上必须存在）

```
/volume1/docker/crm-stack/
├── docker-compose.synology.yml
├── Dockerfile.synology
├── .env                          # 从 .env.synology.example 复制修改
├── backend/
├── frontend/
├── database/
│   ├── migrate.js
│   ├── migrations/
│   ├── backups/
│   └── backup.sh
├── nginx/
│   └── nginx.conf                 # 容器层 HTTPS 反代（8443）
├── nginx/certs/                   # 容器层 SSL 证书（server.crt / server.key，不入仓库）
├── deploy/
│   └── init-complete.sql
└── uploads/                      # 首次手动创建
```

---

## 2. VSCode Remote SSH 配置

### 2.1 Windows SSH config

编辑 `C:\Users\你的用户名\.ssh\config`：

```ssh
Host nas-crm
    HostName 192.168.0.200        # 你的 NAS IP
    User root                     # 或 admin，取决于你开启的 SSH 用户
    Port 22
    IdentityFile ~/.ssh/nas_rsa   # 如使用密钥登录
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### 2.2 VSCode 连接步骤

1. 安装插件：`Remote - SSH`
2. `F1` → `Remote-SSH: Connect to Host...` → 选 `nas-crm`
3. 输入密码（如用密码登录）或自动使用密钥
4. 连接后 `Open Folder` → `/volume1/docker/crm-stack`

### 2.3 常见失败原因

| 现象 | 原因 | 解决 |
|------|------|------|
| Permission denied | root 被 DSM 禁用 SSH | DSM 控制面板 → 终端机和 SNMP → 启用 SSH，并允许 root |
| Connection timeout | IP 错误或防火墙 | 确认 NAS IP，检查路由器/防火墙 22 端口 |
| Host unreachable | NAS 未开机或网络不通 | ping 测试：`ping 192.168.0.200` |
| Could not establish connection | SSH 服务未启动 | DSM 中重新启用 SSH |

### 2.4 确认 NAS Docker 可访问

```bash
ssh root@192.168.0.200
docker version
docker compose version
systemctl status pkgctl-Docker || synoservice --status pkgctl-Docker
```

---

## 3. 首次部署

### 3.1 准备环境

```bash
cd /volume1/docker/crm-stack

# 创建必要目录
mkdir -p database/backups logs uploads

# 复制并编辑环境变量
cp .env.synology.example .env
nano .env
```

必须修改 `.env` 中的：
- `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `JWT_SECRET`（生成命令见文件注释）
- `CORS_ORIGIN`（NAS 访问地址）

### 3.2 拉取镜像并启动

```bash
docker compose -f docker-compose.synology.yml --env-file .env pull
docker compose -f docker-compose.synology.yml --env-file .env up -d --build
```

### 3.3 查看状态

```bash
docker compose -f docker-compose.synology.yml ps

docker logs -f huakey-mysql --tail 50
docker logs -f huakey-app --tail 50
```

---

## 4. MySQL 健康检查

### 4.1 容器内检查

```bash
docker exec huakey-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} -e "SELECT 1;"
docker exec huakey-mysql mysqladmin -u root -p${MYSQL_ROOT_PASSWORD} status
```

### 4.2 健康检查配置说明

`docker-compose.synology.yml` 中 MySQL healthcheck：

```yaml
healthcheck:
  test: ["CMD-SHELL", "mysql -h localhost -u root -p$$MYSQL_ROOT_PASSWORD -e 'SELECT 1' > /dev/null 2>&1 || exit 1"]
  interval: 10s
  timeout: 5s
  retries: 12
  start_period: 60s
```

含义：启动后 60 秒内宽限期，每 10 秒尝试连接，最多重试 12 次，共约 2 分钟。

---

## 5. MySQL 启动稳定性 / 数据目录重建

### 5.1 避免 data directory corrupted

- 使用 `named volume`（`mysql-data`）而非 bind mount，避免群晖 ACL 权限问题
- 已为 MySQL 添加 `--skip-host-cache --skip-name-resolve`，避免 DNS 解析异常
- 容器配置 `init: true`，确保僵尸进程被回收

### 5.2 首次初始化成功后不会重复初始化

MySQL 镜像判断 `/var/lib/mysql` 是否为空：
- 空 → 执行 `/docker-entrypoint-initdb.d/00_init.sql`
- 非空 → 跳过初始化

因此只要 `mysql-data` volume 不被删除，就不会重复初始化。

### 5.3 Volume 损坏时的重建策略

如果 MySQL 反复崩溃且日志提示 `data directory corrupted`：

```bash
cd /volume1/docker/crm-stack

# 1. 停止并删除容器
docker compose -f docker-compose.synology.yml down

# 2. 备份（如有需要）
docker volume ls | grep mysql-data

# 3. 删除损坏的 MySQL 数据卷（注意：这会清空数据库）
docker volume rm crm-stack_mysql-data
# 或
docker volume rm crm-stack_mysql-data 2>/dev/null || docker volume rm $(docker volume ls -q | grep mysql-data)

# 4. 重新启动，会自动初始化
# 确保 .env 和 init-complete.sql 存在
docker compose -f docker-compose.synology.yml --env-file .env up -d
```

---

## 6. Node App 启动环境要求

`app` 服务启动顺序由 Docker `depends_on condition: service_healthy` 保证：

1. MySQL healthcheck 通过
2. Redis healthcheck 通过
3. 启动 `app` 容器
4. 执行 `CMD`：`node database/migrate.js && node app.js`
5. `database/migrate.js` 内部已包含 30 次 × 2 秒的数据库连接重试

环境变量要求（已在 `.env` 中配置）：

| 变量 | 值 | 说明 |
|------|-----|------|
| `DB_HOST` | `mysql` | 必须，Docker 网络内服务名 |
| `DB_PORT` | `3306` | 容器内部端口 |
| `DB_USER` | `root` 或 `crm_user` | 应用连接账号 |
| `DB_PASSWORD` | 与 `.env` 一致 | 应用连接密码 |
| `DB_NAME` | `crm` 或 `huakey_crm` | 数据库名 |
| `JWT_SECRET` | 64 字节 hex | 必须替换 |
| `REDIS_HOST` | `redis` | Docker 网络内服务名 |
| `REDIS_ENABLED` | `true` | NAS 生产建议启用 |

---

## 7. 验证部署

```bash
# 后端健康检查（app 容器内直连）
curl -s http://localhost:5000/api/v1/health

# 通过容器 nginx 8443（HTTPS）
curl -sk https://localhost:8443/api/v1/health

# 通过内网域名（需 DSM nginx 已配置 443 反代）
curl -sk https://crm.huakey.local/api/v1/health

# 容器全绿
docker compose -f docker-compose.synology.yml ps
```

---

## 8. 更新/重启

```bash
cd /volume1/docker/crm-stack

docker compose -f docker-compose.synology.yml --env-file .env pull
docker compose -f docker-compose.synology.yml --env-file .env up -d --build --no-deps
```

如需无缓存重建：

```bash
docker compose -f docker-compose.synology.yml --env-file .env build --no-cache
docker compose -f docker-compose.synology.yml --env-file .env up -d
```

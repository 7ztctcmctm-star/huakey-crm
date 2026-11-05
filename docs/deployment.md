# 铧旗 CRM 部署手册

## 1. 环境要求

- Node.js 22+
- MySQL 8.0（本地开发端口 3306；测试栈 Docker 映射 3308:3306；生产 MySQL 不发布宿主端口）
- Redis 7（可选，`REDIS_ENABLED=true` 时启用）
- Docker + Docker Compose（生产 / 测试部署）

## 2. 本地开发部署

### 2.1 数据库

1. 启动 MySQL（本地或 Docker）
2. 创建数据库：
   ```sql
   CREATE DATABASE huakey_crm DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. 创建用户并授权（或直接用 root）

### 2.2 环境变量

1. 复制模板：
   ```bash
   cp .env.example .env
   ```
2. 修改以下必填项：
   - `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
   - `JWT_SECRET`（必须替换默认值，生成方法见 .env.example 注释）

### 2.3 运行迁移

```bash
# 在仓库根目录执行（database/ 与 backend/ 平级）
node database/migrations/run_migrations.js
```

### 2.4 启动后端

```bash
cd backend && npm install && npm start
```

→ API 地址: http://localhost:5000/api/v1

### 2.5 启动前端

```bash
cd frontend && npm install && npm run dev
```

→ 页面地址: http://localhost:5173

## 3. Docker 测试环境部署

使用 `deploy/docker-compose.test.yml`（MySQL `3308:3306`，应用 `6790:5000`）。

### 3.1 首次部署：准备测试环境变量

测试栈对以下变量做 fail-fast 校验，缺失会直接拒绝启动：

| 变量 | 说明 |
|------|------|
| `DB_PASSWORD_TEST` | 测试库应用账号（`crm_user`）密码，**必须与生产 `DB_PASSWORD` 不同** |
| `MYSQL_ROOT_PASSWORD_TEST` | 测试库 root 密码，**必须与生产 `MYSQL_ROOT_PASSWORD` 不同** |
| `JWT_SECRET_TEST` | 测试环境独立 JWT 密钥，**必须与生产 `JWT_SECRET` 不同** |
| `CORS_ORIGIN_TEST` | 测试环境访问地址，如 `http://<NAS-IP>:6790` |

```bash
cp .env.secrets.example .env.secrets     # 已存在则跳过
# 填写 DB_PASSWORD_TEST / MYSQL_ROOT_PASSWORD_TEST / CORS_ORIGIN_TEST
# 注意：测试栈禁止复用生产凭据；缺失任一项 compose 会 fail-fast 拒绝启动
bash deploy/setup-test-jwt.sh            # 生成 JWT_SECRET_TEST（已有合法值不覆盖）
source deploy/inject-secrets.sh          # 导出到当前 shell
docker compose -f deploy/docker-compose.test.yml config   # 校验变量与语法
docker compose -f deploy/docker-compose.test.yml up -d
```

> - `.env.secrets` 权限必须为 `600`/`400`，`inject-secrets.sh` 会强制检查；
> - Windows Git Bash 的文件权限无法真实反映 POSIX ACL，请在 NAS/WSL 上执行部署；
> - 测试栈 `NODE_ENV=production`，缺少 `CORS_ORIGIN_TEST` 会按生产口径 `exit(1)`；
> - 测试环境 token 与生产不互通；轮换 `JWT_SECRET_TEST` 会使测试环境旧 token 全部失效；
> - compose 中的构建上下文与挂载路径指向 NAS 的 `/volume1/docker/huakey-crm-deploy`，本地启动前需按实际路径调整。

## 4. 生产环境部署（Synology NAS + Container Manager）

### 4.1 前置

- NAS 已安装 Container Manager
- 已开通 SSH 访问（参照 `deploy/synology/setup-ssh-key.sh`）

### 4.2 构建并推送

- Windows（本地）执行 `deploy/synology/update.bat`
- Mac/Linux 执行 `deploy/synology/update-nas.sh`

### 4.3 NAS 上部署

- 在 Container Manager 中导入 NAS 栈目录下的 `docker-compose.synology.yml`（仓库根目录同名文件为生产编排）
- 敏感值通过 `.env.secrets` 注入（`DB_PASSWORD`、`MYSQL_ROOT_PASSWORD`、`JWT_SECRET`、`CORS_ORIGIN` 等）：

  ```bash
  source deploy/inject-secrets.sh
  docker compose -f docker-compose.synology.yml config   # 校验变量
  ```

- `CORS_ORIGIN` 为必填项，缺失时 compose 直接报错；生产值必须是实际 HTTPS 访问域名，禁止 `localhost`/`127.0.0.1`
- 启动项目

> 提示：若部署后代码未生效，可能是容器缓存，尝试 `docker compose build --no-cache`。

### 4.4 生产端口映射

群晖 NAS（`docker-compose.synology.yml`）：
- 容器 nginx: `8443:8443`（唯一发布端口；DSM nginx 80/443 → 127.0.0.1:8443）
- app: 仅 `expose: 5000`，不发布宿主端口
- MySQL / Redis: 仅容器内网，不发布宿主端口

通用服务器（`deploy/docker-compose.prod.yml`）：
- app: `6789:5000`
- MySQL: 默认不发布（`3307:3306` 仅在调试时取消注释）

## 5. Nginx 配置

- 稳定版单节点：`deploy/nginx-stable.conf`
- 灰度分流（90% 稳定版 + 10% canary）：`deploy/nginx-canary.conf`

## 6. 灰度发布

- 脚本：`deploy/canary-deploy.sh`
- 流程：构建 canary → 启动 → 健康检查 → 切 Nginx → 监控 → 提升为稳定 / 回滚

## 7. 环境变量完整清单

参见 `.env.example`，关键变量：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 5000 | 服务端口 |
| DB_HOST | localhost | MySQL 地址 |
| DB_PORT | 3306 | MySQL 端口 |
| DB_USER | crm_user | MySQL 用户 |
| DB_PASSWORD | — | MySQL 密码 |
| DB_NAME | huakey_crm | 数据库名 |
| DB_RO_HOST / DB_RO_PORT / DB_RO_USER / DB_RO_PASSWORD / DB_RO_NAME | — | 只读账号（AI 查询专用，可选） |
| JWT_SECRET | — | JWT 签名密钥（生产必换） |
| JWT_SECRET_TEST | — | 测试环境专用 JWT 密钥（必须与生产不同，测试 compose 必填） |
| JWT_EXPIRES_IN | 7d | Token 过期时间 |
| CORS_ORIGIN | — | 生产跨域来源（生产 compose 必填，禁止 localhost） |
| CORS_ORIGIN_TEST | http://localhost:6790 | 测试跨域来源（测试 compose 必填） |
| CRON_ENABLED | true | 定时任务开关；灰度/多副本实例必须为 false |
| REDIS_HOST | localhost | Redis 地址 |
| REDIS_PORT | 6379 | Redis 端口 |
| REDIS_PASSWORD | — | Redis 密码（可选） |
| OLLAMA_URL | http://127.0.0.1:11434 | Ollama 地址 |
| OLLAMA_MODEL | qwen2.5:3b | Ollama 模型名 |

> 其他运行时变量（如 `REDIS_ENABLED`、`SKIP_CAPTCHA`、`SLOW_QUERY_THRESHOLD_MS`、`ALERT_ENABLED`、`AUTO_RELEASE_DAYS` 等）由代码按需读取，可在对应配置文件中查看默认值。
>
> `DB_PASSWORD` 同时供应用连接和 MySQL 容器初始化使用；`MYSQL_ROOT_PASSWORD` 仅容器初始化使用。两者均通过 `.env.secrets` 注入，不要写入 compose 文件。

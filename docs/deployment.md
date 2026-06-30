# 铧旗 CRM 部署手册

## 1. 环境要求

- Node.js 22+
- MySQL 8.0（本地开发端口 3306，生产用 Docker 3307:3306）
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
cd backend
node database/migrations/run_migrations.js
```

### 2.4 启动后端

```bash
cd backend && npm install && npm start
```

→ API 地址: http://localhost:5000/api

### 2.5 启动前端

```bash
cd frontend && npm install && npm run dev
```

→ 页面地址: http://localhost:5173

## 3. Docker 测试环境部署

使用 `deploy/docker-compose.test.yml`（端口 3307:3306）

```bash
docker compose -f deploy/docker-compose.test.yml up -d
```

## 4. 生产环境部署（Synology NAS + Container Manager）

### 4.1 前置

- NAS 已安装 Container Manager
- 已开通 SSH 访问（参照 `deploy/synology/setup-ssh-key.sh`）

### 4.2 构建并推送

- Windows（本地）执行 `deploy/synology/update.bat`
- Mac/Linux 执行 `deploy/synology/update-nas.sh`

### 4.3 NAS 上部署

- 在 Container Manager 中导入 `deploy/synology/docker-compose.synology.yml`
- 修改 NAS 侧的 `.env`（DB 密码、JWT_SECRET 等）
- 启动项目

> 提示：若部署后代码未生效，可能是容器缓存，尝试 `docker compose build --no-cache`。

### 4.4 生产端口映射

- app: `6789:5000`（外部访问 http://192.168.0.200:6789）
- MySQL: `3307:3306`（内部使用，不对外暴露推荐）

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
| JWT_EXPIRES_IN | 7d | Token 过期时间 |
| REDIS_HOST | localhost | Redis 地址 |
| REDIS_PORT | 6379 | Redis 端口 |
| REDIS_PASSWORD | — | Redis 密码（可选） |
| OLLAMA_URL | http://127.0.0.1:11434 | Ollama 地址 |
| OLLAMA_MODEL | qwen2.5:3b | Ollama 模型名 |

> 其他运行时变量（如 `REDIS_ENABLED`、`SKIP_CAPTCHA`、`SLOW_QUERY_THRESHOLD_MS`、`ALERT_ENABLED`、`AUTO_RELEASE_DAYS` 等）由代码按需读取，未在 `.env.example` 中列出，可在对应配置文件中查看默认值。

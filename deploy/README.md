# 铧旗 CRM 部署说明

## 环境要求

| 组件 | 版本 | 说明 |
|------|------|------|
| 群晖 NAS | DS723+ 或更高 | 需支持 Container Manager |
| Docker | 24.0+ | 通过 Container Manager 管理 |
| MySQL | 8.0 | 容器内置 |
| Redis | 7.x | 容器内置（可选，默认关闭） |
| Node.js | 20+ | 仅开发环境需要 |

## 首次部署步骤

### 1. 准备配置文件

```bash
# 在项目根目录执行
cp .env.example .env
```

编辑 `.env`，**必须修改**以下项：

| 变量 | 说明 | 生成方式 |
|------|------|---------|
| `JWT_SECRET` | JWT 签名密钥 | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | 自行设置强密码 |
| `DB_PASSWORD` | 应用数据库密码 | 自行设置强密码 |
| `CORS_ORIGIN` | 前端访问地址 | `https://your-domain.com` |

### 2. 部署到群晖 NAS

#### 方式 A：通过 Container Manager（推荐）

1. 将项目代码上传到 NAS（如 `/volume1/docker/huakey-crm/`）
2. 打开 Container Manager → 项目 → 新增
3. 导入 `docker-compose.synology.yml`
4. 确认环境变量已正确加载
5. 启动项目

#### 方式 B：命令行部署

```bash
ssh admin@your-nas-ip
cd /volume1/docker/huakey-crm
docker compose -f docker-compose.synology.yml up -d --build
```

### 3. 验证部署

```bash
# 健康检查
curl http://localhost:5000/api/health

# 验证码
curl http://localhost:5000/api/auth/captcha

# 前端页面
curl -I http://localhost/
```

或运行冒烟测试脚本：

```bash
bash scripts/smoke-test.sh http://localhost
```

## NAS 特有注意事项

### 端口映射

| 端口 | 服务 | 说明 |
|------|------|------|
| 80 | Nginx | 前端 + 反向代理，对外暴露 |
| 443 | Nginx | HTTPS（如配置了 SSL） |
| 5000 | 后端 API | **不建议对外暴露**，仅容器内部通信 |
| 3306 | MySQL | **不对外暴露**，仅容器内部通信 |
| 6379 | Redis | **不对外暴露**，仅容器内部通信 |

### 卷路径

群晖 NAS 默认存储路径为 `/volume1/docker/huakey-crm/`，数据卷映射：

| 容器卷 | 宿主路径 | 用途 |
|--------|---------|------|
| `mysql-data` | Docker managed volume | MySQL 数据持久化 |
| `./database/backups` | `/volume1/docker/huakey-crm/database/backups` | 数据库备份 |
| `./uploads` | `/volume1/docker/huakey-crm/uploads` | 上传文件 |
| `./logs` | `/volume1/docker/huakey-crm/logs` | 应用日志 |

### 内存限制

群晖 NAS 资源有限，已在 `docker-compose.synology.yml` 中配置内存限制：

| 服务 | 内存上限 |
|------|---------|
| MySQL | 256M |
| Redis | 128M |
| Backend | 512M |
| Frontend (Nginx) | 64M |

如 NAS 内存充足（≥4GB），可适当上调 MySQL 的 `innodb_buffer_pool_size`。

### 缓存问题

如果部署后页面未更新（显示旧版本），执行无缓存重建：

```bash
docker compose -f docker-compose.synology.yml build --no-cache
docker compose -f docker-compose.synology.yml up -d
```

## 健康检查

### 自动健康检查

MySQL 容器已配置 healthcheck，Docker 会自动检测 MySQL 就绪状态。

### 手动验证

```bash
# 1. 容器状态
docker compose -f docker-compose.synology.yml ps

# 2. 后端健康检查
curl -s http://localhost:5000/api/health | jq .

# 3. 数据库连接
docker exec huakey-mysql mysql -u crm_user -p${DB_PASSWORD} -e "SELECT 1"

# 4. Redis 连接（如启用）
docker exec huakey-redis redis-cli ping
```

## 备份与恢复

### 数据库备份

```bash
# 手动备份
docker exec huakey-mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} huakey_crm > database/backups/backup_$(date +%Y%m%d).sql

# 自动备份（添加到群晖任务计划）
# 控制面板 → 任务计划 → 新增 → 用户定义脚本
# 脚本内容：
# docker exec huakey-mysql mysqldump -u root -pYOUR_PASSWORD huakey_crm > /volume1/docker/huakey-crm/database/backups/backup_$(date +%Y%m%d).sql
```

### 数据库恢复

```bash
# 恢复备份
docker exec -i huakey-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} huakey_crm < database/backups/backup_20260101.sql
```

### 文件备份

上传文件存储在 `./uploads/` 目录，定期备份该目录即可。

## 鉴权方式说明

系统同时支持两种 JWT 传递方式：

| 方式 | 适用场景 | 优点 | 注意 |
|------|---------|------|------|
| `Authorization: Bearer <token>` | REST API 调用、第三方集成 | 通用标准 | 需要前端手动存储和附加 token |
| `Cookie: token=<jwt>`（HttpOnly） | 浏览器同源访问 | 自动携带，JS 不可读（防 XSS） | 需配合 `sameSite: 'strict'` |

当前前端（Vue 3）使用 Cookie 方式。CSRF 已通过 `sameSite: 'strict'` 防御，无需额外 token。

## API 设计约定

### 列表查询方法

系统列表接口根据场景选择 HTTP 方法：

| 方法 | 使用场景 | 示例 |
|------|---------|------|
| `POST /list` | 需要复杂筛选条件（JSON body） | 客户列表、合同列表 |
| `GET /list` | 简单分页/关键词查询 | 供应商列表、知识库列表 |

> 当前阶段保持现状：`POST /list` 用于筛选条件较复杂的场景，`GET /list` 用于简单查询场景。新增接口统一按此规则实现。

## Prometheus 监控配置

`/api/v1/metrics` 端点需要管理员认证。在 Prometheus `prometheus.yml` 中配置 Bearer token：

```yaml
scrape_configs:
  - job_name: 'huakey-crm'
    scrape_interval: 30s
    metrics_path: '/api/v1/metrics'
    bearer_token: '<管理员JWT-token>'
    static_configs:
      - targets: ['your-nas-ip:80']
```

## 常见问题

### Q: 端口 5000 被占用？

```bash
# 查看占用
netstat -tlnp | grep 5000
# 修改 docker-compose.synology.yml 中的端口映射
```

### Q: 数据库迁移失败？

`migrate.js` 已内置重试逻辑。如仍失败，检查 MySQL 容器是否就绪：

```bash
docker logs huakey-mysql --tail 20
```

### Q: 上传文件丢失？

上传文件存储在 `./uploads/` 目录，确保该目录已正确挂载且权限正确：

```bash
ls -la /volume1/docker/huakey-crm/uploads/
```

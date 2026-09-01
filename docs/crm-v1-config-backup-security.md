# HuakeyCRM v1.0 配置文件备份安全策略

> **文档状态**: COMPLETED
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS DSM 7.x + Docker CRM Stack
> **审计范围**: `.env`、`.env.secrets`、`docker-compose.synology.yml`

---

## 1. 概述

HuakeyCRM 生产环境使用两类配置文件：公开配置和敏感配置。本策略对配置文件进行分类，明确备份要求，确保敏感配置不会被明文复制到备份目录。

### 1.1 安全原则

- **敏感配置禁止明文备份**: `.env.secrets` 不允许以明文形式复制到 `/volume1/docker/crm-stack/database/backups/`
- **敏感配置禁止提交版本库**: `.env.secrets` 已在 `.gitignore` 中
- **离线保存优先**: 敏感配置应离线保存（如加密 U 盘、密码管理器）

---

## 2. 配置文件审计

### 2.1 文件清单

| 文件 | 路径 | 性质 | 含敏感信息 |
|------|------|------|------------|
| `.env` | `/volume1/docker/crm-stack/.env` | 公开配置 | NO |
| `.env.secrets` | `/volume1/docker/crm-stack/.env.secrets` | 敏感配置 | YES |
| `docker-compose.synology.yml` | `/volume1/docker/crm-stack/docker-compose.synology.yml` | 编排配置 | NO |

### 2.2 公开配置 (.env)

| 变量 | 值 | 说明 |
|------|-----|------|
| DB_HOST | mysql | 数据库主机 |
| DB_PORT | 3306 | 数据库端口 |
| DB_USER | crm_user | 数据库用户（无密码） |
| DB_NAME | huakey_crm | 数据库名 |
| CORS_ORIGIN | https://crm.huakey.local | 跨域配置 |
| OLLAMA_URL | http://host.docker.internal:11434 | AI 模型地址 |
| OLLAMA_MODEL | qwen2.5:3b | AI 模型名称 |
| NODE_ENV | production | 运行环境 |
| SKIP_CAPTCHA | false | 安全配置 |
| ENABLE_SWAGGER | false | 安全配置 |
| TZ | Asia/Shanghai | 时区 |

### 2.3 敏感配置 (.env.secrets)

| 变量 | 说明 | 风险等级 |
|------|------|----------|
| DB_PASSWORD | MySQL 应用账号密码 | HIGH |
| MYSQL_ROOT_PASSWORD | MySQL Root 密码 | CRITICAL |
| JWT_SECRET | JWT 认证密钥 (128位hex) | CRITICAL |
| REDIS_PASSWORD | Redis 密码 | HIGH |
| ADMIN_INITIAL_PASSWORD | 初始管理员密码 | HIGH |
| EMAIL_ENC_KEY | 邮箱加密密钥 | HIGH |
| CORS_ORIGIN | 跨域配置（覆盖值） | LOW |

### 2.4 编排配置 (docker-compose.synology.yml)

| 内容 | 说明 |
|------|------|
| 服务定义 | huakey-app, huakey-mysql, huakey-redis, huakey-nginx |
| Volume 映射 | app-uploads, app-logs, migrations, backups |
| 网络配置 | crm-stack 内部网络 |
| 健康检查 | 各服务 healthcheck 配置 |

**性质**: 编排配置，不含密码（密码通过 `.env.secrets` 注入），可安全备份。

---

## 3. 备份分类策略

### 3.1 公开配置备份

| 文件 | 备份方式 | 目标位置 | 频率 |
|------|----------|----------|------|
| `.env` | 直接复制 | `/volume1/docker/crm-stack/config-backups/` | 每次变更时 |
| `docker-compose.synology.yml` | 直接复制 | 同上 | 每次变更时 |

### 3.2 敏感配置处理

| 规则 | 说明 |
|------|------|
| 禁止明文复制到 backup 目录 | 不执行 `cp .env.secrets /backups/` |
| 禁止提交到版本库 | `.gitignore` 已排除 |
| 禁止在脚本中硬编码 | 密码仅从 `.env.secrets` source 加载 |

---

## 4. 推荐方案

### 方案 A: 离线保存（推荐）

**适用场景**: 敏感配置变更频率低，追求最高安全性。

**操作步骤**:

1. 将 `.env.secrets` 内容复制到密码管理器（如 KeePass、1Password）
2. 或将 `.env.secrets` 复制到加密 U 盘，物理离线保存
3. 记录恢复凭据的位置和访问方式

**优势**:
- 零网络暴露风险
- 不依赖 NAS 安全性
- 物理隔离

**劣势**:
- 需手动维护
- 恢复时需物理介质

### 方案 B: 加密备份

**适用场景**: 需要自动化备份，可接受一定复杂性。

**操作步骤**:

```bash
# 1. 使用 OpenSSL 加密备份（AES-256-CBC）
source /volume1/docker/crm-stack/.env.secrets
ENCRYPT_KEY="<自定义加密密钥>"  # 离线保存此密钥

# 2. 加密备份
tar -czf - -C /volume1/docker/crm-stack .env .env.secrets docker-compose.synology.yml | \
  openssl enc -aes-256-cbc -salt -pass pass:"$ENCRYPT_KEY" \
  -out /volume1/docker/crm-stack/config-backups/config_$(date +%Y%m%d).enc

# 3. 解密恢复
openssl enc -d -aes-256-cbc -pass pass:"$ENCRYPT_KEY" \
  -in /volume1/docker/crm-stack/config-backups/config_YYYYMMDD.enc | \
  tar -xzf - -C /volume1/docker/crm-stack/
```

**优势**:
- 可自动化
- 加密文件可安全存放

**劣势**:
- 需离线保管加密密钥
- 若密钥丢失则备份不可用

### 4.1 方案选择建议

| 场景 | 推荐方案 |
|------|----------|
| 敏感配置不常变更 | 方案 A（离线保存） |
| 需要自动定期备份 | 方案 B（加密备份） |
| 生产环境 | 方案 A + B 结合 |

**当前采用**: 方案 A（离线保存），将 `.env.secrets` 内容记录到密码管理器。

---

## 5. 公开配置备份脚本

公开配置（`.env`、`docker-compose.synology.yml`）可安全备份，使用手动方式：

```bash
# 创建配置备份目录
mkdir -p /volume1/docker/crm-stack/config-backups

# 备份公开配置（变更时手动执行）
cp /volume1/docker/crm-stack/.env /volume1/docker/crm-stack/config-backups/.env.$(date +%Y%m%d)
cp /volume1/docker/crm-stack/docker-compose.synology.yml /volume1/docker/crm-stack/config-backups/docker-compose.$(date +%Y%m%d).yml
```

---

## 6. 安全检查清单

- [ ] `.env.secrets` 未出现在 `/volume1/docker/crm-stack/database/backups/` 中
- [ ] `.env.secrets` 未出现在 `config-backups/` 明文目录中
- [ ] `.env.secrets` 已在 `.gitignore` 中
- [ ] 敏感配置已离线保存（密码管理器/加密 U 盘）
- [ ] `docker-compose.synology.yml` 已纳入备份
- [ ] `.env` 已纳入备份

---

## 7. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-file-backup-plan.md](./crm-v1-file-backup-plan.md) | 文件备份设计方案 |
| [crm-v1-synology-backup-cron.md](./crm-v1-synology-backup-cron.md) | 群晖定时任务配置 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 备份覆盖报告 |

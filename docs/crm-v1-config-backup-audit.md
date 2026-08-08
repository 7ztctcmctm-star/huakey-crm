# HuakeyCRM v1.0 生产配置文件备份审计

> **审计状态**: COMPLETED
> **审计日期**: 2026-08-06
> **审计范围**: `/volume1/docker/crm-stack/` 生产部署目录
> **审计人**: Disaster Recovery Engineer

---

## 1. 审计目标

识别 HuakeyCRM 生产环境中必须纳入备份的配置文件和证书，确保灾难恢复时可完整还原系统配置。

---

## 2. 必须恢复文件清单

### 2.1 环境变量配置

| 文件 | 路径 | 性质 | 含敏感信息 | 大小 |
|------|------|------|------------|------|
| `.env` | `/volume1/docker/crm-stack/.env` | 公开配置 | NO | 53 行 |
| `.env.secrets` | `/volume1/docker/crm-stack/.env.secrets` | 敏感配置 | YES | 32 行 |

**说明**:
- `.env`: 包含数据库主机、端口、CORS、AI 模型等非敏感配置
- `.env.secrets`: 包含 MySQL 密码、JWT 密钥、Redis 密码等敏感凭据

### 2.2 Docker 编排配置

| 文件 | 路径 | 性质 | 大小 |
|------|------|------|------|
| `docker-compose.synology.yml` | `/volume1/docker/crm-stack/docker-compose.synology.yml` | 编排配置 | 204 行 |

**说明**: 定义 4 个服务（app、mysql、redis、nginx）、volume 映射、网络、健康检查。

### 2.3 SSL 证书

| 文件 | 路径 | 用途 | 有效期 |
|------|------|------|--------|
| `crm.huakey.local.crt` | `nginx/certs/` | DSM Nginx 域名 HTTPS | 2026-08-06 至 2028-11-08 |
| `crm.huakey.local.key` | `nginx/certs/` | 域名私钥 | - |
| `server.crt` | `nginx/certs/` | Docker Nginx IP HTTPS | 2026-08-06 至 2036-08-03 |
| `server.key` | `nginx/certs/` | IP 私钥 | - |

**证书详情**:

| 证书 | CN | SAN | 签发者 |
|------|-----|-----|--------|
| crm.huakey.local.crt | crm.huakey.local | DNS:crm.huakey.local | 自签名 |
| server.crt | 192.168.0.200 | IP:192.168.0.200 | 自签名 |

### 2.4 Nginx 配置

| 文件 | 路径 | 用途 |
|------|------|------|
| `nginx.conf` | `/volume1/docker/crm-stack/nginx/nginx.conf` | Docker Nginx 配置 (8443) |
| `http.crm-huakey-local.conf` | `/usr/local/etc/nginx/conf.d/` | DSM Nginx 反代配置 (443) |

### 2.5 备份脚本

| 文件 | 路径 | 用途 |
|------|------|------|
| `mysql-backup.sh` | `deploy/backup/` | MySQL 数据库备份 |
| `uploads-backup.sh` | `deploy/backup/` | 文件备份 |
| `restore-test.sh` | `deploy/backup/` | 备份验证 |
| `config-backup.sh` | `deploy/backup/` | 配置备份（本方案新增） |

---

## 3. 文件分类与备份策略

### 3.1 公开配置（可明文备份）

| 文件 | 备份方式 | 权限 |
|------|----------|------|
| `.env` | tar.gz 打包 | 600 |
| `docker-compose.synology.yml` | tar.gz 打包 | 600 |
| `nginx/nginx.conf` | tar.gz 打包 | 600 |
| `/usr/local/etc/nginx/conf.d/http.crm-huakey-local.conf` | tar.gz 打包 | 600 |
| `deploy/backup/*.sh` | tar.gz 打包 | 600 |

### 3.2 敏感配置（必须加密保护）

| 文件 | 备份方式 | 权限 | 安全措施 |
|------|----------|------|----------|
| `.env.secrets` | tar.gz 打包 | 600 | 备份目录 700 + 文件 600 |
| `nginx/certs/*.key` | tar.gz 打包 | 600 | 私钥文件 600 |

### 3.3 SSL 证书

| 文件 | 备份方式 | 权限 |
|------|----------|------|
| `*.crt` | tar.gz 打包 | 600 |
| `*.key` | tar.gz 打包 | 600 |

---

## 4. Git 排除状态

### 4.1 .gitignore 验证

| 排除项 | 状态 | 验证 |
|--------|------|------|
| `.env.secrets` | PASS | 已在 .gitignore |
| `database/backups/` | PASS | 已在 .gitignore |
| `backend/backups/` | PASS | 已在 .gitignore |

### 4.2 备份目录 Git 排除

| 目录 | 是否进入 Git | 说明 |
|------|-------------|------|
| `database/backups/config/` | NO | 位于 `database/backups/` 下，已被 .gitignore 排除 |
| `config-backup.sh` 脚本本身 | YES | 脚本可提交（不含密码） |

---

## 5. 备份输出位置

```
/volume1/docker/crm-stack/database/backups/config/
├── config_YYYYMMDD.tar.gz    # 每日配置备份
└── config-backup.log          # 备份日志
```

**权限设置**:
- 备份目录: `chmod 700`（仅 root 可访问）
- 备份文件: `chmod 600`（仅 root 可读写）

---

## 6. 风险评估

### 6.1 已识别风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| .env.secrets 明文泄露 | HIGH | 备份目录 700 + 文件 600 + .gitignore |
| SSL 私钥泄露 | HIGH | 私钥 600 权限 + 备份目录 700 |
| 配置文件丢失 | MEDIUM | 每日自动备份 + 7 天保留 |
| 证书过期未发现 | LOW | 证书有效期至 2028/2036 |

### 6.2 安全合规

- [x] .env.secrets 已在 .gitignore
- [x] 备份目录位于 database/backups/ 下（已被 .gitignore 排除）
- [x] 备份脚本无硬编码密码
- [x] 敏感文件权限 600
- [x] 备份目录权限 700

---

## 7. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-config-restore.md](./crm-v1-config-restore.md) | 配置恢复流程 |
| [crm-v1-config-backup-security.md](./crm-v1-config-backup-security.md) | 配置文件备份安全策略 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 灾备覆盖报告 |

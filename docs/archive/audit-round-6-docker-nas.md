# 第六轮：Docker 与 NAS 审计报告

> 审计日期：2026-07-04

## 总览

| 指标 | 数值 |
|------|------|
| Docker Compose 文件 | 7 个 |
| Dockerfile | 4 个 |
| 发现的问题 | 22 |
| 🔴 严重 | 3 |
| 🟡 高危 | 5 |
| 🟡 中危 | 7 |
| 🟢 低危 | 7 |

## 🔴 严重问题

### 1. restore.sh 硬编码 MySQL root 密码
- **位置**：`database/restore.sh:4`
- **问题**：`MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-huakey123}"` 包含 fallback 密码
- **修复**：移除默认值，强制要求设置环境变量

### 2. 所有容器以 root 运行
- **位置**：所有 Dockerfile
- **风险**：容器被攻破后攻击者获取宿主机 root 权限
- **修复**：添加 `USER node`（Node 容器）、`USER nginx`（Nginx 容器）

### 3. Redis 无密码保护
- **位置**：`docker-compose.synology.yml` redis 服务
- **修复**：设置 `REDIS_PASSWORD` 环境变量，修改 redis-server 启动参数 `--requirepass`

## 🟡 高危问题

### 4. HTTPS/TLS 缺失——Nginx 仅监听 80 端口
### 5. MySQL 端口在 deploy/synology 版本中对外暴露
### 6. 两份 Docker 配置文件冗余（根目录 vs deploy/synology）
### 7. Nginx 无独立安全头配置（依赖后端 helmet）
### 8. backup 容器用完整 mysql:8.0 镜像（应为 mysql:8.0 客户端或 alpine 版本）

## 🟡 中危问题

### 9. MySQL healthcheck 在命令行暴露 root 密码
### 10. App healthcheck 使用 wget（容器中 wget 可能不存在）
### 11. 容器 restart policy 都是 unless-stopped（生产应使用 always）
### 12. Nginx upstream 无备用服务器配置
### 13. backup 容器日志 max-size=5M（其他服务都是 10M）
### 14. App 容器 384MB 内存偏紧（Node.js + 前端静态文件服务）
### 15. docker-compose 文件中硬编码数据库名 huakey_crm

## 🟢 低危问题

### 16. node:22-alpine 的 alpine 版本号未固定
### 17. Nginx 静态资源 expires 1y 会导致更新问题
### 18. 多阶段构建未使用 distroless 基础镜像
### 19. deploy 脚本硬编码 IP 和 SSH 密钥路径
### 20. init-complete.sql 包含 DROP TABLE IF EXISTS
### 21. MySQL command 中 collation-server 拼写正确但建议显式声明
### 22. proxy_read_timeout 300s 对于某些报表查询可能不够

## 良好方面
- 多阶段构建减少镜像大小
- 所有服务有 resource limits（适合 NAS 环境）
- 健康检查覆盖核心服务
- 日志轮转配置完善
- Trivy 镜像扫描已集成到 CI
- 备份容器有独立 cron 机制

## 优先修复顺序

1. 移除 restore.sh 硬编码密码
2. Redis 添加密码保护
3. 容器改用非 root 用户
4. 配置 HTTPS/TLS
5. 合并两套 Docker 配置
6. 修复 MySQL healthcheck 密码暴露
7. 生产环境关闭 MySQL 端口暴露

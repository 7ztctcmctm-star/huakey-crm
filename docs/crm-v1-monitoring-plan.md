# HuakeyCRM v1 日志与健康监控方案

> **文档类型**: Monitoring Plan
> **版本**: HuakeyCRM v1.0
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS 生产部署

---

## 1. 监控目标

| 目标 | 说明 |
|------|------|
| 服务可用性 | App/MySQL/Redis 容器运行状态 |
| 数据库健康 | 连接正常、无死锁、慢查询监控 |
| 应用错误 | 500 错误、异常崩溃 |
| 磁盘空间 | 存储充足，避免写满 |
| 性能监控 | CPU/内存使用率 |

---

## 2. 日志源

### 2.1 Docker 容器日志

| 容器 | 日志命令 | 关注内容 |
|------|----------|----------|
| huakey-app | `docker logs huakey-app --tail 100` | 错误、慢查询、启动失败 |
| huakey-mysql | `docker logs huakey-mysql --tail 50` | 连接错误、死锁、启动失败 |
| huakey-redis | `docker logs huakey-redis --tail 20` | 内存、连接、持久化 |

### 2.2 应用日志

| 日志类型 | 位置 | 说明 |
|----------|------|------|
| App 日志卷 | `crm-stack_app-logs` Docker 卷 | 应用运行日志 |
| 慢查询日志 | App stdout（docker logs） | durationMs > 1000ms |
| 权限审计日志 | App stdout | [PermissionAudit] 前缀 |
| 操作日志 | 数据库 sys_log 表 | 用户操作记录 |

### 2.3 当前已知日志问题

| 问题 | 严重性 | 说明 |
|------|--------|------|
| sys_log INSERT 慢查询 | 中 | 审计日志写入 1702ms，需关注 |
| 权限审计频率高 | 低 | admin 每次请求都记录，属正常 |

---

## 3. 健康检查方案

### 3.1 健康检查脚本

```bash
#!/bin/bash
# /volume1/docker/crm-stack/health-check.sh
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

STATUS="OK"
MESSAGES=""

# 1. App 容器状态
APP_STATUS=$(docker inspect --format='{{.State.Status}}' huakey-app 2>/dev/null)
if [ "$APP_STATUS" != "running" ]; then
  STATUS="FAIL"
  MESSAGES="$MESSAGES\n[CRITICAL] App 容器未运行 (status=$APP_STATUS)"
fi

# 2. MySQL 容器状态
MYSQL_STATUS=$(docker inspect --format='{{.State.Health.Status}}' huakey-mysql 2>/dev/null)
if [ "$MYSQL_STATUS" != "healthy" ]; then
  STATUS="FAIL"
  MESSAGES="$MESSAGES\n[CRITICAL] MySQL 不健康 (status=$MYSQL_STATUS)"
fi

# 3. Redis 容器状态
REDIS_STATUS=$(docker inspect --format='{{.State.Health.Status}}' huakey-redis 2>/dev/null)
if [ "$REDIS_STATUS" != "healthy" ]; then
  STATUS="FAIL"
  MESSAGES="$MESSAGES\n[CRITICAL] Redis 不健康 (status=$REDIS_STATUS)"
fi

# 4. HTTP 健康检查
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:6789/api/v1/health)
if [ "$HTTP_CODE" != "200" ]; then
  STATUS="FAIL"
  MESSAGES="$MESSAGES\n[CRITICAL] HTTP 健康检查失败 (code=$HTTP_CODE)"
fi

# 5. 磁盘空间检查
DISK_USAGE=$(df /volume1 | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 90 ]; then
  STATUS="WARN"
  MESSAGES="$MESSAGES\n[WARN] 磁盘空间不足 (${DISK_USAGE}%)"
fi

# 6. MySQL 连接池检查
DB_CHECK=$(curl -s http://localhost:6789/api/v1/health | grep -o '"db":[a-z]*')
if [ "$DB_CHECK" != '"db":true' ]; then
  STATUS="FAIL"
  MESSAGES="$MESSAGES\n[CRITICAL] 数据库连接失败"
fi

# 7. Redis 连接检查
REDIS_CHECK=$(curl -s http://localhost:6789/api/v1/health | grep -o '"redis":[a-z]*')
if [ "$REDIS_CHECK" != '"redis":true' ]; then
  STATUS="FAIL"
  MESSAGES="$MESSAGES\n[CRITICAL] Redis 连接失败"
fi

# 输出结果
if [ "$STATUS" = "OK" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] HEALTH: OK - 所有服务正常"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] HEALTH: $STATUS"
  echo -e "$MESSAGES"
fi

exit 0
```

### 3.2 DSM 定时任务

| 任务 | 频率 | 脚本 |
|------|------|------|
| 健康检查 | 每 5 分钟 | `bash /volume1/docker/crm-stack/health-check.sh >> /volume1/docker/crm-stack/logs/health.log 2>&1` |
| 磁盘检查 | 每日 08:00 | `df -h /volume1` |
| 日志清理 | 每周日 03:30 | 清理 7 天前容器日志 |

---

## 4. 异常检测与告警

### 4.1 异常类型与阈值

| 异常类型 | 检测条件 | 严重级别 | 告警方式 |
|----------|----------|----------|----------|
| 服务停止 | 容器 status != running | CRITICAL | DSM 通知 + 邮件 |
| 数据库失败 | Health API db=false | CRITICAL | DSM 通知 + 邮件 |
| Redis 失败 | Health API redis=false | CRITICAL | DSM 通知 |
| 磁盘不足 | 剩余 < 10% | WARNING | DSM 通知 |
| 慢查询激增 | >10 次/分钟 | WARNING | 日志记录 |
| App 重启 | 容器重启 | WARNING | 日志记录 |
| 内存溢出 | MEM% > 90% | WARNING | 日志记录 |

### 4.2 告警通知配置（DSM 通知）

通过 DSM 控制面板 → 通知设置：
- 启用邮件通知
- 启用移动推送（DSM 手机 App）
- 配置 SMTP 服务器

### 4.3 自动重启策略

当前 docker-compose 已配置 `restart: unless-stopped`：
- 容器崩溃自动重启
- 手动停止不重启

---

## 5. 日志管理

### 5.1 日志保留策略

| 日志类型 | 保留时间 | 清理方式 |
|----------|----------|----------|
| Docker 容器日志 | 7 天 | docker log rotate |
| App 日志卷 | 30 天 | 定时清理 |
| 健康检查日志 | 7 天 | find -mtime +7 -delete |
| 备份日志 | 30 天 | find -mtime +30 -delete |
| 操作日志（DB） | 90 天 | 定时清理 sys_log |

### 5.2 Docker 日志轮转

在 `/volume1/docker/crm-stack/docker-compose.synology.yml` 中已配置或需添加：

```yaml
logging:
  driver: json-file
  options:
    max-size: "50m"
    max-file: "3"
```

---

## 6. 日常运维检查清单

### 6.1 每日检查

| 检查项 | 命令 | 预期 |
|--------|------|------|
| 容器状态 | `docker ps` | 3 容器 Up |
| 健康检查 | `curl http://localhost:6789/api/v1/health` | 200 OK |
| 磁盘空间 | `df -h /volume1` | 剩余 > 10% |
| 备份状态 | 检查备份目录 | 当日有备份 |
| 错误日志 | `docker logs huakey-app --tail 50 \| grep -i error` | 无 ERROR |

### 6.2 每周检查

| 检查项 | 命令 | 预期 |
|--------|------|------|
| 容器重启次数 | `docker ps --format "{{.Names}} {{.Status}}"` | 无异常重启 |
| 慢查询统计 | `docker logs huakey-app 2>&1 \| grep "Slow query" \| wc -l` | 趋势稳定 |
| 备份恢复测试 | 执行恢复流程 | 数据一致 |
| 镜像清理 | `docker images \| grep "<none>"` | 无积压 |

### 6.3 每月检查

| 检查项 | 预期 |
|--------|------|
| 完整恢复测试 | Smoke Test 通过 |
| 证书有效期 | > 30 天 |
| 密码轮换 | 管理员密码已更新 |
| 日志归档 | 旧日志已归档 |

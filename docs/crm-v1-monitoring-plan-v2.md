# HuakeyCRM v1 监控方案

> **文档类型**: Monitoring Plan
> **版本**: HuakeyCRM v1.0
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS 生产部署

---

## 1. 监控目标

| 目标 | 监控对象 | 检测内容 |
|------|----------|----------|
| 服务可用性 | Docker 容器 | 容器停止、重启 |
| 数据库健康 | MySQL | 连接失败、死锁、慢查询 |
| 应用健康 | App API | 500 错误、健康检查失败 |
| 缓存健康 | Redis | 连接失败、内存溢出 |
| 磁盘空间 | NAS 存储 | 剩余空间不足 |

---

## 2. 监控脚本

### 2.1 健康检查脚本

**文件**: `/volume1/docker/crm-stack/monitoring/health-check.sh`

```bash
#!/bin/bash
# HuakeyCRM 健康检查脚本
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_FILE="/volume1/docker/crm-backups/logs/health-check.log"
mkdir -p "$(dirname "$LOG_FILE")"

STATUS="OK"
MESSAGES=""
ALERT=""

# 1. App 容器状态
APP_STATUS=$(docker inspect --format='{{.State.Status}}' huakey-app 2>/dev/null)
if [ "$APP_STATUS" != "running" ]; then
  STATUS="CRITICAL"
  ALERT="App 容器停止"
  MESSAGES="$MESSAGES\n[CRITICAL] App 容器未运行 (status=$APP_STATUS)"
fi

# 2. MySQL 容器健康
MYSQL_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' huakey-mysql 2>/dev/null)
if [ "$MYSQL_HEALTH" != "healthy" ]; then
  STATUS="CRITICAL"
  ALERT="$ALERT MySQL 不健康"
  MESSAGES="$MESSAGES\n[CRITICAL] MySQL 不健康 (status=$MYSQL_HEALTH)"
fi

# 3. Redis 容器健康
REDIS_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' huakey-redis 2>/dev/null)
if [ "$REDIS_HEALTH" != "healthy" ]; then
  STATUS="CRITICAL"
  ALERT="$ALERT Redis 不健康"
  MESSAGES="$MESSAGES\n[CRITICAL] Redis 不健康 (status=$REDIS_HEALTH)"
fi

# 4. HTTP 健康检查
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:6789/api/v1/health 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then
  STATUS="CRITICAL"
  ALERT="$ALERT HTTP 健康检查失败"
  MESSAGES="$MESSAGES\n[CRITICAL] HTTP 健康检查失败 (code=$HTTP_CODE)"
fi

# 5. 数据库连接检查
DB_CHECK=$(curl -s --max-time 10 http://localhost:6789/api/v1/health 2>/dev/null | grep -o '"db":[a-z]*')
if [ "$DB_CHECK" != '"db":true' ]; then
  STATUS="CRITICAL"
  ALERT="$ALERT 数据库连接失败"
  MESSAGES="$MESSAGES\n[CRITICAL] 数据库连接失败"
fi

# 6. Redis 连接检查
REDIS_CHECK=$(curl -s --max-time 10 http://localhost:6789/api/v1/health 2>/dev/null | grep -o '"redis":[a-z]*')
if [ "$REDIS_CHECK" != '"redis":true' ]; then
  STATUS="CRITICAL"
  ALERT="$ALERT Redis 连接失败"
  MESSAGES="$MESSAGES\n[CRITICAL] Redis 连接失败"
fi

# 7. 磁盘空间检查
DISK_USAGE=$(df /volume1 | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 90 ]; then
  STATUS="WARNING"
  ALERT="$ALERT 磁盘空间不足"
  MESSAGES="$MESSAGES\n[WARNING] 磁盘空间不足 (${DISK_USAGE}%)"
elif [ "$DISK_USAGE" -gt 80 ]; then
  MESSAGES="$MESSAGES\n[INFO] 磁盘空间使用 ${DISK_USAGE}%"
fi

# 8. App 内存检查
APP_MEM=$(docker stats --no-stream --format "{{.MemPerc}}" huakey-app 2>/dev/null | tr -d '%')
if [ -n "$APP_MEM" ] && [ "$(echo "$APP_MEM > 90" | bc 2>/dev/null)" = "1" ]; then
  STATUS="WARNING"
  ALERT="$ALERT App 内存过高"
  MESSAGES="$MESSAGES\n[WARNING] App 内存使用 ${APP_MEM}%"
fi

# 9. MySQL 内存检查
MYSQL_MEM=$(docker stats --no-stream --format "{{.MemPerc}}" huakey-mysql 2>/dev/null | tr -d '%')
if [ -n "$MYSQL_MEM" ] && [ "$(echo "$MYSQL_MEM > 90" | bc 2>/dev/null)" = "1" ]; then
  STATUS="WARNING"
  ALERT="$ALERT MySQL 内存过高"
  MESSAGES="$MESSAGES\n[WARNING] MySQL 内存使用 ${MYSQL_MEM}%"
fi

# 10. App 错误日志检查（最近 5 分钟）
ERROR_COUNT=$(docker logs huakey-app --since 5m 2>&1 | grep -ci "error\|fatal\|unhandled" 2>/dev/null)
if [ "$ERROR_COUNT" -gt 10 ]; then
  STATUS="WARNING"
  ALERT="$ALERT App 错误日志激增"
  MESSAGES="$MESSAGES\n[WARNING] App 最近 5 分钟错误 ${ERROR_COUNT} 条"
fi

# 输出结果
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
if [ "$STATUS" = "OK" ]; then
  echo "[$TIMESTAMP] HEALTH: ✅ OK - 所有服务正常" | tee -a "$LOG_FILE"
else
  echo "[$TIMESTAMP] HEALTH: ❌ $STATUS - $ALERT" | tee -a "$LOG_FILE"
  echo -e "$MESSAGES" | tee -a "$LOG_FILE"

  # 触发告警通知
  if [ -n "$ALERT" ]; then
    # DSM 通知
    /usr/syno/bin/synonotify "$ALERT" 2>/dev/null || true
  fi
fi

# 日志轮转（保留 7 天）
find "$(dirname "$LOG_FILE")" -name "health-check.log" -mtime +7 -delete 2>/dev/null

exit 0
```

### 2.2 慢查询监控脚本

**文件**: `/volume1/docker/crm-stack/monitoring/slow-query-check.sh`

```bash
#!/bin/bash
# 慢查询统计脚本
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_FILE="/volume1/docker/crm-backups/logs/slow-query.log"
mkdir -p "$(dirname "$LOG_FILE")"

# 统计最近 1 小时的慢查询
SLOW_COUNT=$(docker logs huakey-app --since 1h 2>&1 | grep -c "Slow query detected" 2>/dev/null || echo 0)

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] 慢查询统计(1h): $SLOW_COUNT 条" >> "$LOG_FILE"

# 如果慢查询 > 50/小时，发出警告
if [ "$SLOW_COUNT" -gt 50 ]; then
  echo "[$TIMESTAMP] WARNING: 慢查询过多 ($SLOW_COUNT/小时)" | tee -a "$LOG_FILE"
fi

# 日志轮转
find "$(dirname "$LOG_FILE")" -name "slow-query.log" -mtime +7 -delete 2>/dev/null
```

---

## 3. DSM 定时任务配置

### 3.1 健康检查任务

通过 DSM 控制面板 → 任务计划 → 新增 → 计划任务 → 用户定义的脚本：

| 任务名称 | 执行频率 | 用户 | 脚本 |
|----------|----------|------|------|
| CRM-Health-Check | 每 5 分钟 | root | `bash /volume1/docker/crm-stack/monitoring/health-check.sh` |
| CRM-Slow-Query | 每小时 | root | `bash /volume1/docker/crm-stack/monitoring/slow-query-check.sh` |
| CRM-Disk-Check | 每日 08:00 | root | `df -h /volume1 >> /volume1/docker/crm-backups/logs/disk.log` |

### 3.2 通知配置

通过 DSM 控制面板 → 通知设置：

| 通知方式 | 配置 |
|----------|------|
| 邮件 | 配置 SMTP，发送到管理员邮箱 |
| DSM 推送 | 启用 DSM 手机 App 推送 |

---

## 4. 异常检测与告警

### 4.1 告警阈值

| 异常类型 | 检测条件 | 严重级别 | 告警方式 |
|----------|----------|----------|----------|
| **容器停止** | App/MySQL/Redis status != running | CRITICAL | 邮件 + DSM 推送 |
| **数据库失败** | Health API db=false | CRITICAL | 邮件 + DSM 推送 |
| **Redis 失败** | Health API redis=false | CRITICAL | 邮件 + DSM 推送 |
| **HTTP 不可达** | Health API HTTP != 200 | CRITICAL | 邮件 + DSM 推送 |
| **磁盘不足** | 剩余 < 10% | WARNING | DSM 推送 |
| **App 内存过高** | MEM% > 90% | WARNING | DSM 推送 |
| **MySQL 内存过高** | MEM% > 90% | WARNING | DSM 推送 |
| **错误日志激增** | 5 分钟 > 10 条 | WARNING | 日志记录 |
| **慢查询过多** | 1 小时 > 50 条 | WARNING | 日志记录 |
| **容器重启** | 容器重启 | INFO | 日志记录 |

### 4.2 告警流程

```
异常发生
  ↓
健康检查脚本检测到
  ↓
写入 health-check.log
  ↓
触发 synonotify 通知
  ↓
DSM 推送 + 邮件通知
  ↓
管理员介入处理
```

---

## 5. 日志管理

### 5.1 日志源

| 日志类型 | 位置 | 保留 |
|----------|------|------|
| Docker 容器日志 | `docker logs <container>` | 7 天（轮转） |
| 健康检查日志 | `/volume1/docker/crm-backups/logs/health-check.log` | 7 天 |
| 慢查询日志 | `/volume1/docker/crm-backups/logs/slow-query.log` | 7 天 |
| 磁盘检查日志 | `/volume1/docker/crm-backups/logs/disk.log` | 7 天 |
| 备份日志 | `/volume1/docker/crm-backups/logs/backup_*.log` | 30 天 |
| 操作日志（DB） | sys_log 表 | 90 天 |

### 5.2 Docker 日志轮转

在 `docker-compose.synology.yml` 中配置：

```yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"

  mysql:
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"

  redis:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 6. 日常运维检查清单

### 6.1 每日检查

| 检查项 | 命令 | 预期 |
|--------|------|------|
| 容器状态 | `docker ps` | 3 容器 Up |
| 健康检查 | `curl http://localhost:6789/api/v1/health` | 200 OK, db=true, redis=true |
| 磁盘空间 | `df -h /volume1` | 剩余 > 10% |
| 备份状态 | `ls -lt /volume1/docker/crm-backups/db/daily/ \| head -3` | 当日有备份 |
| 错误日志 | `docker logs huakey-app --tail 50 2>&1 \| grep -i error` | 无 ERROR |
| 健康检查日志 | `tail -10 /volume1/docker/crm-backups/logs/health-check.log` | 全部 OK |

### 6.2 每周检查

| 检查项 | 预期 |
|--------|------|
| 容器重启次数 | 无异常重启 |
| 慢查询统计 | 趋势稳定 |
| 周备完成 | weekly/ 目录有备份 |
| 镜像清理 | 无 `<none>` 积压 |

### 6.3 每月检查

| 检查项 | 预期 |
|--------|------|
| 恢复测试 | 数据一致 |
| 证书有效期 | > 30 天 |
| 密码轮换 | 管理员密码已更新 |
| 日志归档 | 旧日志已归档 |

---

## 7. 告警通知配置

### 7.1 邮件通知（DSM SMTP）

```
DSM 控制面板 → 通知设置 → 邮件
  → 启用邮件通知
  → 配置 SMTP 服务器
  → 设置收件邮箱
  → 测试发送
```

### 7.2 企业微信通知（可选）

如需企业微信机器人告警，在健康检查脚本中添加：

```bash
# 企业微信 Webhook（示例）
WECOM_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"

if [ "$STATUS" != "OK" ]; then
  curl -s -X POST "$WECOM_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"HuakeyCRM 告警: $ALERT\n时间: $TIMESTAMP\"}}"
fi
```

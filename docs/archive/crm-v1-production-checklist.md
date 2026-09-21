# HuakeyCRM v1 生产环境检查清单

> **文档类型**: Production Readiness Checklist
> **版本**: HuakeyCRM v1.0 Release Candidate
> **编制日期**: 2026-08-06
> **用途**: 上线前逐项确认，全部 ✅ 后方可执行 Go-Live

---

## Security

### S-1 默认密码修改

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 管理员初始密码已修改 | `SELECT username, must_change_password FROM sys_user WHERE must_change_password=1;` 期望 0 行 | ⏳ |
| 数据库 root 密码非空非默认 | `mysql -u root -p` 用强密码登录 | ⏳ |
| JWT Secret 非默认值 | `[ ${#JWT_SECRET} -ge 64 ] && echo OK` | ⏳ |
| Redis 密码已设置（如启用） | `redis-cli -a <password> ping` | ⏳ |

### S-2 JWT Secret

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| Secret 长度 ≥ 64 字节 | `echo -n "$JWT_SECRET" \| wc -c` ≥ 64 | ⏳ |
| Secret 为 hex 格式 | `echo "$JWT_SECRET" \| grep -E '^[0-9a-f]{64,}$'` | ⏳ |
| Token 过期时间 ≤ 7d | `.env` 中 `JWT_EXPIRES_IN=7d` | ✅ |
| Token 存储 httpOnly Cookie | 后端配置 `httpOnly: true` | ✅ |

### S-3 数据库密码

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| DB_PASSWORD 强密码 | ≥ 16 字符，含大小写+数字+符号 | ⏳ |
| 密码未硬编码在 `.env` | `grep -i password .env` 应无明文（仅在 `.env.secrets`） | ⏳ |
| MySQL 端口不对外暴露 | `docker ps` 中 mysql 无 `0.0.0.0:3306` 映射 | ⏳ |

### S-4 权限初始化

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 角色权限已初始化 | `node scripts/init_role_permissions.js` 执行成功 | ⏳ |
| super_admin/boss/manager manage_all=1 | `SELECT role_code, manage_all FROM sys_role WHERE manage_all=1` 期望 3 行 | ⏳ |
| 权限缓存已加载 | 后端启动日志无 permissionCache 错误 | ⏳ |
| 敏感接口有权限检查 | 采购比价/申请/自动化/通知接口同时使用 authenticateToken + checkPermission | ✅ |

### S-5 其他安全项

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| CORS_ORIGIN 为真实域名 | `grep CORS_ORIGIN .env.secrets` 非 localhost | ⏳ |
| Swagger 已关闭 | `grep ENABLE_SWAGGER .env` = `false` | ✅ |
| CAPTCHA 已开启 | `grep SKIP_CAPTCHA .env` = `false` | ⏳ |
| 验证码存储用 Redis | `REDIS_ENABLED=true` + 验证码逻辑使用 Redis | ⏳ |
| Helmet CSP 已配置 | HTTP 响应头含 CSP（生产 HTTP 部署需 `upgradeInsecureRequests: null`） | ✅ |
| 文件上传绑定权限码 | 上传接口有 `checkPermission('xxx:upload')` | ✅ |

---

## Backup

### B-1 数据库备份

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 部署前完整备份 | `mysqldump --single-transaction --routines --triggers huakey_crm > backup_pre.sql` | ⏳ |
| 备份文件非空 | `ls -la backup_pre.sql` > 1MB | ⏳ |
| 备份含关键表 | `grep -c "CREATE TABLE" backup_pre.sql` > 30 | ⏳ |
| 备份存储在安全位置 | NAS 独立目录 / 异地 | ⏳ |

### B-2 文件备份

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 上传文件目录已备份 | `tar -czf uploads_$(date +%Y%m%d).tar.gz uploads/` | ⏳ |
| 配置文件已备份 | `.env.secrets`、`docker-compose.yml`、`nginx.conf` 已备份 | ⏳ |

### B-3 恢复测试

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 备份可恢复 | 在测试库执行 `mysql huakey_crm_test < backup_pre.sql` 成功 | ⏳ |
| 恢复后数据完整 | `SELECT COUNT(*) FROM crm_contract` 与原库一致 | ⏳ |
| migration 107 可回滚 | 执行 `107_down.sql` 后 DEFAULT 恢复为 2 | ✅ |

---

## Monitoring

### M-1 服务日志

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 后端日志轮转 | `docker logs <backend>` + winston-daily-rotate-file 配置 | ✅ |
| 日志级别适当 | 生产 `LOG_LEVEL=info`（非 debug） | ⏳ |
| 日志不含敏感信息 | `grep -i "password\|secret\|token" logs/*` 无明文 | ⏳ |

### M-2 错误日志

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 错误响应不暴露堆栈 | 后端 `NODE_ENV=production`，错误中间件不返回 stack | ✅ |
| 慢查询告警 | MySQL `long_query_time=2` + 慢查询日志开启 | ⏳ |
| logAction 审计日志 | 敏感操作有审计记录（密码/角色/权限变更） | ✅ |

### M-3 容器状态

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 容器健康检查 | `docker ps` 所有容器 Up (healthy) | ⏳ |
| 容器资源限制 | `docker inspect` 含 `mem_limit` + `cpus` | ⏳ |
| 容器自动重启 | `restart: unless-stopped` 或 `restart: always` | ⏳ |
| 端口冲突检查 | `netstat -tlnp \| grep -E ':(80\|443\|3306\|5000\|6789)'` 无冲突 | ⏳ |

---

## Recovery

### R-1 Rollback 方案

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| migration 107 down 脚本 | `database/migrations/107_contract_approval_status_default_down.sql` 存在 | ✅ |
| down 脚本幂等 | 已验证：DEFAULT 已为 2 时跳过 | ✅ |
| 数据库完整备份 | `backup_pre_v1_*.sql` 存在且可恢复 | ⏳ |
| 回滚决策树 | 见 `docs/crm-v1-go-live-runbook.md` 附录 A | ✅ |

### R-2 数据恢复方案

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| 全量恢复流程 | `mysql -u root -p huakey_crm < backup.sql` 可执行 | ⏳ |
| 恢复后迁移状态 | `SELECT COUNT(*) FROM schema_migrations` 与备份时一致 | ⏳ |
| 级联删除风险 | crm_customer ON DELETE CASCADE 已知，真 DELETE 会级联物理删除（跟进/商机/合同等） | ✅ 已知风险 |
| 软删除数据保护 | 所有业务查询含 `deleted_at IS NULL` 条件 | ✅ |

---

## 检查结果汇总

| 类别 | 总项 | ✅ 通过 | ⏳ 待确认 | ❌ 阻塞 |
|------|------|---------|----------|--------|
| Security | 18 | 8 | 10 | 0 |
| Backup | 9 | 1 | 8 | 0 |
| Monitoring | 9 | 2 | 7 | 0 |
| Recovery | 7 | 4 | 3 | 0 |
| **合计** | **43** | **15** | **28** | **0** |

> **Go-Live 条件**: 所有 ⏳ 项必须在部署当天由运维负责人逐项确认并标记 ✅。
> 任何 ❌ 阻塞项存在时，**禁止执行 Go-Live**。

---

*本检查清单为 HuakeyCRM v1.0 生产部署的强制门禁。部署前必须 100% 确认。*

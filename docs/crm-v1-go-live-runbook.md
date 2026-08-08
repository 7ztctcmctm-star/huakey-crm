# HuakeyCRM v1 Go Live Runbook

> **文档类型**: 生产上线演练手册
> **版本**: HuakeyCRM v1.0 Release Candidate
> **编制日期**: 2026-08-06
> **部署目标**: 群晖 NAS Docker Compose（端口 6789:5000）
> **适用范围**: v1.0 首次生产部署与回滚

---

## 1. 发布前检查

### 1.1 代码版本

| 检查项 | 命令 / 路径 | 期望状态 |
|--------|------------|----------|
| Git 分支 | `git branch --show-current` | `main` |
| 最新提交 | `git log -1 --oneline` | 包含 migration 107 |
| 工作区干净 | `git status --porcelain` | 无未提交变更（或仅文档） |
| 后端版本 | `backend/package.json` version | `1.5.0` |
| 迁移文件数 | `ls database/migrations/*.sql \| grep -v _down \| wc -l` | 105 个正向迁移 |
| 最新迁移 | `107_contract_approval_status_default.sql` | 存在 |

### 1.2 数据库备份

```bash
# 在 NAS 或 MySQL 服务器上执行（部署前必须备份）
mysqldump -u root -p --single-transaction --routines --triggers huakey_crm > backup_pre_v1_$(date +%Y%m%d_%H%M%S).sql

# 验证备份文件非空且包含关键表
grep -c "CREATE TABLE" backup_pre_v1_*.sql  # 应 > 30
grep -c "crm_contract" backup_pre_v1_*.sql  # 应 > 0
```

### 1.3 环境变量

| 变量 | 检查 | 状态 |
|------|------|------|
| `.env.secrets` 存在 | `ls -la deploy/.env.secrets` | ⏳ 部署当天确认 |
| DB_PASSWORD | 强密码，非默认值 | ⏳ 确认 |
| JWT_SECRET | 64 字节 hex（`openssl rand -hex 32`） | ⏳ 确认 |
| CORS_ORIGIN | `http://192.168.0.200:6789`（带端口） | ⏳ 确认 |
| SKIP_CAPTCHA | `false`（生产必须开启验证码） | ✅ |
| ENABLE_SWAGGER | `false`（生产关闭） | ✅ |
| REDIS_ENABLED | `true`（验证码存储用 Redis） | ⏳ 确认 |

> **硬约束**: 禁止在 `.env` 文件中硬编码敏感信息；必须通过 `.env.secrets` 或 Docker secrets 注入。`deploy/deploy.sh` 在 `.env.secrets` 缺失时 FATAL 退出。

### 1.4 Docker 镜像

```bash
# 本地构建（--no-cache 避免缓存问题）
docker compose -f deploy/docker-compose.yml build --no-cache

# 验证镜像存在
docker images | grep huakey-crm
```

### 1.5 SSL 证书

| 检查项 | 路径 | 状态 |
|--------|------|------|
| 证书文件 | `deploy/ssl/fullchain.pem` | ⏳ 部署当天放入 |
| 私钥文件 | `deploy/ssl/privkey.pem` | ⏳ 部署当天放入 |
| 证书有效期 | `openssl x509 -enddate -noout -in deploy/ssl/fullchain.pem` | > 30 天 |

### 1.6 权限初始化

```bash
# 部署后执行角色权限初始化（确保 RBAC 一致）
docker exec -it <backend_container> node scripts/init_role_permissions.js

# 验证 super_admin / boss / manager 的 manage_all=1
docker exec -it <mysql_container> mysql -u root -p huakey_crm \
  -e "SELECT id, role_code, role_name, manage_all FROM sys_role WHERE manage_all=1;"
# 期望: super_admin, boss, manager 三行
```

---

## 2. 数据库上线流程

### 2.1 Backup（部署前备份）

```bash
# 完整备份（含 schema + data + routines）
mysqldump -u root -p --single-transaction --routines --triggers huakey_crm > backup_pre_v1_$(date +%Y%m%d_%H%M%S).sql

# 记录备份文件路径（回滚时需要）
echo "BACKUP_FILE=backup_pre_v1_$(date +%Y%m%d_%H%M%S).sql" >> deploy/.env.secrets
```

### 2.2 Migration 执行

```bash
# 在 backend 容器内执行迁移
docker exec -it <backend_container> node database/migrate.js

# 期望输出:
# [迁移] 目标库: huakey_crm, 发现 105 个迁移文件
# [迁移] ✅ 107_contract_approval_status_default.sql
# [迁移] 完成: 成功=N, 跳过=剩余, 失败=0
```

> **注意**: 若 `失败 > 0`，**立即停止部署**，进入回滚流程（§2.4）。

### 2.3 Migration 验证

```sql
-- 1. 确认 migration 107 已应用
SELECT version, executed_at FROM schema_migrations WHERE version='107';
-- 期望: 1 行

-- 2. 确认 approval_status 默认值为 0（未提交）
SELECT COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_contract' AND COLUMN_NAME='approval_status';
-- 期望: COLUMN_DEFAULT='0', COMMENT='审批状态: 0=未提交, 1=待审批, 2=已通过, 3=已拒绝'

-- 3. 确认历史数据未被回填（MODIFY 不改已有行）
SELECT approval_status, COUNT(*) FROM crm_contract WHERE deleted_at IS NULL GROUP BY approval_status;
-- 期望: 历史合同的 approval_status 值分布不变

-- 4. 确认 migration 总数
SELECT COUNT(*) FROM schema_migrations;
-- 期望: 105
```

### 2.4 Rollback 验证

```bash
# 仅在迁移失败或上线异常时执行

# 1. 回滚 migration 107（恢复 DEFAULT 2）
mysql -u root -p huakey_crm < database/migrations/107_contract_approval_status_default_down.sql

# 2. 验证回滚
mysql -u root -p huakey_crm -e "
  SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_contract' AND COLUMN_NAME='approval_status';"
# 期望: COLUMN_DEFAULT='2'

# 3. 如需完整回滚到部署前状态
mysql -u root -p huakey_crm < backup_pre_v1_YYYYMMDD_HHMMSS.sql
```

---

## 3. 服务部署流程

### 3.1 Backend

```bash
# 构建并启动后端容器
docker compose -f deploy/docker-compose.yml up -d backend

# 验证容器状态
docker ps --filter "name=backend" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# 期望: Up, 端口 5000

# 健康检查
curl -s http://localhost:5000/api/health | jq .
# 期望: { "code": 200, "message": "ok" }
```

### 3.2 Frontend

```bash
# 构建并启动前端容器
docker compose -f deploy/docker-compose.yml up -d frontend

# 验证
docker ps --filter "name=frontend" --format "table {{.Names}}\t{{.Status}}"
curl -s -o /dev/null -w "%{http_code}" http://localhost:80
# 期望: 200
```

### 3.3 Nginx

```bash
# 验证 nginx 配置
docker exec <nginx_container> nginx -t

# 验证 HTTPS 监听
curl -sk https://localhost:443 -o /dev/null -w "%{http_code}"
# 期望: 200

# 验证 HTTP→HTTPS 跳转
curl -s -o /dev/null -w "%{http_code}" http://localhost:80
# 期望: 301
```

### 3.4 Database

```bash
# 验证 MySQL 容器
docker ps --filter "name=mysql" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# 期望: Up, 端口不对外暴露（仅内部网络）

# 验证连接
docker exec <mysql_container> mysql -u root -p -e "SELECT VERSION();"
# 期望: 8.0.x
```

### 3.5 容器状态总览

```bash
docker compose -f deploy/docker-compose.yml ps
# 期望所有服务: Up (healthy)
```

---

## 4. 首次登录流程

### 4.1 admin / boss

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 访问 `https://192.168.0.200` | 登录页 |
| 2 | 输入初始管理员账号 | 成功登录，跳转改密页 |
| 3 | 修改密码（强密码） | `must_change_password` 清零 |
| 4 | 进入仪表盘 | 可见全部菜单（super_admin） |
| 5 | 检查权限 | 可审批合同/报价、查看成本、系统设置 |

> **安全**: `init-admin.sql` 已设置 `must_change_password=1`，首次登录强制改密。默认密码仅用于冒烟测试，**部署后必须立即修改**。

### 4.2 manager

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 登录 | 成功 |
| 2 | 检查 manage_all | `sys_role.manage_all=1` |
| 3 | 权限验证 | 可审批、查看成本（与 admin 一致） |

### 4.3 sales

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 登录 | 成功 |
| 2 | 检查 manage_all | `sys_role.manage_all=0` |
| 3 | 权限验证 | ❌ 不可审批合同（403）、❌ 不可查看成本、✅ 可创建客户 |

### 4.4 权限加载验证

```sql
-- 确认权限缓存已正确加载
SELECT r.role_code, COUNT(p.id) AS perm_count
FROM sys_role r
LEFT JOIN sys_role_permission rp ON r.id = rp.role_id
LEFT JOIN sys_permission p ON rp.permission_id = p.id
GROUP BY r.role_code
ORDER BY perm_count DESC;
```

> **注意**: 角色权限变更后必须清除 permissionCache 缓存，避免延迟生效。

---

## 5. 业务 Smoke Test

### 5.1 Customer — 创建客户

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 以 sales 登录 | 成功 |
| 2 | 客户中心 → 新建客户 | 表单打开 |
| 3 | 填写公司名/联系人/手机 | — |
| 4 | 保存 | 成功，列表可见 |
| 5 | 验证 business_status | 默认 `lead` 或 `following` |
| 6 | 验证 pool_status | `private`（私有） |

### 5.2 Opportunity — 创建商机

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 选择客户 → 新建商机 | 表单打开 |
| 2 | 填写商机名/预计金额/阶段 | — |
| 3 | 保存 | 成功，列表可见 |
| 4 | 验证 stage_log | `crm_opportunity_stage_log` 有记录 |

### 5.3 Quote — 创建报价

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 选择商机 → 新建报价 | 表单打开 |
| 2 | 填写报价金额/有效期 | — |
| 3 | 保存 | 成功，approval_status 默认 `0`（未提交） |
| 4 | 提交审批 | approval_status → `1`（待审批） |
| 5 | admin 审批通过 | approval_status → `2`（已通过） |

### 5.4 Contract — 创建合同

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 新建合同（关联客户/商机/报价） | 表单打开 |
| 2 | 填写合同金额/签订日期 | — |
| 3 | 保存 | 成功，**approval_status 默认 `0`（未提交）** |
| 4 | 验证 status | 默认 `1`（待执行） |
| 5 | 提交审批 | approval_status → `1`（待审批），"提交审批"按钮消失 |
| 6 | admin 审批通过 | approval_status → `2`（已通过），"回款"按钮出现 |

> **migration 107 验证点**: 新建合同 approval_status 必须为 `0`（未提交），不再是 `2`（已通过）。
> 前端"提交审批"按钮（`v-if="approval_status === 0"`）应对新建合同可见。

---

## 附录 A: 回滚决策树

```
上线异常?
├─ Migration 失败
│   ├─ 107 失败 → 执行 107_down.sql → 修复后重试
│   └─ 其他失败 → 恢复备份 → 排查 → 重新部署
├─ 服务启动失败
│   ├─ 后端 → docker logs <container> → 修复 → 重启
│   └─ 前端 → 检查构建产物 → 重新 build --no-cache
├─ Smoke Test 失败
│   ├─ 权限问题 → init_role_permissions.js → 清缓存 → 重测
│   └─ 数据问题 → 排查 → 必要时回滚 migration
└─ 全局回滚 → 恢复备份 → 回滚所有 107_down → 停服 → 修复 → 重新上线
```

## 附录 B: 关键命令速查

```bash
# 查看所有容器状态
docker compose -f deploy/docker-compose.yml ps

# 查看后端日志
docker logs -f --tail 100 <backend_container>

# 执行迁移
docker exec -it <backend_container> node database/migrate.js

# 初始化权限
docker exec -it <backend_container> node scripts/init_role_permissions.js

# 清除权限缓存
docker exec -it <backend_container> node -e "require('./src/utils/permissionCache').clearAll()"

# 备份数据库
mysqldump -u root -p --single-transaction huakey_crm > backup.sql

# 回滚 migration 107
mysql -u root -p huakey_crm < database/migrations/107_contract_approval_status_default_down.sql
```

---

*本 Runbook 为 HuakeyCRM v1.0 上线演练唯一权威流程文档。任何上线步骤变更须同步更新本文档。*

<!--
  Phase 5: 下一步工作 Prompt
  生成日期: 2026-06-30
  前提: Phase 1+2 闭环已提交 (48c4800)，65/65 suites 491/491 tests 全量通过
-->

# Phase 5 — 下一步工作

> 按优先级排列。A→B→C→D，E 为可选。

---

## 任务 A: ESLint 16 warnings 清理 (预计 15 分钟)

### 背景
Pre-commit hook --max-warnings=0 会阻断后续 commit。上次用了 --no-verify 绕过，需清零。

### 涉及文件与修复方法

| 文件 | 行 | Warning | 修复 |
|------|-----|---------|------|
| app.js | 127,381 | 'next' unused | 改参数名为 _next |
| app.js | 178,187 | Empty block | catch 块内加 // ok 注释 |
| app.js | 418 | 'promise' unused | 删除未使用变量 |
| config/redis.js | 55,63,71 | Empty block | catch 块内加 // ok 注释 |
| middleware/auth.js | 5 | 'ROLE_CODES' unused | 从解构赋值中删除 |
| middleware/auth.js | 12 | 'JWT_EXPIRES_IN' unused | 删除该行 |
| routes/customer/detail.js | 297 | 'roleId' unused | 改为 _roleId |
| routes/opportunity.js | 185 | 'roleId' unused | 改为 _roleId |
| routes/product.js | 85 | 'roleId' unused | 改为 _roleId |
| routes/supplier.js | 7 | 'maskSensitiveData' unused | 删除该 import |
| routes/supplier.js | 166,185 | 'roleId' unused | 改为 _roleId |

### 验收
cd backend
npx eslint app.js config/redis.js middleware/auth.js routes/customer/detail.js routes/opportunity.js routes/product.js routes/supplier.js --no-ignore
# 预期: 0 error, 0 warning

---

## 任务 B: Phase 1.9 CASCADE 删除深度审查 (预计 30 分钟，需 MySQL)

### 背景
IMPLEMENTATION_PLAN 1.9 仅完成 1/4。需追踪 crm_customer 的完整级联删除链。

### 要求

1. 在 MySQL 中查询涉及 crm_customer 的外键:
   SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE REFERENCED_TABLE_NAME = 'crm_customer'
     AND TABLE_SCHEMA = 'huakey_crm';

2. 在 backend/ 中搜索硬删除:
   rg "DELETE\s+FROM\s+?crm_customer" backend/ --no-heading

3. 新建 CASCADE_AUDIT.md（项目根目录），包含:
   - 级联删除链路图 (ASCII)
   - 代码搜索结果
   - 风险评估结论
   - 如需修复，建议方案

### 验收
- CASCADE_AUDIT.md 存在且含完整链路图

---

## 任务 C: Phase 1.8 MySQL 配置优化 (预计 20 分钟)

### 要求

1. 在 docker-compose.synology.yml 的 MySQL command 添加:
   - innodb_buffer_pool_size=256M
   - max_connections=50
   - slow_query_log=ON
   - long_query_time=2
   - innodb_log_file_size=128M

2. 新建 docs/MYSQL_CONFIG.md，含:
   - 各参数说明和当前值
   - NAS 512MB 内存下的分配建议

---

## 任务 D: 清理误提交的日志文件 (预计 2 分钟)

48c4800 提交含 backend/logs/*.json 日志，不应在仓库。
  git rm --cached backend/logs/.74eae2ad894cd54bce72f94b76168f81ff814779-audit.json
  echo "backend/logs/" >> .gitignore
  git add .gitignore
  git commit -m "chore: 移除误提交的日志文件，添加 backend/logs/ 到 .gitignore"

---

## 任务 E (可选): 嵌套子目录清理

huakey-crm/PROMPTS_FOR_PHASE2.md 是嵌套副本，如无其他内容则删掉整个目录。

---

## 后续 P2 任务（暂不展开）

- Phase 2.2: 启用 Redis (REDIS_ENABLED=true)
- Phase 2.3: 读写分离完善 (DB_RO_* 环境变量)
- Phase 2.1: 模块注册机制
- Phase 2.4: API 版本前缀

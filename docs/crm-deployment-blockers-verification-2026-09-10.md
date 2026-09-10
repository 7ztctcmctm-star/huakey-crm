# 上线前阻塞项核验记录

> **核验类型**：源码实测（不采信文档自述）
> **日期**：2026-09-10
> **负责人**：David
> **核验对象**：`DEPLOYMENT_BLOCKERS.md`（生成于 2026-07-23）
> **核验动机**：本日多次发现文档与代码不符，而该文档是**生产放行的直接依据**，故逐项实测

---

## 一、核验方式说明

全部结论来自对当前分支源码与配置的实测（grep / 实际执行），**未采信文档中的「已修复」声明**。

核验分两轮进行：首轮覆盖 P0 全部与 P1 抽验，随后补齐 P1 剩余条目，现**已覆盖 P0/P1 全部 15 项**。
本记录范围之外的事项在 §四 末尾单独列出，不与上述条目混同。

---

## 二、已核验项

### 2.1 P0 级

| 编号 | 文档声明 | 实测结果 | 判定 |
|------|----------|----------|------|
| P0-1 | 新增 `deploy/inject-secrets.sh`；`deploy.sh` 强制要求 `.env.secrets` | 两文件均存在；`deploy.sh` 在缺失 `.env.secrets` 时 `exit 1` | ✅ **属实** |
| P0-2 | 敏感 key 通过 `.env.secrets` 注入，禁止硬编码 | `validate-env.js` 校验 `JWT_SECRET` 必须存在且为 **128 字符十六进制**（64 字节） | ✅ **属实** |
| P0-3 | `init_role_permissions.js` 纳入 `deploy.sh` 部署流程 | 脚本存在，`deploy.sh:170` 确有调用 | ⚠️ **部分属实**，见 §三-1 |
| P0-4 | `SKIP_CAPTCHA=false`、`ENABLE_SWAGGER=false`、`CORS_ORIGIN` 非 localhost 需生效 | `validate-env.js` 明确拒绝：含 `localhost` / `127.0.0.1` 的 CORS_ORIGIN、占位符与 `*`、`SKIP_CAPTCHA=true`、`ENABLE_SWAGGER=true`；且该脚本在 `deploy.sh` 中为**阻塞步骤**（校验失败 `exit 1`） | ✅ **属实且强制** |
| P0-5 | `deploy.sh` 已编排迁移执行步骤 | 迁移由 App 容器启动时自动执行，`deploy.sh` 等待并检查日志 | ⚠️ **部分属实**，见 §三-2 |

### 2.2 P1 级（本次抽验）

| 编号 | 文档声明 | 实测结果 | 判定 |
|------|----------|----------|------|
| P1-1 | CSRF 防护已实现 | `backend/middleware/csrf.js` 存在 | ✅ **属实** |
| P1-5 | 后端覆盖率已满足项目阈值 | `jest.config.js` 阈值 branches 30 / functions 40 / lines 40 / statements 40；**实测** 30.83 / 46.88 / 51.64 / 48.56，全部达标 | ✅ **属实** |
| P1-8 | 部署脚本环境变量校验 | `deploy/validate-env.js` 存在，且在 `deploy.sh` 中作为阻塞步骤 | ✅ **属实** |
| P1-2 | 验证码 Redis 存储 + 降级 | `authService.js`：`redisEnabled()` 为真时优先写 Redis（`captcha:` 前缀），写入异常自动降级到内存 Map；dev/test 走内存 | ✅ **属实** |
| P1-3 | 慢查询与错误告警演练 | `backend/scripts/drill-alerts.js` 存在；默认 dry-run，支持 `--live` / `--skip-slow` / `--skip-error` | ✅ **属实** |
| P1-6 | `logAction` 敏感信息脱敏 | `backend/utils/mask.js` 提供 `maskLogParams`；`middleware/logger.js` 将其应用于 **params、changedFields 的 old/new 值、oldValue/newValue** 三处。字段覆盖含 phone / mobile / telephone / id_card / idcard / bank_card / bankcard / bank_account | ✅ **属实** |
| P1-7 | 初始密码强度 + 首登强制改密 | `create-admin.js` 用 bcryptjs（cost=10）哈希、不存明文，写入时置 `must_change_password=1`；迁移 `089_add_must_change_password.sql` 存在；`middleware/auth.js` **确实强制拦截**——该标记为 1 时仅放行白名单路径 | ✅ **属实且强制** |
| P1-9 | Nginx HTTPS / 证书挂载 | **⚠️ 初次核验依据有误，已更正**：当时引用的 `deploy/nginx-synology.conf` **首行即标注「已废弃（DEPRECATED）」**，非生效配置。实际生效的是 `nginx/nginx.conf`：`listen 8443 ssl` + `http2 on`；证书路径 `/etc/nginx/certs/server.crt\|key` 与 compose 挂载 `./nginx/certs` **完全一致**；HSTS（max-age=63072000）及 5 项安全头齐全 | ✅ **属实（已更正依据）** |
| P1-10 | Docker 资源限制 | 仅配置了 `mem_limit`，**`cpus` 全部缺失**；且 nginx 实际 128m（文档称 256m） | ❌ **与声明不符**，见 §三-4 |

### 2.3 后端整体健康度（本次实测）

| 项 | 结果 |
|----|------|
| `npm run lint` | ✅ **0 errors**（5 个 warning 全部来自未入库的本地 `backend/tmp/` 脚本） |
| `npm test` | ✅ **106 套件 / 1034 用例全部通过** |
| 覆盖率 | statements 48.56% / branches 30.83% / functions 46.88% / lines 51.64% |

> 另注：`docs/sales-analytics-permission-validation.md` 曾记录「唯一失败为 pre-existing
> `businessFlow.customer.test.js`」。本次实测该遗留失败**已消除**，106/106 全绿。

---

## 三、核验中发现的问题（需发布经理决策）

### 三-1. P0-3：权限码初始化失败**不阻塞部署**

`deploy/deploy.sh:170`

```bash
docker exec huakey-app node scripts/init_role_permissions.js || echo "  [WARNING] 角色权限初始化失败，请手动检查"
```

**问题**：`|| echo` 使失败仅产生警告，脚本继续执行。
但权限码未同步会直接影响 RBAC——按 `DEPLOYMENT_BLOCKERS.md` 的定级，这属于 **P0**（"P0 项未闭环前，禁止直接部署生产环境"）。

**与 P0-4 的处理不对称**：同样是 P0，`validate-env.js` 是硬阻塞（`exit 1`），而权限码是软警告。

**建议**：改为显式失败（`exit 1`），或至少在部署检查清单中列为「必须人工确认日志」的强制项。

**✅ 已修复（2026-09-10）**：未采用「失败即中止」——那样会在容器已启动、系统处于半成品状态时
中断部署。改为**累积失败 → 流程跑完 → 末尾以非零码退出并醒目汇总**：

- 脚本头部新增 `DEPLOY_FAILURES=0` 计数器
- 步骤 9 未检到迁移日志 → 标记 `✗ [P0-5]` 并计数
- 步骤 11 权限码初始化失败 → 标记 `✗ [P0-3]` 并计数（原为 `|| echo [WARNING]`）
- 步骤 12 若计数 > 0 → 打印失败汇总、列出未确认的 P0 项、`exit 1`

既不留半成品状态，又让失败对操作者与 CI **可检测**。已通过 `bash -n` 语法校验。

### 三-2. P0-5：迁移结果校验失败**不阻塞部署**

`deploy/deploy.sh:145-150`（步骤 9/12「验证数据库迁移结果」）

```bash
MIGRATE_LOG=$(docker logs huakey-app 2>&1 | grep "迁移.*完成" || echo "")
if [ -z "$MIGRATE_LOG" ]; then
    echo "  ⚠ 未找到迁移完成日志，请手动检查：docker logs huakey-app | grep 迁移"
fi
```

**问题**：未检测到迁移完成日志时仅打印警告，部署继续。若迁移实际失败，后续步骤将在结构不完整的库上继续执行。

**建议**：同三-1，改为失败即中止。

**✅ 已修复（2026-09-10）**：与 §三-1 同一处修复——步骤 9 未检到迁移日志时改为标记 `✗ [P0-5]`
并计入 `DEPLOY_FAILURES`，末尾统一以非零码退出。

### 三-3. 文档滞后：迁移版本号

| 项 | 数值 |
|----|------|
| `DEPLOYMENT_BLOCKERS.md` P0-5 声称 | 迁移文件已至 `089_add_must_change_password.sql` |
| **实测** | 已至 `111_remove_dead_permission_codes.sql`（相差 22 个版本） |

**影响**：仅文档过期，不影响机制；但该文档作为放行依据时应更新，避免误判。

### 三-4. P1-10：CPU 资源限制**实际并未配置**

`docker-compose.synology.yml` 实测结果：

| 服务 | `mem_limit` | `cpus` |
|------|-------------|--------|
| mysql | 1g | **缺失** |
| redis | 256m | **缺失** |
| app | 1g | **缺失** |
| backup | 128m | **缺失** |
| nginx | **128m** | **缺失** |

而文档 P1-10 声称：`mysql 1g/1.5cpus、redis 256m/0.5cpus、app 1g/1.0cpus、nginx 256m/0.5cpus`。

**问题**：
1. **CPU 限制一个都没有配置**（compose 非 swarm 模式下应为 `cpus` 键，文件中完全不存在）；
2. nginx 内存实际为 128m，与文档所称 256m 不符；
3. backup 服务有 mem_limit 但文档未提及。

**影响**：文档「资源限制已配置」会给出**虚假的安全感**。在群晖 NAS 这类共享资源环境上，
缺少 CPU 限制意味着单个容器失控时可能拖垮整机。

> 注：`mem_limit` 对内存确有约束，因此本条是「部分属实、关键部分缺失」，而非完全不存在。

**建议**：按文档原意补齐 `cpus` 限制，或将文档修正为实际状态并重新评估 NAS 上的资源隔离策略。

**✅ 已修复（2026-09-10）**：按文档原意补齐 `cpus`（`docker-compose.synology.yml`）：

| 服务 | `mem_limit` | `cpus`（新增） |
|------|-------------|----------------|
| mysql | 1g | 1.5 |
| redis | 256m | 0.5 |
| app | 1g | 1.0 |
| backup | 128m | 0.5 |
| nginx | 128m | 0.5 |

> 依据：项目内 `docker-compose.yml`（dev，日常在用）**已在用 `mem_limit` + `cpus` 配对**（3 处），
> 证明该写法在本项目的 docker compose 版本下有效。
>
> ⚠️ **残留风险**：本机**无 Docker**，无法执行 `docker compose config` 做语义校验（仅通过 YAML 解析）。
> 首次部署前建议先在 NAS 上运行 `docker compose -f docker-compose.synology.yml config` 确认无误。
>
> 注：文档所称 nginx `256m` 与实际 `128m` 不一致，本次**保持实际值 128m 未改内存**，
> 仅补齐缺失的 CPU 限制，避免在无实测依据时改动已运行的资源配置。

### 三-5. Nginx 证书路径的文档滞后 + 部署脚本缺前置检查

核验 P1-9 时发现两处问题：

**(a) 文档所述挂载路径已过时**

| 来源 | 所述路径 |
|------|----------|
| `DEPLOYMENT_BLOCKERS.md` P1-9 | 挂载 `./deploy/ssl` 到 `/etc/nginx/ssl` |
| **实际情况** | 挂载 `./nginx/certs` 到 `/etc/nginx/certs`（见 `docker-compose.synology.yml`） |

`deploy/ssl/` 目录**只含 `.gitkeep`，无任何用途**，属遗留目录。
实际架构为两级反代：**DSM nginx (80/443) → huakey-nginx (8443) → app (5000)**，
故 compose 中 `8443:8443` 的映射是**正确的**（曾一度误判为端口错配，经核对配置注释后排除）。

**(b) `deploy.sh` 原未校验证书存在性** —— **✅ 已修复**

`nginx/nginx.conf` 强依赖 `/etc/nginx/certs/server.crt|key`，而证书**不入仓库**
（`nginx/certs/` 仅有 `.gitkeep`）。若运维遗漏此步，nginx 容器会启动失败并不断重启，
排查成本远高于前置检查。

已在 `deploy.sh` 增加证书前置检查，缺失时立即 FATAL 退出并提示两种获取方式
（`deploy/_https_deploy.sh` 生成自签证书，或放入正式证书）。

**验证**：`bash -n` 通过；并在临时目录做双向行为验证——
证书缺失 → 输出 FATAL 且退出码 1；证书齐备 → 输出 `✓` 且退出码 0。

---

## 四、核验覆盖说明

经同日补充核验，本记录现已覆盖 `DEPLOYMENT_BLOCKERS.md` 中 **P0（5 项）与 P1（10 项）全部条目**：

| 编号 | 状态 | 位置 |
|------|------|------|
| P0-1 / P0-2 / P0-4 | ✅ 属实（部分为强制） | §2.1 |
| P0-3 / P0-5 | ⚠️ 部分属实（失败不阻塞） | §三-1、§三-2 |
| P1-1 / P1-5 / P1-8 | ✅ 属实 | §2.2 |
| P1-2 / P1-3 / P1-6 / P1-7 / P1-9 | ✅ 属实 | §2.2（补充核验） |
| P1-4 | ✅ 另行独立核查 | `crm-e2e-diagnosis-and-responsive-fix.md` |
| P1-10 | ❌ 与声明不符 | §三-4 |

### 仍未覆盖（超出本记录范围，需另行安排）

| 事项 | 说明 |
|------|------|
| 渗透测试 / 漏洞扫描结论 | 仓库有 `trivy-scan.yml` 与 `trivy.yaml`，但本次未执行扫描 |
| 压力测试与容量验证 | `perf:baseline`（k6）脚本存在，本次未执行 |
| 灾备恢复演练（端到端） | 本次已补做「备份还原往返」演练（见 §六），但**未演练整机故障后的端到端恢复**，亦未实测 RTO / RPO |

---

## 五、结论

**P0 级阻塞项的核心机制确实存在且大部分是强制的**：密钥注入、环境变量安全校验均为硬阻塞，
`validate-env.js` 对 CORS_ORIGIN / SKIP_CAPTCHA / ENABLE_SWAGGER / JWT_SECRET 的校验经实测有效。
后端 106 套件 / 1034 用例全绿，覆盖率达标，lint 无 error。

**P1 级的大部分机制同样属实**：验证码 Redis 降级、告警演练脚本、`logAction` 脱敏、
首登强制改密（中间件级强制）、Nginx HTTPS 配置，均经实测确认。

**但存在三项「声明与实现不符」**，建议在放行前处理：

| 编号 | 问题 | 严重度 |
|------|------|--------|
| §三-1 | P0-3 权限码初始化失败**不中止部署** | **高**（P0 级项却无强制） |
| §三-2 | P0-5 迁移结果校验失败**不中止部署** | **高**（同上） |
| §三-4 | P1-10 **CPU 限制实际未配置**，nginx 内存与文档不符 | **中**（虚假安全感） |
| §三-3 | P0-5 迁移版本号滞后 22 个版本 | 低（仅文档） |

> **放行判定**：阻塞项的**机制基本都在**，主要风险集中在「失败时是否阻断」与
> 「配置声明是否属实」两类。建议修正 §三-1 / §三-2 的失败语义后再放行，
> 或将这些步骤明确列入**必须人工确认日志**的检查清单。
>
> 本记录已完成 P0/P1 全量核验，但**不覆盖** §四 所列的渗透测试、压力测试与灾备演练，
> 故**不构成完整放行依据**。

---

---

## 六、灾备能力核验（§四 所列未覆盖项之一，本次补做）

备份/恢复是数据安全红线，本次在**测试库**上做了一次真实的「备份 → 还原 → 校验」往返演练。

### 6.1 演练结果

| 步骤 | 结果 |
|------|------|
| 备份（`mysqldump --single-transaction --routines --triggers` + gzip） | ✅ 产物 33,921 字节 |
| 还原（gunzip \\| mysql） | ✅ 无错误输出 |
| 还原前 | 表数 105 / 用户 3 / 客户 1 |
| 还原后 | 表数 105 / 用户 3 / 客户 1 |
| **结论** | ✅ **备份产物可还原，结构与数据一致** |

**值得强调**：该库含 **1 个带 `DEFINER=crm_user@localhost` 的视图**。带 DEFINER 的视图在还原时
是常见失败点（需 SUPER / SET_USER_ID 权限）。本次实测**还原成功**，说明该风险点在此配置下不存在。

### 6.2 备份脚本核验

| 项 | `database/backup.sh` | `deploy/nas-backup.sh` |
|----|---------------------|------------------------|
| `--single-transaction` | ✅ | ✅ |
| `--routines` | ✅ | ✅ |
| `--triggers` | ✅ | ✅ |
| `--events` | ✅ | ✅ |
| 账号 | root | root（容器内） |
| 附加 | — | `--quick`、`--default-character-set=utf8mb4` |

> 该库中实际存在 **2 个 EVENT** 与 **1 个视图**，故 `--events` 并非可有可无——
> 两份脚本均已包含，覆盖完整。

**保留策略**（`nas-backup.sh`）：每日备份保留 7 天，每周日额外产生周备份并保留 28 天。

### 6.3 发现的改进点

| 编号 | 问题 | 说明 |
|------|------|------|
| B-01 | ~~**备份校验仅检查「文件非空」**~~ **✅ 已修复** | 原 `nas-backup.sh` 用 `[ ! -s "$BACKUP_FILE" ]` 判断失败，截断或损坏的 gzip 仍可通过。已追加 `gzip -t "$BACKUP_FILE"` 完整性校验，失败则 `exit 1` 并输出明确错误。已通过 `bash -n` 语法校验 |
| B-02 | 灾备演练未完整执行 | 本次只做了「备份还原往返」。**未演练**「整机故障 → 从备份恢复服务」的端到端流程（含恢复时长 RTO、可接受数据丢失 RPO 的实测） |

### 6.4 本次演练的环境局限（如实记录）

1. 演练使用的是测试库 `huakey_crm_test`，**非生产数据量**（数据规模差异可能暴露其它问题）；
2. `crm_user` 无 `CREATE DATABASE` 权限（授权仅覆盖 `huakey_crm` / `huakey_crm_test`），
   因此**无法做异库还原演练**，只能做同库往返；生产脚本使用 root，不受此限；
3. 本次 dump 参数**未含 `--events`**，故演练未覆盖 EVENT 对象的还原（脚本本身已含该参数，
   但未实测其还原效果）。

> 上述局限意味着：**本节的 ✅ 结论是「该备份产物在此环境下可还原」，不等于「生产灾备已就绪」**。

---

*记录由 David 出具 · 2026-09-10 · 基于当前分支源码实测*

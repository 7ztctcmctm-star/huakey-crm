# P0 四项闭环执行手册

> 2026-10-15 编写。目标：把上线审计报告（`docs/launch-readiness-audit-2026-10-14.md`）的 4 个 P0 全部闭环。
> 所有结论均基于本机实测 / GitHub API 实测，未验证项显式标注。

## 0. 当前事实基线（2026-10-15 实测）

### 0.1 CI 已大幅转绿（今天推送 5133494 后）

GitHub API 实测 commit `5133494` 的 check-runs（12 个）：

| 检查项 | 结论 | 说明 |
|---|---|---|
| backend-test | ✅ success | npm audit 修复后转绿（原 3 high + 1 critical） |
| scan-images (Dockerfile.synology) | ✅ success | Trivy 转绿 |
| scan-images (backend/Dockerfile) | ✅ success | Trivy 转绿 |
| Trivy Security Scan（工作流） | ✅ success | 独立工作流也绿 |
| migration-test | ✅ success | 回滚链修复后绿 |
| e2e-test / integration-test | ✅ success | |
| frontend-test / frontend-build | ✅ success | |
| security-scan / image-scan / scan-filesystem | ✅ success | |
| cross-browser-test | ⏭️ skipped | **设计如此**：该作业 `if: event_name == 'schedule' || 'workflow_dispatch'`，push 不触发 |

⇒ **P0-1 的 CI 部分：2/3 已自动闭环，剩余 1/3（iPhone 实跑）只需一次手动触发。**

### 0.2 四个 P0 的真实状态

| P0 | 代码侧 | 数据/部署侧 | 还差什么 |
|---|---|---|---|
| P0-3 安全修复未提交未部署 | ✅ 已入库推送（4 个提交，remote=local） | ❌ 生产 NAS 未部署 | **NAS 部署**（步骤见 §3） |
| P0-1 CI 红 + 镜像 critical | ✅ 代码修复 + CI 实测转绿 | — | **手动触发 iPhone 作业验证**（步骤见 §2） |
| P0-2 公海池不可用 | ✅ 判据已统一 owner_id + 回归测试 | ❌ 生产库数据错位未回填 | **NAS 数据核对 → 拍板 → 回填迁移 → 部署**（步骤见 §4） |
| P0-4 回滚链毁库 | ✅ 已全修 + 破坏性实测通过 + CI 绿 | — | **无，已闭环** |

### 0.3 本轮（10-15）新查出的代码缺口（已修）

审计报告写「公海判据三处已统一」，实际存在**第四处**：

- `customerService.claimCustomer`（L508）——守卫仍用 `pool_status !== 'sea'`、UPDATE 条件仍带 `AND pool_status = 'sea'`。该函数**无生产调用方**（路由走 `poolService.claimCustomer` 与 `claimPoolCustomer`，两者均已修对），属导出而未 wiring 的死代码，但留着就是雷。
- 已修复并补回归用例（owner_id=NULL + pool_status='private' 的错位形态必须放行），单测 16/16 绿。
- 顺带修了该函数「返回 company_name 但 SELECT 不查它」的潜在坑。

---

## 1. P0-4 回滚链毁库 —— ✅ 已闭环（无需动作）

留档证据：
- `run_migrations.js` down 查找改按 version 前缀；缺 down 从静默跳过改显式失败（`--force` 才跳过）
- 修复 097/070/002 三个数据依赖型 down 缺陷；补建唯一缺失的 `119_log_permission_codes_down.sql`
- roundtrip 套件移出共享 jest 池（它与其他连库套件并发会互相篡改）；afterAll 补完整重建序列（重放 → init_role_permissions → 清 manager → 重放 120/121）
- 120/121 与守卫测试全部改按 roleCode 定位
- **破坏性实测**：带凭据跑 roundtrip（原毁库触发器）→ 深回滚 121→002 全程走通、库存活、守卫 10/10；CI migration-test 绿

---

## 2. P0-1 CI —— 剩余一步：手动触发 iPhone 跨浏览器作业

**为什么需要手动**：该作业只在 `schedule` / `workflow_dispatch` 时运行，push 自动跳过。代码已修（matrix 拆 browser/project 两维：iPhone 12 Pro → 装 webkit + 跑 device project），但**修复后从未真正跑过一次**。

**操作步骤**（你在浏览器点，不需要给我任何权限）：
1. 打开 https://github.com/7ztctcmctm-star/huakey-crm/actions/workflows/ci.yml
2. 右上角 **Run workflow** → 分支选 `main` → 点绿色 **Run workflow** 按钮
3. 跑完后告诉我，我用 API 拉结果验证（匿名可读，无需授权）

**通过标准**：
- `cross-browser-test (chromium)` / `(firefox)` / `(webkit)` / `(iPhone 12 Pro)` 四个矩阵全 success
- 若某个红，把作业页链接发我，我读 steps 定位（匿名 API 可读 steps 数组）

**备用**：不手动触发也行——下次定时跑（约 10-19）会自动验证，但建议上线前手动确认一次。

---

## 3. P0-3 安全修复入库 ✅ / 部署 ❌ —— NAS 部署步骤

代码侧已闭环（833519d 等 4 个提交，CI 全绿证明质量门禁通过）。剩余：**让生产 NAS 真正跑上这些代码**。

### 3.1 部署前检查（你在 NAS 上执行）

```bash
# 1. 进入仓库目录（按实际部署路径调整）
cd /volume1/docker/huakey-crm   # ← 路径以你的 NAS 实际为准

# 2. 确认拉取后 HEAD 应为 5133494（本地当前 main 顶端）
git fetch origin
git log --oneline -1 origin/main

# 3. 确认本地工作区干净（有改动先 stash/提交，避免 pull 冲突）
git status --short
```

**核对点**：`origin/main` 顶端 = `5133494`；`git status` 无输出。

### 3.2 执行部署

```bash
bash deploy/deploy.sh
```

该脚本 12 步编排（含 [11/12] 步跑 `init_role_permissions.js` 重建权限字典——这是权限唯一年事实源，深回滚/全新库场景必须靠它）。

### 3.3 部署后验证（安全修复生效的证据）

```bash
# a) 容器跑的代码版本（应含 10-09 两轮安全修复 + 10-14/15 全部修复）
docker compose ps
docker compose exec backend node -e "console.log(require('./package.json').version)"

# b) 抽验一个安全修复点：验证码 key 应为密码学随机（不再可预测）
docker compose logs backend | grep -i "captcha" | tail -5

# c) 冒烟：登录 → 客户列表 → 公海页 → 认领一条（P0-2 代码侧同时生效）
```

**通过标准**：容器正常起、登录/列表/公海页可用。

---

## 4. P0-2 公海池 —— 代码 ✅ / 数据核对 → 拍板 → 回填 → 部署

### 4.1 已完成的代码侧（随 §3 部署一起生效）

- 公海列表 / 正式客户列表 / 认领（三处实现：poolService、claimPoolCustomer、claimCustomer）判据全部统一为 `owner_id`
- 回归测试：`tests/db/poolCriteria.test.js` 4/4 绿（覆盖错位数据形态）；单测 +1 用例
- 潜客转化（convertLead）已按 owner 派生 pool_status，**不会再产生新的错位数据**
- 测试库实测：428 条无主客户 pool_status 全为 `'private'`（无一条 `'sea'`）——旧判据下公海页恒空，新判据下全部可见

### 4.2 NAS 生产库核对（只读，先做）

在 NAS 上对生产库执行（**只 SELECT，不改数据**）：

```sql
SELECT owner_id IS NULL AS owner_null, pool_status, COUNT(*) AS n
FROM crm_customer
WHERE deleted_at IS NULL
GROUP BY 1, 2;
```

**判断标准**：
- 若存在 `owner_null=1 且 pool_status='private'` 的行 → 与测试库同型错位，这些客户目前**在旧代码下不可见、新代码下可见**；`pool_status` 字段值与事实不符
- 若存在 `owner_null=0 且 pool_status='sea'` 的行 → 有主客户被错标成公海，会影响回收提醒查询（`cronService` / `getNearRecycleCustomersList` 按 `pool_status='private' AND owner_id IS NOT NULL` 过滤）

把查询结果发我，我按实际分布定回填迁移的精确形态。

### 4.3 拍板#1：是否建回填迁移

**选项 A（建议）**：建回填迁移，让 `pool_status` 与 owner 事实对齐。形如（最终形态以 4.2 结果为准）：

```sql
-- 无主且非线索 → 公海
UPDATE crm_customer SET pool_status = 'sea'
WHERE owner_id IS NULL AND business_status <> 'lead' AND deleted_at IS NULL;
-- 有主 → 私有
UPDATE crm_customer SET pool_status = 'private'
WHERE owner_id IS NOT NULL AND deleted_at IS NULL;
-- 配套 down（可逆）：记不清原值的只能按同样规则反向，故 down 记录迁移前分布由部署脚本负责备份
```

- 注意：lead 客户即使无主也保持 `'private'`（constants/poolStatus.js 既定语义），**不能**被刷成 'sea'
- 软删行不动（历史保留）
- 迁移创建后会**随下次部署自动执行**，所以必须 4.2 核对 + 你确认后才建

**选项 B**：不建回填，仅靠代码判据。公海页/认领功能正常，但 `pool_status` 字段长期与事实不符，回收提醒类查询在有主客户被错标时会漏算——**不推荐**，除非 4.2 结果显示生产库无第二类错位。

### 4.4 回填后验证

```sql
-- 应无输出（全库一致）
SELECT owner_id IS NULL AS owner_null, pool_status, COUNT(*) AS n
FROM crm_customer WHERE deleted_at IS NULL
GROUP BY 1,2 HAVING (owner_null=1 AND pool_status<>'sea' AND business_status<>'lead')
   OR (owner_null=0 AND pool_status<>'private');
```

页面上：公海页数量 ≈ 无主非线索客户数；认领一条成功。

---

## 5. 建议执行顺序

| 顺序 | 动作 | 执行人 | 闭环 |
|---|---|---|---|
| 1 | 触发 Run workflow（§2） | 你（点按钮） | P0-1 |
| 2 | NAS 生产库只读核对（§4.2），把结果发我 | 你 | P0-2 数据侧 |
| 3 | 拍板#1（§4.3 选项 A/B） | 你 | P0-2 数据侧 |
| 4 | NAS 部署（§3），拉 5133494 + deploy.sh | 你 | **P0-3** + P0-2 代码侧生效 |
| 5 | （若选 A）我建回填迁移 → 你再次部署 → §4.4 验证 | 我 + 你 | P0-2 完全闭环 |
| 6 | 部署后冒烟 + 我拉 CI 结果确认 iPhone 作业 | 我 + 你 | P0-1 完全闭环 |

第 1、2 步今天就能做；第 4 步建议约个部署窗口（生产最后一次部署是 08-31，积压较多，部署后冒烟要做细）。

---

## 6. 遗留未验证项（诚实清单）

- NAS 生产实时状态、生产库错位分布：本机不可达，必须人工核对（§4.2）
- iPhone 作业修复后实跑：待手动触发（§2）
- 灾备 E2E 恢复演练：未做
- 7 项拍板中其余 6 项（hr.js 17 端点、迁移 120 范围、boss 绕过功能权限等）：见审计报告 §拍板清单，与 4 个 P0 无依赖，可并行推进

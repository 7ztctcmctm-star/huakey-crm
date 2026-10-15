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
| P0-1 CI 红 + 镜像 critical | ✅ 代码修复 + CI 实测转绿 + iPhone 实跑验证 | — | **无，已闭环** |
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

## 2. P0-1 CI —— ✅ 已闭环（2026-10-15 14:30 实测验证）

**验证记录**：workflow_dispatch 运行 `38692173966`（sha 9091f10，含当日全部修复），12 个作业 **11 success + e2e-test skipped**（e2e 按设计只在 push 触发，push 运行 38690906022 已 success）。

四个跨浏览器矩阵项**全部真实跑通**（修复前 iPhone 项 1 秒即败、从未执行过测试）：

| 矩阵项 | 结论 | 实际执行 |
|---|---|---|
| cross-browser-test (chromium, chromium) | ✅ success | 装 chromium，测试 4m15s |
| cross-browser-test (firefox, firefox) | ✅ success | 装 firefox，测试 3m01s |
| cross-browser-test (webkit, webkit) | ✅ success | 装 webkit，测试 4m41s |
| **cross-browser-test (webkit, iPhone 12 Pro)** | ✅ **success** | **装 webkit + device project 实跑 4m23s**，17 步全 success |

关键步骤实证：`npx playwright install --with-deps webkit` success → `Run Playwright tests` success（旧写法把 `iPhone 12 Pro` 当浏览器名传给 install，1 秒即败）。

**修复原理留档**：matrix 拆成 `browser`（playwright install 目标，只接受浏览器名）/ `project`（`playwright test --project` 目标）两维；iPhone 12 Pro 设备底层走 webkit，故安装 webkit、以 device 项目运行。

---

## 3. P0-3 安全修复入库 ✅ / 部署 ❌ —— NAS 部署步骤

代码侧已闭环（833519d 等 4 个提交，CI 全绿证明质量门禁通过）。剩余：**让生产 NAS 真正跑上这些代码**。

### 3.1 部署前检查（你在 NAS 上执行）

```bash
# 1. 进入仓库目录（按实际部署路径调整）
cd /volume1/docker/huakey-crm   # ← 路径以你的 NAS 实际为准

# 2. 确认拉取后 HEAD 应为 9091f10（本地当前 main 顶端）
git fetch origin
git log --oneline -1 origin/main

# 3. 确认本地工作区干净（有改动先 stash/提交，避免 pull 冲突）
git status --short
```

**核对点**：`origin/main` 顶端 = `9091f10`；`git status` 无输出。

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

### 4.2 NAS 生产库核对 —— ✅ 已完成（2026-10-15 15:10 实测）

通过 SSH（nas-crm = 192.168.0.200）对生产库执行只读查询（容器内 mysql，`deleted_at IS NULL`）：

| owner_id | pool_status | 条数 | business_status | 判定 |
|---|---|---|---|---|
| NULL | 'private' | **423** | 全部 `lead` | ✅ **正确**——潜客本就不属公海（poolStatus.js 既定语义） |
| NULL | 'sea' | 2 | 全部 `following` | ✅ **正确**——真正在公海的客户 |
| 非 NULL | — | **0** | — | 生产库没有任何有主客户 |

**结论（重要反转）**：
- 生产库**不存在**测试库那种错位（无主+following 却标 'private'）——423 条无主客户全是 lead，2 条 following 恰好都是 'sea'，数据与既定语义完全一致
- 公海页在旧代码下显示 2 条、新代码下同样显示这 2 条（`owner_id IS NULL AND business_status != 'lead'`）——**生产上功能等价**，代码修复的价值在于测试环境行为与未来健壮性（防止再出现错位时公海页恒空）
- 回收提醒类查询（`pool_status='private' AND owner_id IS NOT NULL`）在生产返回 0 行，无风险
- **回填迁移 = 0 行变更的空操作 ⇒ 拍板#1 答案：不建**（建了只会给生产库增加一次无谓的自动 UPDATE）

### 4.3 拍板#1：是否建回填迁移 —— ✅ 已定：不建

依据 §4.2 实测：生产数据已与 owner 判据一致，回填是空操作。风险（自动执行的 UPDATE、down 脚本还原难题）大于收益（0）。

若未来数据再出现错位（例如分配流程缺陷产出「有主但 sea」），届时按同样 SQL 形态建迁移不迟。

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
| 1 ✅ | 触发 Run workflow + 我拉结果验证（§2） | 你 + 我 | **P0-1 已闭环** |
| 2 | NAS 生产库只读核对（§4.2），把结果发我 | 你 | P0-2 数据侧 |
| 3 | 拍板#1（§4.3 选项 A/B） | 你 | P0-2 数据侧 |
| 4 | NAS 部署（§3），拉 9091f10 + deploy.sh + 冒烟 | 你 | **P0-3** + P0-2 代码侧生效 |
| 5 | （若选 A）我建回填迁移 → 你再次部署 → §4.4 验证 | 我 + 你 | P0-2 完全闭环 |
| 6 | ~~部署后冒烟 + 我拉 CI 结果确认 iPhone 作业~~ | — | 已提前完成（§2） |

第 1、2 步今天就能做；第 4 步建议约个部署窗口（生产最后一次部署是 08-31，积压较多，部署后冒烟要做细）。

---

## 6. 遗留未验证项（诚实清单）

- NAS 生产实时状态、生产库错位分布：本机不可达，必须人工核对（§4.2）
- iPhone 作业修复后实跑：待手动触发（§2）
- 灾备 E2E 恢复演练：未做
- 7 项拍板中其余 6 项（hr.js 17 端点、迁移 120 范围、boss 绕过功能权限等）：见审计报告 §拍板清单，与 4 个 P0 无依赖，可并行推进

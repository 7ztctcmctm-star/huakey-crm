# HuakeyCRM Core v1 UAT 标准测试数据

> **用途**: UAT 用户验收测试的演示数据集
> **场景**: 制造业销售（汽车零部件自动化生产线项目）
> **编制日期**: 2026-08-06
> **覆盖模块**: Customer / Opportunity / Quote / Contract

---

## 1. 我方公司（CRM 部署方）

| 项目 | 内容 |
|------|------|
| 公司全称 | 华科智能装备有限公司 |
| 行业 | 工业自动化装备制造 |
| 主营 | 汽车零部件自动化生产线、视觉检测系统、MES 数据采集 |
| CRM 部署 | Synology NAS / Docker Compose |

---

## 2. UAT 测试账号

> 三个账号分属 boss / manager / sales 角色，用于验证权限边界。建议在 UAT 库通过 `init_role_permissions.js` 初始化权限后创建。

| 账号 | 姓名 | 角色 code | 数据范围 | 部门 | 用途 |
|------|------|-----------|----------|------|------|
| `uat_boss` | 王总 | `boss` | all（全部） | 总经办 | 经营决策、查看全局 |
| `uat_manager` | 李经理 | `admin` | dept_and_sub | 销售一部 | 团队管理、合同审批 |
| `uat_sales` | 张销售 | `sales` | self | 销售一部 | 一线销售全流程 |

> 另设一个对照销售 `uat_sales2`（赵销售，同部门）用于验证 sales 间数据隔离。

---

## 3. 客户数据（Customer）

### 3.1 主客户

| 字段 | 值 |
|------|------|
| company_name | A汽车灯具有限公司 |
| contact_name | 陈志明 |
| phone | 0757-88888001 |
| email | chenzm@a-lamp.com |
| address | 广东省佛山市南海区汽车产业园 A 栋 |
| industry | 汽车零部件制造 |
| source | 展会 |
| level | A（重要客户） |
| status | following（跟进中） |
| customer_type | customer |
| lifecycle_status | active |
| score | 85 |
| owner_id | uat_sales（张销售） |
| remark | 客户有自动化生产线升级需求，预算约 500 万，决策周期 2 个月 |

### 3.2 对照客户（验证数据隔离）

| 字段 | 值 |
|------|------|
| company_name | B汽车饰件有限公司 |
| contact_name | 周工 |
| phone | 0571-66668002 |
| industry | 汽车零部件制造 |
| status | following |
| owner_id | **uat_sales2**（赵销售） |
| remark | 对照客户，验证 sales 只能看自己的数据 |

---

## 4. 联系人数据（Contact）

主客户 A汽车灯具有限公司 下设 2 个联系人（验证一人多联系人）：

| 姓名 | 职位 | 手机 | 邮箱 | 角色 |
|------|------|------|------|------|
| 陈志明 | 采购经理 | 13800000001 | chenzm@a-lamp.com | 商务对接、合同签署 |
| 刘工 | 技术负责人 | 13800000002 | liugong@a-lamp.com | 技术方案评审、需求确认 |

> 联系人通过 `crm_contact.customer_id` 关联主客户。验证联系人列表在客户详情页正确展示。

---

## 5. 商机数据（Opportunity）

### 5.1 主商机（自动化生产线项目）

| 字段 | 值 |
|------|------|
| name | A汽车灯具自动化生产线升级项目 |
| customer_id | → A汽车灯具有限公司 |
| expected_amount | 5,800,000.00（580 万） |
| expected_date | 2026-11-30 |
| stage | 2（需求确认） |
| win_rate | 25 |
| owner_id | uat_sales（张销售） |
| remark | 含输送线改造、视觉检测系统、MES 数据采集三部分，预计 2026 Q4 交付 |

### 5.2 阶段推进链（验证 stage_log）

商机从 stage 2 推进至 stage 5（成交），每步写入 change_reason：

| 步骤 | from → to | 阶段名 | change_reason | win_rate |
|------|-----------|--------|---------------|----------|
| 1 | 2 → 3 | 需求确认 → 方案报价 | 需求已确认，提交技术方案与报价 | 40 |
| 2 | 3 → 4 | 方案报价 → 商务谈判 | 客户认可方案，进入价格谈判 | 60 |
| 3 | 4 → 5 | 商务谈判 → 成交 | 商务条款达成一致，签订合同 | 100 |

> 阶段映射（STAGE_MAP）：1=询盘, 2=需求确认, 3=方案报价, 4=商务谈判, 5=成交(WON), 6=输单(LOST)

### 5.3 对照商机（验证越权）

| 字段 | 值 |
|------|------|
| name | B汽车饰件产线改造项目 |
| customer_id | → B汽车饰件有限公司 |
| expected_amount | 3,200,000.00 |
| stage | 3（方案报价） |
| owner_id | **uat_sales2**（赵销售） |

> 验证：uat_sales 查看该商机应返回 404（dataScope=self）；推进应返回 403。

---

## 6. 报价数据（Quote）

### 6.1 设备报价单

| 字段 | 值 |
|------|------|
| quote_no | QUO-260806-001（系统自动生成） |
| customer_id | → A汽车灯具有限公司 |
| opportunity_id | → A汽车灯具自动化生产线升级项目 |
| amount | 5,800,000.00（合计） |
| discount | 0.05（折扣率 5%，即 95 折；语义为 0-1 比例，final = amount × (1 - discount)） |
| final_amount | 5,510,000.00（折后价 = 5,800,000 × 0.95） |
| valid_days | 30 |
| status | 3（已确认） |
| approval_status | 2（已通过） |

### 6.2 报价明细（quote_item）

| 产品 | 编号 | 数量 | 单价(¥) | 小计(¥) |
|------|------|------|---------|---------|
| 自动化输送生产线 | P001 | 1 | 3,200,000 | 3,200,000 |
| 视觉检测系统 | P002 | 2 | 800,000 | 1,600,000 |
| MES 数据采集模块 | P003 | 1 | 1,000,000 | 1,000,000 |
| **合计** | | | | **5,800,000** |

> 验证：报价创建时校验 opportunity_id 与 customer_id 一致性（不一致返回 400 "不匹配"）。

### 6.3 对照报价（验证一致性校验）

构造一条 customer_id=999 / opportunity_id=200（商机属于客户 100）的报价请求，预期被拒绝（400）。

---

## 7. 合同数据（Contract）

### 7.1 销售合同

| 字段 | 值 |
|------|------|
| contract_no | HT-2026110001 |
| customer_id | → A汽车灯具有限公司 |
| opportunity_id | → A汽车灯具自动化生产线升级项目 |
| quote_id | → QUO-260806-001 |
| amount | 5,510,000.00（按报价折后价） |
| status | 1（执行中） |
| approval_status | 2（已通过） |
| 签订日期 | 2026-08-20 |

### 7.2 付款条款（contract_payment）

| 期次 | 节点 | 比例 | 金额(¥) | 状态 |
|------|------|------|---------|------|
| 1 | 预付款（合同签订） | 30% | 1,653,000 | 已回款 |
| 2 | 设备验收 | 60% | 3,306,000 | 待回款 |
| 3 | 质保金（质保期满） | 10% | 551,000 | 待回款 |

> 验证：合同审批流（提交→审批中→通过）；通过后可录入回款。

### 7.3 审批流验证

| 步骤 | 操作人 | 操作 | 预期 approval_status |
|------|--------|------|---------------------|
| 1 | uat_sales | 提交审批 | 0 → 1（审批中） |
| 2 | uat_sales | 尝试审批 | ❌ 403（sales 无审批权） |
| 3 | uat_manager | 审批通过 | 1 → 2（已通过） |
| 4 | uat_boss | 查看合同 | ✅ 可见（dataScope=all） |

---

## 8. 数据关系图

```
A汽车灯具有限公司 (Customer)
  │  customer_id = C001
  │
  ├── 陈志明 (Contact - 采购经理)
  ├── 刘工   (Contact - 技术负责人)
  │
  ├── A汽车灯具自动化生产线升级项目 (Opportunity)
  │     │  opportunity_id = O001
  │     │  expected_amount = 580万
  │     │  stage: 2→3→4→5
  │     │
  │     ├── 设备报价单 (Quote)
  │     │     │  quote_id = Q001
  │     │     │  amount = 580万, final = 550万
  │     │     │  └─ quote_item × 3
  │     │     │
  │     │     └── 销售合同 (Contract)
  │     │           quote_id = Q001
  │     │           opportunity_id = O001
  │     │           amount = 551万
  │     │           └─ contract_payment × 3
```

---

## 9. 数据加载说明

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1 | `node backend/scripts/init_role_permissions.js` | 初始化权限码（幂等） |
| 2 | 创建 4 个 UAT 账号 | uat_boss / uat_manager / uat_sales / uat_sales2 |
| 3 | 手动录入或编写 seed | 按本文档数据录入 |
| 4 | 验证数据关联 | 检查 FK：customer_id / opportunity_id / quote_id 链路完整 |

> 建议在 UAT 库执行，**禁止**在生产库直接录入测试数据。

---

## 10. 金额范围说明

按 UAT 要求，商机金额控制在 **300万–800万** 区间：

| 数据 | 金额(万) | 是否在区间 |
|------|----------|-----------|
| 主商机 expected_amount | 580 | ✅ |
| 报价 amount | 580 | ✅ |
| 合同 amount | 551 | ✅ |
| 对照商机 expected_amount | 320 | ✅ |

> **discount 语义说明**：`crm_quote.discount` 为折扣比例（0-1），非金额。`final_amount = amount × (1 - discount)`。例如 discount=0.05 表示 5% off（95 折）。前端显示 `(1 - discount)×100`% 即折扣率（中文"打折"惯例）。数据库 / 后端 / 前端三者一致。

---

*本数据集专为 UAT 设计，覆盖 Customer / Opportunity / Quote / Contract 全链路，支持三角色权限边界验证。*

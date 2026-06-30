# 分支保护规则配置指南

## 操作路径

GitHub 仓库 → Settings → Branches → Add branch ruleset（或 Add rule）

## main 分支保护规则

### 规则名称：protect-main

### 匹配模式

- Branch name pattern: `main`

### 规则设置

勾选以下选项：

#### 1. Require a pull request before merging

- ✅ Require approvals: 1（至少 1 人 review）
- ✅ Dismiss stale pull request approvals when new commits are pushed（新提交后旧 approval 失效）

#### 2. Require status checks to pass

- ✅ Require branches to be up to date before merging
- Required status checks 添加以下 jobs：

| Job 名称 | 对应 ci.yml |
|---|---|
| backend-test | jobs.backend-test |
| frontend-test | jobs.frontend-test |
| frontend-build | jobs.frontend-build |
| frontend-unit-test | jobs['frontend-unit-test'] |
| security-scan | jobs.security-scan |
| integration-test | jobs.integration-test |

#### 3. Require conversation resolution before merging

- ✅ 所有 review comment 必须 resolved 才能合并

#### 4. Require linear history

- ✅ 禁止 merge commit，只允许 squash 或 rebase

#### 5. Do not allow bypassing the above settings

- ✅ 包括 admin 也不能绕过（可选，如果需要紧急修复可以取消勾选）

#### 6. Restrict who can push to matching branches

- 不限制（通过 PR 合并即可）

## gh CLI 快捷配置（可选）

如果仓库使用 GitHub Rulesets API（新版），可以用 gh CLI：

```bash
# 先确认 gh 已登录
gh auth status

# 查看现有规则
gh api repos/{owner}/{repo}/rulesets

# 注意：GitHub Rulesets API 较复杂，建议通过网页操作
# 参考：https://docs.github.com/en/rest/repos/rules
```

## 注意事项

1. Required status checks 的 job 名称必须与 ci.yml 中 jobs 的 `name` 完全一致
2. 如果 ci.yml 中 job 没有设置 `name`，则使用 job key（如 `backend-test`）
3. 首次配置后，建议创建一个测试 PR 验证规则生效
4. 紧急修复时，repo admin 可以临时取消 "Do not allow bypassing" 来绕过

## 验证方法

1. 创建一个新分支，修改任意文件
2. 直接 push 到 main → 应被拒绝
3. 创建 PR → 应显示 required checks 和 required reviews
4. CI 未通过时尝试合并 → 应被阻止

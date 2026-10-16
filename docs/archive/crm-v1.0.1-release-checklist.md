# 铧旗CRM v1.0.1 发版前最终检查清单

> 生成时间：2026-08-31
> 发版基线：分支 `fix/v1.0.1-security-patch` @ `3060b2f`（已推送 origin）
> 前置结论：八维度终审审计（[crm-v1-final-audit-report.md](./crm-v1-final-audit-report.md)）技术项全部闭环
> 使用方法：按顺序逐项勾选，任一 ❌ 未通过则暂停发版、先修复再重来

---

## 〇、发版资格判定（硬性前置）

| # | 条件 | 状态 |
|---|---|---|
| 0-1 | 审计 P0 项全部闭环（代码入库、备份体系修复） | ✅ 已完成 |
| 0-2 | 回归全绿（后端 1028/1028、前端 44/44、lint 0 error） | ✅ 已完成 |
| 0-3 | 本地与远端仓库一致（HEAD = origin = `3060b2f`） | ✅ 已确认 |
| 0-4 | **今晚 02:00 备份调度器首次自动执行成功** | ⏳ **发版当日早晨必须确认（见 2-C）** |

> ⚠️ 关键依赖：生产当前运行的就是本分支代码（发版性质 = 打标签正式化，非代码变更上线）。**唯一未验证项是备份调度器的无人值守自动执行**——历史上 backup 容器崩溃 6 周无人发现，此项不确认不得发版。

---

## 一、发版当日·静态检查（预计 10 分钟）

### A. 代码与仓库

- [ ] `git log --oneline -1` = `3060b2f`，`git status` 干净
- [ ] `git log origin/fix/v1.0.1-security-patch --oneline -1` 与本地一致
- [ ] 确认发版包含的 7 个提交完整：
  - [ ] `36c525b` fix(security) SQL 注入修复 + 回归用例 + HS256
  - [ ] `50d30f3` fix(rbac) 权限码/角色码对齐（17 文件）
  - [ ] `3b66f70` fix(backup) 备份调度重构
  - [ ] `3caeab4` fix(deploy) nginx/Dockerfile/CORS/sync-prod.bat
  - [ ] `a6950b0` / `704bf74` / `2d485a4` / `3060b2f` docs 审计闭环

### B. 版本号一致性

- [ ] `backend/package.json` version = `1.5.1`
- [ ] `frontend/package.json` version = `1.5.1`
- [ ] 生产 health API 返回 version = `1.5.1`（见 2-E）

---

## 二、发版当日·生产检查（预计 15 分钟）

### C. 备份体系验证（重中之重）

- [ ] **02:00 自动 MySQL 备份**：`ls /volume1/docker/crm-stack/database/backups/` 出现 `huakey_crm_$(当日日期)_02*.sql.gz` 且 >400KB
- [ ] **02:30 自动 uploads 备份**：`backups/uploads/uploads_$(当日日期).tar.gz` 存在
- [ ] **02:45 自动 config 备份**：`backups/config/config_$(当日日期).tar.gz` 存在（容器内验证内容含 .env.secrets + 4 证书）
- [ ] **04:00 宿主机兜底备份**：`huakey_crm_*_040001.sql.gz` 仍正常生成
- [ ] `container-backup.log` 无 FATAL、无异常堆栈
- [ ] `huakey-backup` 容器 Up（非 Restarting）
- [ ] （可选）恢复演练：按 [crm-v1-backup-verification-report.md](./crm-v1-backup-verification-report.md) 抽验一次

> 快捷命令（任一失败即停）：
> ```bash
> ssh nas-crm 'export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH && docker ps --filter name=huakey-backup && tail -20 /volume1/docker/crm-stack/database/backups/container-backup.log && ls -lt /volume1/docker/crm-stack/database/backups/ | head -5'
> ```

### D. 容器与基础设施

- [ ] 5 容器全部 healthy：`docker ps` 中 mysql/redis/app/nginx/backup 无 Restarting/Exited
- [ ] temp-deploy 保持停止（不复活）
- [ ] 磁盘空间充足：`df -h /volume1` 使用率 < 85%
- [ ] `.env.secrets` 权限 600：`ls -la /volume1/docker/crm-stack/.env.secrets`

### E. 安全与入口

- [ ] `curl -skI https://localhost:8443/` 含 `strict-transport-security: max-age=63072000`
- [ ] X-Frame-Options 唯一且为 DENY（`grep -ic x-frame` = 1）
- [ ] 端到端：`curl -sk --resolve crm.huakey.local:443:127.0.0.1 https://crm.huakey.local/api/v1/health` 返回 `{"code":200,...,"version":"1.5.1","db":true,"redis":true}`
- [ ] 客户端浏览器实测 `https://crm.huakey.local` 打开正常（hosts 已配置）

### F. 功能冒烟（登录一个账号走通）

- [ ] admin 登录成功（验证码 + 密码）
- [ ] 首页仪表盘加载无 404/500
- [ ] 客户列表可打开（424 条 lead 客户对 sales 经公海兜底可见）
- [ ] 任意一个带按钮权限的页面（如客户导出）无权限报错
- [ ] 被禁用账号朱福春登录被拒（"账号不存在或已被禁用"）
- [ ] 新建/编辑一个测试数据成功后删除（验证 CSRF 链路正常）

---

## 三、发版执行步骤

### 方式一：仅打标签（推荐——生产已运行该代码）

```bash
# 1. 打标签
git tag -a v1.0.1 -m "v1.0.1: 安全补丁 + RBAC 对齐 + 备份体系重构 + 审计闭环"
git push origin v1.0.1

# 2. 归档发版记录（在 docs/ 补充 release note 或复用
#    crm-v1.0.1-production-release-report.md 追加本次变更）
```

### 方式二：完整重新构建部署（仅当需要验证可重建性时）

```bash
# NAS 上执行（会重建镜像 + 容器，约 10-15 分钟，期间服务中断）
ssh nas-crm 'export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH && cd /volume1/docker/crm-stack && bash deploy/deploy.sh'
# deploy.sh 全流程：secrets 注入 → 环境校验 → 构建 → 启动 → 迁移 → admin 检查 → 权限初始化
# 部署后必须重跑 §二-C 全部备份验证项
```

> 方式二执行后额外确认：`docker logs huakey-app | grep 迁移` 出现迁移完成、无报错。

---

## 四、发版后 24 小时观察项

- [ ] 次日检查备份三件套再次自动生成（连续 2 天成功 = 调度器稳定）
- [ ] `docker logs huakey-app --since 24h` 无未捕获异常
- [ ] 业务侧正常使用无权限类工单（重点观察 sales 角色公海可见性）
- [ ] 一周后确认 `container-backup.log` 累计无 FATAL

---

## 五、回滚预案

| 场景 | 动作 |
|---|---|
| 新代码运行异常 | 代码已在生产运行多日，回滚即 `git checkout 20fc2a4` 重新部署（会丢失 SQL 注入修复，**仅限紧急情况**） |
| 数据库异常 | 恢复当日备份：`gunzip < huakey_crm_$(日期).sql.gz \| docker exec -i huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" huakey_crm`（恢复前先 `docker compose down app` 停写入） |
| 配置丢失 | 解包 `config_$(日期).tar.gz` 恢复 .env.secrets/nginx 证书（含 600 权限恢复） |
| 备份调度器异常 | 临时用 `docker exec huakey-backup sh /container-backup.sh --once` 手动补备份，宿主机 04:00 兜底仍在 |
| nginx 异常 | `docker restart huakey-nginx`；配置回滚用 `docker-compose.synology.yml.bak.20260831` |

---

## 六、已知事项与遗留（随版发布说明）

1. **接受的风险**（用户决策 2026-08-31）：NAS 密码未轮换（内网场景）；audit-report-2026-08-18.md git 历史含旧密码明文
2. **账号现状**：朱福春已禁用；其余 12 个休眠账号保留待用；3 个 E2E 测试账号已禁用+软删除
3. **业务待启动**：424 条客户 owner_id=NULL 且 status=lead（公海兜底可见，无功能阻塞）；商机→报价→合同链路待业务录入
4. **v1.1 backlog**：12 个死权限码清理、DEPLOYMENT_BLOCKERS.md 归档、survey 全局限流（可选）、login 页版本号暴露（低危）
5. **DSM 层 nginx 反代配置**不在自动备份范围（可按 crm-v1-internal-domain-deployment.md 重建）

---

## 七、签核

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 发版负责人 | | | □ 通过 □ 不通过 |
| 运维确认（§二 C/D/E） | | | □ 通过 □ 不通过 |
| 业务确认（§二 F 冒烟） | | | □ 通过 □ 不通过 |

---

*本清单基于 2026-08-31 八维度终审审计与修复执行记录生成；引用报告：[crm-v1-final-audit-report.md](./crm-v1-final-audit-report.md)、[crm-v1.0.1-final-pre-launch-audit.md](./crm-v1.0.1-final-pre-launch-audit.md)。*

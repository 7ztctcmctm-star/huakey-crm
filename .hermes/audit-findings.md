# 华科 CRM 安全审计 — 终审清单

来源：①人工 ②Codex路由 ③Codex安全 ④Codex架构 ⑤Codex RBAC ⑥Codex终审  
最后更新：2026-06-24 终审

---

## 已修复 ✅ — 24/24 全部通过终审验证

### 安全加固 (9)
| # | 发现 | 终审 |
|---|------|:--:|
| 1 | Helmet 安全头启用 | ✅ |
| 2 | Cookie secure 动态化 | ✅ |
| 3 | SKIP_CAPTCHA NODE_ENV 守卫 | ✅ |
| 4 | Token 黑名单 fail-close | ✅ |
| 5 | bcrypt cost 统一 12 (auth+user) | ✅ |
| 6 | 登录日志脱敏 | ✅ |
| 7 | express.json limit 10mb | ✅ |
| 8 | 文件删除路径遍历防护 | ✅ |
| 9 | softDelete.js 表名白名单 | ✅ |

### SQL注入修复 (3)
| # | 发现 | 终审 |
|---|------|:--:|
| 10 | report.js columns_config 白名单 | ✅ |
| 11 | report.js filters 键名白名单 | ✅ |
| 12 | survey.js /respond Joi 校验 | ✅ |

### 权限体系 (6)
| # | 发现 | 终审 |
|---|------|:--:|
| 13 | hr.js 18端点 +checkPermission | ✅ |
| 14 | ai.js/config.js/analysis.js 补权限 | ✅ |
| 15 | 12路由补 checkPermission | ✅ |
| 16 | 27处硬编码角色→ROLES (7文件) | ✅ |
| 17 | email/knowledge/competitor/inventory 补 validate | ✅ |
| 18 | 注册去token + 登出加校验 | ✅ |

### 前端 (3)
| # | 发现 | 终审 |
|---|------|:--:|
| 19 | 路由守卫 roleId===1 清零 | ✅ |
| 20 | stores/user.js 已删除 | ✅ |
| 21 | 登录响应精简(不暴露全权限) | ✅ |

### 配置/部署 (3)
| # | 发现 | 终审 |
|---|------|:--:|
| 22 | Docker CHANGE_ME 移除 | ✅ |
| 23 | Docker MySQL 端口不暴露 | ✅ |
| 24 | Redis 支持密码 | ✅ |

---

## 残留 ⚠️ — 7 项（无严重/高危）

### 中等 (3)
| # | 发现 | 文件 |
|---|------|------|
| R1 | cronJobs.js 仅靠 CRON_SECRET，无 authenticateToken | cronJobs.js |
| R2 | middleware/auth.js [1].includes(roleId) 硬编码 | middleware/auth.js:55 |
| R3 | report.js /overview /today-tasks /quick-stats 缺 checkPermission | report.js |

### 低 (4)
| # | 发现 | 文件 |
|---|------|------|
| R4 | 前端 token 刷新待完善 | utils/request.js |
| R5 | JWT 7天有效期，权限变更延迟生效 | middleware/auth.js |
| R6 | AI SQL 仍用主库，未配只读账号 | ai.js |
| R7 | ESLint 已配置但未在 CI 强制执行 | .eslintrc.js |

---

## 架构改进（长期，非安全漏洞）
- 服务层缺失
- 路由文件臃肿
- requireAdmin/checkPermission 两套并存
- 权限码命名不一致
- 数据权限仅 19%
- 定时任务缺监控
- 迁移缺回滚
- app.js 臃肿

---

## 统计

| 等级 | 已修复 | 残留 | 
|:--:|:--:|:--:|
| 严重 | 7 | 0 |
| 高 | 10 | 0 |
| 中 | 14 | 3 |
| 低 | 4 | 4 |
| **合计** | **35** | **7** |

---

终审结论：代码层面安全漏洞清零，无严重/高危残留。

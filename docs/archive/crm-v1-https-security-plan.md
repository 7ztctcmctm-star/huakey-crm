# HuakeyCRM v1 HTTPS 部署安全方案

> **文档类型**: Security Deployment Plan
> **版本**: HuakeyCRM v1.0
> **编制日期**: 2026-08-06
> **状态**: 规划中（未修改生产环境）

---

## 1. 当前架构

```
用户浏览器
   ↓ HTTP（明文）
群晖 NAS : 6789
   ↓
Docker App 容器（huakey-app）
   ↓
MySQL + Redis（内部网络）
```

### 1.1 端口扫描结果

| 端口 | 服务 | 状态 | 风险 |
|------|------|------|------|
| 80 | DSM nginx | LISTEN | 已占用（可用反代） |
| 443 | DSM nginx | LISTEN | 已占用（可用反代） |
| 5000 | DSM HTTP | LISTEN | DSM 管理界面 |
| 6789 | CRM App | LISTEN | **HTTP 明文暴露** |

### 1.2 当前安全风险

| 风险 | 严重性 | 影响 |
|------|--------|------|
| HTTP 明文传输 | **高** | 登录密码、Token、业务数据可被中间人嗅探 |
| Cookie 非 Secure | **高** | Token Cookie 可被 HTTP 劫持 |
| 无 SSL 证书 | **中** | 浏览器安全警告 |
| CORS 配置 HTTP | **中** | 需配合 HTTPS 更新 |

### 1.3 当前 CORS/Helmet 配置

```
CORS_ORIGIN=http://192.168.0.200:6789
```

---

## 2. 方案评估

### 方案 A：群晖 DSM 反向代理（推荐 ✅）

```
用户浏览器
   ↓ HTTPS 443
群晖 DSM 反向代理（内置 nginx + SSL）
   ↓ HTTP 6789（内部）
Docker App 容器
```

**实现方式**：DSM 控制面板 → 登录门户 → 高级 → 反向代理

| 优点 | 缺点 |
|------|------|
| ✅ 无需额外容器 | ❌ 依赖 DSM 服务 |
| ✅ 80/443 已被 DSM nginx 占用，天然兼容 | ❌ DSM 重启时反代短暂中断 |
| ✅ DSM 自动管理 SSL 证书（Let's Encrypt） | |
| ✅ GUI 配置，运维简单 | |
| ✅ DSM 自动续期证书 | |
| ✅ 支持 WebSocket | |

**证书来源**:
- Let's Encrypt（需公网域名 + DDNS）
- 群晖默认证书（内网 IP 访问）
- 自签证书（内网）

**访问地址**: `https://192.168.0.200` 或 `https://crm.yourdomain.com`

### 方案 B：Docker nginx 容器

```
用户浏览器
   ↓ HTTPS 443
Docker nginx 容器（需改端口）
   ↓ HTTP 6789
Docker App 容器
```

| 优点 | 缺点 |
|------|------|
| ✅ 独立于 DSM | ❌ **80/443 已被 DSM 占用，端口冲突** |
| ✅ 可自定义 nginx 配置 | ❌ 需手动管理 SSL 证书 |
| ✅ 支持灰度发布 | ❌ 增加容器，运维复杂 |
| | ❌ DSM 更新可能冲突 |

### 方案 C：App 容器内置 HTTPS

| 优点 | 缺点 |
|------|------|
| | ❌ 增加应用复杂度 |
| | ❌ 违反职责分离原则 |
| | ❌ 证书管理困难 |

**不推荐**。

---

## 3. 推荐方案：方案 A（群晖 DSM 反向代理）

### 3.1 选择理由

1. **零端口冲突**：80/443 已被 DSM nginx 使用，方案 A 直接复用
2. **证书自动化**：DSM 支持 Let's Encrypt 自动申请和续期
3. **运维简单**：GUI 配置，无需维护额外容器
4. **生产可靠**：群晖反向代理为生产级 nginx，稳定可靠
5. **方案 B 不可行**：80/443 已被占用，Docker nginx 需改端口，失去 443 标准端口优势

### 3.2 证书选项

| 选项 | 适用场景 | 获取方式 |
|------|----------|----------|
| Let's Encrypt | 有公网域名 | DSM 自动申请 + 续期 |
| 群晖默认证书 | 内网 IP 访问 | DSM 自带 |
| 自签证书 | 内网测试 | openssl 生成 |

**推荐**: 内网环境使用群晖默认证书；如有公网域名使用 Let's Encrypt。

### 3.3 访问地址

| 场景 | 地址 |
|------|------|
| 内网 IP | `https://192.168.0.200` |
| 域名 | `https://crm.yourdomain.com` |
| 自定义端口 | `https://192.168.0.200:8443`（如 443 被占用） |

---

## 4. 部署步骤

### 4.1 步骤 1：配置 SSL 证书

```
DSM 控制面板 → 安全性 → 证书
  → 新增 → 添加新证书
  → 选择"从 Let's Encrypt 获取" 或 "导入证书"
  → 如 Let's Encrypt：填写域名、邮箱
  → 设为默认证书
```

### 4.2 步骤 2：配置反向代理

```
DSM 控制面板 → 登录门户 → 高级 → 反向代理
  → 新增
  → 来源协议: HTTPS
  → 来源主机名: 192.168.0.200（或域名）
  → 来源端口: 443（或 8443）
  → 目标协议: HTTP
  → 目标主机名: localhost
  → 目标端口: 6789
  → 启用 HSTS（可选）
  → 保存
```

### 4.3 步骤 3：修改 CRM 配置

| 配置项 | 当前值 | 目标值 | 文件 |
|--------|--------|--------|------|
| `CORS_ORIGIN` | `http://192.168.0.200:6789` | `https://192.168.0.200` | .env |
| `COOKIE_SECURE` | 未设置 | `true` | .env |

### 4.4 步骤 4：重启 App

```bash
cd /volume1/docker/crm-stack
docker compose -f docker-compose.synology.yml restart app
```

### 4.5 步骤 5：验证

| 验收项 | 标准 |
|--------|------|
| HTTPS 访问 | `https://192.168.0.200` 正常加载 |
| 证书有效 | 浏览器无安全警告 |
| API 正常 | 登录、CRUD 接口正常 |
| HTTP 自动跳转 | （可选）HTTP 跳转 HTTPS |
| Cookie Secure | Token Cookie 标记 Secure |

---

## 5. 回滚方案

### 5.1 回滚步骤

1. DSM 控制面板 → 登录门户 → 高级 → 反向代理 → 删除规则
2. 修改 .env：`CORS_ORIGIN=http://192.168.0.200:6789`
3. 移除 `COOKIE_SECURE=true`
4. 重启 App: `docker compose restart app`
5. 验证: `curl http://localhost:6789/api/v1/health`

### 5.2 回滚风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 用户已习惯 HTTPS | 需重新改用 HTTP | 通知用户 |
| Cookie Secure 已设 | HTTP 下 Cookie 不发送 | 必须移除 |
| 浏览器缓存 | 可能缓存 HTTPS | 清除缓存 |

---

## 6. 安全收益

| 安全项 | 部署前 | 部署后 |
|--------|--------|--------|
| 传输加密 | ❌ 明文 | ✅ TLS 1.2/1.3 |
| 密码保护 | ❌ 可嗅探 | ✅ 加密传输 |
| Token 保护 | ❌ 可劫持 | ✅ Secure Cookie |
| 中间人防护 | ❌ 无 | ✅ TLS 验证 |
| 浏览器信任 | ❌ 警告 | ✅ 证书有效 |

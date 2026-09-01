# HuakeyCRM v1.0 内网域名改造部署报告

> **文档状态**: COMPLETED
> **执行日期**: 2026-08-06
> **执行人**: Production Reliability Engineer
> **目标**: 将访问入口从 `https://192.168.0.200:8443` 升级为 `https://crm.huakey.local`

---

## 1. 改造概述

### 1.1 改造目标

将 CRM 系统的访问入口从 IP+端口方式升级为内网域名方式，提升可维护性和用户体验。

| 项目 | 改造前 | 改造后 |
|------|--------|--------|
| 访问地址 | `https://192.168.0.200:8443` | `https://crm.huakey.local` |
| DNS 解析 | 无（直接 IP 访问） | DSM DNS Server 内网解析 |
| HTTPS 入口 | Docker Nginx 8443 | DSM Nginx 443 → Docker Nginx 8443 |
| SSL 证书 | IP 自签名证书 | 域名匹配证书 (CN/SAN: crm.huakey.local) |
| CORS_ORIGIN | `https://192.168.0.200:8443` | `https://crm.huakey.local` |

### 1.2 架构变化

```
改造前:
  浏览器 → https://192.168.0.200:8443 (Docker Nginx) → huakey-app:5000

改造后:
  浏览器 → https://crm.huakey.local:443 (DSM Nginx)
         → https://127.0.0.1:8443 (Docker Nginx)
         → http://huakey-app:5000 (Express)
```

### 1.3 约束遵守

- [x] 未修改业务代码
- [x] 未修改数据库
- [x] 未修改冻结模块

---

## 2. 执行步骤

### 2.1 DSM DNS Server 配置

**状态**: COMPLETED

1. 安装 DSM DNS Server 包
2. 创建 `huakey.local` DNS 区域
3. 配置 A 记录：`crm.huakey.local → 192.168.0.200`

**区域文件位置**: `/var/packages/DNSServer/target/named/etc/zone/master/huakey.local.zone`

**验证结果**:
```
$ nslookup crm.huakey.local 192.168.0.200
Name:   crm.huakey.local
Address: 192.168.0.200
```

### 2.2 DSM Reverse Proxy (Nginx) 配置

**状态**: COMPLETED

**配置文件**: `/usr/local/etc/nginx/conf.d/http.crm-huakey-local.conf`

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name crm.huakey.local;

    ssl_certificate /volume1/docker/crm-stack/nginx/certs/crm.huakey.local.crt;
    ssl_certificate_key /volume1/docker/crm-stack/nginx/certs/crm.huakey.local.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass https://127.0.0.1:8443;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**关键点**: `proxy_set_header X-Forwarded-Proto $scheme` 确保 HTTPS 状态正确传递到后端，使 Express 的 `req.secure` 返回 `true`。

### 2.3 SSL 证书生成

**状态**: COMPLETED

使用 OpenSSL 生成自签名证书，CN 和 SAN 均匹配 `crm.huakey.local`：

**证书文件**:
- 证书: `/volume1/docker/crm-stack/nginx/certs/crm.huakey.local.crt`
- 私钥: `/volume1/docker/crm-stack/nginx/certs/crm.huakey.local.key`

**证书信息**:
```
subject = CN = crm.huakey.local
X509v3 Subject Alternative Name:
    DNS:crm.huakey.local
```

### 2.4 CRM 配置修改

**状态**: COMPLETED

修改 NAS 上的 CRM 环境变量文件：

| 文件 | 变量 | 改造前 | 改造后 |
|------|------|--------|--------|
| `/volume1/docker/crm-stack/.env` | CORS_ORIGIN | `https://192.168.0.200:8443` | `https://crm.huakey.local` |
| `/volume1/docker/crm-stack/.env.secrets` | CORS_ORIGIN | `http://192.168.0.200:6789` | `https://crm.huakey.local` |

**COOKIE_SECURE**: 无需额外配置。后端代码逻辑为 `secure: isProduction && req.secure`，通过 `trust proxy` + `X-Forwarded-Proto` 自动适配 HTTPS 环境。

### 2.5 容器重启

**状态**: COMPLETED

重启 `huakey-app` 容器使新配置生效：
```bash
docker restart huakey-app
```

容器状态验证：
```
huakey-app     Up (healthy)   5000/tcp
huakey-nginx   Up (healthy)   80/tcp, 0.0.0.0:8443->8443/tcp
huakey-redis   Up (healthy)   6379/tcp
huakey-mysql   Up (healthy)   3306/tcp
```

---

## 3. 验证结果

### 3.1 DNS 解析验证

| 检查项 | 结果 | 状态 |
|--------|------|------|
| NAS DNS 解析 crm.huakey.local | 192.168.0.200 | PASS |
| 本地 curl --resolve 访问 | 正常 | PASS |

### 3.2 HTTPS 反代验证

| 检查项 | 结果 | 状态 |
|--------|------|------|
| HTTPS 请求 https://crm.huakey.local/ | HTTP 200, 21ms | PASS |
| 本地 curl --resolve 验证 | HTTP 200, 35ms | PASS |
| SSL 证书 CN | crm.huakey.local | PASS |
| SSL 证书 SAN | DNS:crm.huakey.local | PASS |

### 3.3 API Health 验证

| 检查项 | 结果 | 状态 |
|--------|------|------|
| NAS 端 /api/v1/health | code:200, status:ok | PASS |
| 本地 /api/v1/health | code:200, status:ok | PASS |
| MySQL 连接 | MySQL 8.0.46, db:true | PASS |
| Redis 连接 | redis:true | PASS |

### 3.4 CORS 验证

| 检查项 | 结果 | 状态 |
|--------|------|------|
| OPTIONS 预检响应 | 204 No Content | PASS |
| Access-Control-Allow-Origin | https://crm.huakey.local | PASS |
| Access-Control-Allow-Credentials | true | PASS |
| Access-Control-Allow-Methods | GET,POST,PUT,DELETE,PATCH,OPTIONS | PASS |
| Access-Control-Allow-Headers | Content-Type,Authorization,X-CSRF-Token | PASS |

### 3.5 Cookie Secure 验证

通过在 `huakey-app` 容器内执行端到端验证脚本，模拟 HTTPS 代理请求：

| 检查项 | 结果 | 状态 |
|--------|------|------|
| NODE_ENV | production | PASS |
| trust proxy | 1 | PASS |
| X-Forwarded-Proto | https | PASS |
| req.protocol | https | PASS |
| req.secure | true | PASS |
| Cookie Secure 计算 | isProduction && req.secure = true | PASS |

**验证结论**: 在 HTTPS 代理环境下，Express 正确识别 `req.secure = true`，登录成功后 Set-Cookie 将正确包含 `Secure` 属性。

**Cookie 安全属性配置逻辑** (backend/routes/auth.js):
```javascript
res.cookie('token', token, {
  httpOnly: true,
  secure: isProduction && req.secure,  // HTTPS 下自动启用
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000
});
```

### 3.6 验证总结

| 验证项 | 状态 |
|--------|------|
| DNS 解析 | PASS |
| HTTPS 反代 | PASS |
| SSL 证书 (CN/SAN) | PASS |
| API Health | PASS |
| CORS 配置 | PASS |
| Cookie Secure | PASS |

---

## 4. 本地客户端配置

### 4.1 Windows hosts 配置

本地 Windows 机器需要配置 DNS 解析才能通过浏览器访问 `crm.huakey.local`。

**方法一: 自动配置脚本（推荐）**

运行 `deploy/install-hosts-crm-domain.bat`（需右键以管理员身份运行）。

**方法二: 手动配置**

编辑 `C:\Windows\System32\drivers\etc\hosts`（需管理员权限），添加：
```
192.168.0.200 crm.huakey.local
```

### 4.2 其他客户端

将 DNS 服务器设置为 `192.168.0.200`（NAS DNS Server），即可自动解析所有 `*.huakey.local` 域名。

---

## 5. 访问方式

| 方式 | URL |
|------|-----|
| 新地址（推荐） | `https://crm.huakey.local` |
| 旧地址（兼容） | `https://192.168.0.200:8443` |

**注意**: 自签名证书需要浏览器手动信任（点击"高级" -> "继续前往"）。

---

## 6. 完整请求链路

```
浏览器
  ↓ HTTPS (443)
DSM Nginx (crm.huakey.local)
  ├─ SSL 证书: crm.huakey.local.crt (CN/SAN: crm.huakey.local)
  ├─ X-Forwarded-Proto: https
  ↓ HTTPS (8443)
Docker huakey-nginx
  ├─ SSL 终止 (8443)
  ├─ X-Forwarded-Proto: https ($scheme = https)
  ↓ HTTP (5000)
huakey-app (Express)
  ├─ trust proxy = 1
  ├─ req.secure = true (读取 X-Forwarded-Proto: https)
  ├─ CORS_ORIGIN = https://crm.huakey.local
  └─ Cookie: { httpOnly: true, secure: true, sameSite: 'strict' }
```

---

## 7. 变更文件清单

### 7.1 NAS 端变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `/volume1/docker/crm-stack/.env` | 修改 | CORS_ORIGIN → https://crm.huakey.local |
| `/volume1/docker/crm-stack/.env.secrets` | 修改 | CORS_ORIGIN → https://crm.huakey.local |
| `/volume1/docker/crm-stack/nginx/certs/crm.huakey.local.crt` | 新增 | SSL 证书 |
| `/volume1/docker/crm-stack/nginx/certs/crm.huakey.local.key` | 新增 | SSL 私钥 |
| `/usr/local/etc/nginx/conf.d/http.crm-huakey-local.conf` | 新增 | DSM Nginx 反代配置 |
| `/var/packages/DNSServer/target/named/etc/zone/master/huakey.local.zone` | 新增 | DNS 区域文件 |

### 7.2 本地仓库变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `deploy/install-hosts-crm-domain.bat` | 新增 | Windows hosts 安装脚本 |
| `docs/crm-v1-internal-domain-deployment.md` | 新增 | 本文档 |

### 7.3 未变更（遵守约束）

- [x] 未修改业务代码（backend/、frontend/）
- [x] 未修改数据库（schema、数据）
- [x] 未修改冻结模块

---

## 8. 后续注意事项

1. **证书有效期**: 自签名证书默认有效期为 365 天，到期后需重新生成
2. **DNS Server 维护**: DSM DNS Server 服务需保持运行，否则内网域名解析失效
3. **新客户端接入**: 新设备需配置 hosts 或将 DNS 指向 192.168.0.200
4. **旧地址兼容**: `https://192.168.0.200:8443` 仍可访问，但 CORS 仅允许新域名
5. **证书信任**: 生产环境建议将自签名证书导入客户端受信任根证书颁发机构，避免浏览器警告

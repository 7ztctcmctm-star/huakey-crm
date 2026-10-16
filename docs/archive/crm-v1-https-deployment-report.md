# HuakeyCRM v1 HTTPS Deployment Report

> **文档类型**: HTTPS Deployment Final Report
> **版本**: HuakeyCRM v1.0
> **日期**: 2026-08-06
> **最终状态**: **PASS**

---

## Environment

| 项目 | 值 |
|------|-----|
| NAS 设备 | 群晖 NAS（DSM 7.x） |
| NAS IP | 192.168.0.200 |
| 部署目录 | /volume1/docker/crm-stack |
| Docker | Container Manager（docker 24.x） |
| CRM 版本 | 1.5.0（production） |
| 运行时 | Node.js + Express 4.22.2 |
| 数据库 | MySQL 8.0.46 |
| 缓存 | Redis 7-alpine |
| 访问地址 | https://192.168.0.200:8443 |

### 端口规划

| 端口 | 服务 | 对外 | 说明 |
|------|------|------|------|
| 8443 | huakey-nginx（HTTPS） | ✅ | HTTPS 反向代理入口 |
| 5000 | huakey-app | ❌ | 仅内部网络（expose） |
| 3306 | huakey-mysql | ❌ | 仅内部网络 |
| 6379 | huakey-redis | ❌ | 仅内部网络 |
| 5000 | DSM HTTP | ✅ | 群晖管理界面 |
| 5001 | DSM HTTPS | ✅ | 群晖管理界面 |

---

## Certificate

| 属性 | 值 |
|------|-----|
| 类型 | 自签证书（Self-signed） |
| 算法 | RSA 2048 |
| Subject | C=CN, ST=GuangDong, L=ShenZhen, O=Huakey, CN=192.168.0.200 |
| Issuer | 自签（同 Subject） |
| SAN | IP Address:192.168.0.200 |
| 生效时间 | 2026-08-06 07:35:12 UTC |
| 过期时间 | 2036-08-03 07:35:12 UTC |
| 有效期 | 3650 天（10 年） |
| 来源 | 内部生成（openssl，非 CA 签发） |
| 续期方式 | 手动重新执行证书生成命令 |
| 证书路径 | /volume1/docker/crm-stack/nginx/certs/server.crt |
| 私钥路径 | /volume1/docker/crm-stack/nginx/certs/server.key |

### 证书选择说明

- **无公网域名**：内网环境仅 IP 192.168.0.200 访问，不满足 Let's Encrypt 申请条件（需公网域名 + 80 端口可达）
- **采用自签证书**：适用于内网部署，浏览器需手动信任证书
- **续期建议**：证书过期前重新生成并重启 nginx 容器

---

## Reverse Proxy

### 架构

```
用户浏览器
   ↓ HTTPS 8443 (TLS 1.2/1.3)
Docker nginx 容器（huakey-nginx, nginx:alpine）
   ↓ HTTP app:5000（Docker 内部网络）
huakey-app 容器（Node.js + Express）
   ↓
MySQL 8.0.46 + Redis 7（内部网络）
```

### nginx 配置摘要

| 配置项 | 值 |
|--------|-----|
| 监听端口 | 8443 ssl |
| HTTP/2 | 开启 |
| TLS 协议 | TLSv1.2, TLSv1.3 |
| 加密套件 | HIGH:!aNULL:!MD5 |
| 上游 | http://app:5000 |
| 请求大小限制 | 50MB |
| 连接超时 | 60s |
| 读超时 | 60s |

### Header 转发

| Header | 值 | 用途 |
|--------|-----|------|
| Host | $host | 原始主机名 |
| X-Real-IP | $remote_addr | 客户端真实 IP |
| X-Forwarded-For | $proxy_add_x_forwarded_for | 代理链 |
| X-Forwarded-Proto | $scheme | 协议标识（https） |
| Upgrade | $http_upgrade | WebSocket 升级 |
| Connection | "upgrade" | WebSocket 保持 |

### 安全头

| Header | 值 |
|--------|-----|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | SAMEORIGIN |
| X-XSS-Protection | 1; mode=block |

### 协议支持

| 协议 | 状态 |
|------|------|
| GET | ✅ |
| POST | ✅ |
| PUT/DELETE/PATCH | ✅ |
| WebSocket | ✅ |
| HTTP/2 | ✅ |

---

## Configuration Changes

### 1. docker-compose.synology.yml

| 服务 | 变更项 | 变更前 | 变更后 | 说明 |
|------|--------|--------|--------|------|
| app | 端口映射 | `ports: "6789:5000"` | `expose: "5000"` | 移除 HTTP 外部端口，仅内部可达 |
| nginx | 新增服务 | — | nginx:alpine, 8443:8443 | HTTPS 反向代理容器 |

### 2. .env（NAS 生产环境）

| 配置项 | 变更前 | 变更后 |
|--------|--------|--------|
| CORS_ORIGIN | `http://192.168.0.200:6789` | `https://192.168.0.200:8443` |

### 3. 新增文件

| 文件 | 路径 | 说明 |
|------|------|------|
| nginx.conf | /volume1/docker/crm-stack/nginx/nginx.conf | nginx 反向代理配置 |
| server.crt | /volume1/docker/crm-stack/nginx/certs/server.crt | 自签 SSL 证书 |
| server.key | /volume1/docker/crm-stack/nginx/certs/server.key | SSL 私钥 |

### 4. Cookie Secure 配置

| 检查项 | 结果 |
|--------|------|
| COOKIE_SECURE 环境变量 | 项目未使用，无需新增 |
| 实现方式 | `secure: isProduction && req.secure`（代码自动判断） |
| trust proxy | `app.set('trust proxy', 1)` 已启用 |
| HTTPS 下效果 | Cookie 自动设置 Secure 标志 ✅ |
| 代码改动 | 无（未修改业务代码） |

---

## Verification Result

### 页面验证

| 验证项 | 结果 | 状态 |
|--------|------|------|
| HTTPS 页面加载 | code 200, 629 bytes, 0.042s | ✅ PASS |
| 前端正常渲染 | 页面正常显示 | ✅ PASS |

### API 验证

| 验证项 | 结果 | 状态 |
|--------|------|------|
| Health API | 200, "服务运行正常", DB+Redis OK | ✅ PASS |
| 登录端点可达 | /api/v1/auth/login 可达 | ✅ PASS |

### Cookie 验证

| 验证项 | 结果 | 状态 |
|--------|------|------|
| Secure 标志 | `csrf-token=...; Secure` | ✅ PASS |
| SameSite | Strict | ✅ PASS |

```
Set-Cookie: csrf-token=...; Max-Age=604800; Path=/; Secure; SameSite=Strict
```

### HTTP 访问验证

| 验证项 | 结果 | 状态 |
|--------|------|------|
| HTTP 6789 外部访问 | code 000（连接被拒绝） | ✅ PASS（已禁止） |
| HTTP 跳转 HTTPS | N/A（HTTP 已直接禁止） | ✅ 明确禁止 |

### 容器状态

| 容器 | 端口 | 状态 |
|------|------|------|
| huakey-app | 5000/tcp（仅内部） | ✅ Running |
| huakey-nginx | 0.0.0.0:8443->8443/tcp | ✅ Running |
| huakey-mysql | 3306/tcp（仅内部） | ✅ Running |
| huakey-redis | 6379/tcp（仅内部） | ✅ Running |

### 安全检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| HTTP 暴露登录入口 | ✅ 已消除 | 6789 外部端口已关闭 |
| Cookie 未加密 | ✅ 无风险 | HTTPS 下 Secure 标志已设置 |
| CORS 旧地址 | ✅ 已更新 | 已改为 https://192.168.0.200:8443 |
| 数据库外部暴露 | ✅ 无风险 | MySQL/Redis 仅内部网络 |
| Swagger 文档 | ✅ 已关闭 | ENABLE_SWAGGER=false |
| 验证码跳过 | ✅ 未跳过 | SKIP_CAPTCHA=false |

### 验证汇总

| 验证项 | 结果 |
|--------|------|
| 页面 HTTPS | ✅ PASS |
| 登录可达 | ✅ PASS |
| Cookie Secure | ✅ PASS |
| API health | ✅ PASS |
| HTTP 禁止 | ✅ PASS |
| 安全检查 | ✅ PASS |

---

## Rollback Plan

### 回滚步骤

```bash
cd /volume1/docker/crm-stack

# 1. 恢复 docker-compose 备份
cp docker-compose.synology.yml.bak.https.20260806_* docker-compose.synology.yml

# 2. 恢复 CORS_ORIGIN 为 HTTP
sed -i 's|CORS_ORIGIN=https://192.168.0.200:8443|CORS_ORIGIN=http://192.168.0.200:6789|' .env

# 3. 重建 app 容器（恢复 6789 外部端口）
/usr/local/bin/docker compose -f docker-compose.synology.yml up -d app

# 4. 停止 nginx 容器
/usr/local/bin/docker compose -f docker-compose.synology.yml stop nginx

# 5. 验证 HTTP 恢复
curl http://192.168.0.200:6789/api/v1/health
```

### 回滚风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 用户已习惯 HTTPS | 需重新改用 HTTP | 通知用户 |
| Cookie Secure 已设 | HTTP 下 Secure Cookie 不发送 | 回滚后 Secure 自动失效（req.secure=false） |
| 浏览器 HSTS 缓存 | 可能缓存 HTTPS | 未启用 HSTS，无影响 |

### 备份文件

| 备份 | 路径 |
|------|------|
| docker-compose | docker-compose.synology.yml.bak.https.20260806_154227 |

---

## 最终状态

```
HTTPS Deployment: PASS
```

| 阶段 | 状态 |
|------|------|
| 实施前检查 | ✅ |
| 证书配置 | ✅ |
| 反向代理 | ✅ |
| 配置变更 | ✅ |
| 服务重启 | ✅ |
| HTTPS 验证 | ✅ |
| 安全检查 | ✅ |

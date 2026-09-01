# HuakeyCRM v1 HTTPS 部署执行日志

> **文档类型**: Deployment Execution Log
> **版本**: HuakeyCRM v1.0
> **执行日期**: 2026-08-06
> **执行人**: HTTPS Deployment Engineer
> **状态**: 已完成

---

## 1. 实施前检查

### 1.1 DSM 环境检查

| 检查项 | 结果 |
|--------|------|
| NAS IP | 192.168.0.200 |
| DSM HTTP 端口 | 5000（DSM 管理界面） |
| DSM HTTPS 端口 | 5001 |
| 80 端口 | 已被 DSM nginx 占用 |
| 443 端口 | 已被 DSM nginx 占用 |
| 反向代理功能 | DSM 内置（未使用，改用 Docker nginx） |

### 1.2 Docker 环境检查

| 检查项 | 结果 |
|--------|------|
| Docker 路径 | /usr/local/bin/docker |
| 部署目录 | /volume1/docker/crm-stack |
| CRM 容器 | huakey-app（运行中） |
| 原访问地址 | http://192.168.0.200:6789 |
| CRM 版本 | 1.5.0（production） |
| MySQL | 8.0.46 |
| Redis | 7-alpine |

### 1.3 方案决策

| 评估项 | 决策 |
|--------|------|
| 方案 A：DSM 反向代理 | 不采用（443 被 DSM 占用，SSH 无 sudo 权限无法配置 DSM API） |
| 方案 B：Docker nginx 容器 | **采用** |
| 监听端口 | 8443（443 被 DSM 占用） |
| 证书来源 | 自签证书（无公网域名，不符合 Let's Encrypt 条件） |

---

## 2. 证书配置

### 2.1 证书条件判断

| 条件 | 状态 |
|------|------|
| 公网域名 | 无（内网 IP 192.168.0.200） |
| Let's Encrypt | 不适用（需公网域名 + 80 端口可达） |
| 决策 | 情况 B：采用自签证书 |

### 2.2 证书生成

通过 Docker alpine 容器内 openssl 生成自签证书：

```bash
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /certs/server.key \
  -out /certs/server.crt \
  -subj '/C=CN/ST=GuangDong/L=ShenZhen/O=Huakey/CN=192.168.0.200' \
  -addext 'subjectAltName=IP:192.168.0.200'
```

### 2.3 证书详情

| 属性 | 值 |
|------|-----|
| 类型 | 自签证书（Self-signed） |
| 算法 | RSA 2048 |
| Subject | C=CN, ST=GuangDong, L=ShenZhen, O=Huakey, CN=192.168.0.200 |
| Issuer | C=CN, ST=GuangDong, L=ShenZhen, O=Huakey, CN=192.168.0.200（自签） |
| SAN | IP Address:192.168.0.200 |
| 生效时间 | 2026-08-06 07:35:12 UTC |
| 过期时间 | 2036-08-03 07:35:12 UTC |
| 有效期 | 3650 天（约 10 年） |
| 来源 | 内部生成（非 CA 签发） |
| 续期方式 | 手动重新执行证书生成命令 |

### 2.4 证书文件位置

| 文件 | NAS 路径 | 容器挂载 |
|------|----------|----------|
| server.crt | /volume1/docker/crm-stack/nginx/certs/server.crt | /etc/nginx/certs/server.crt:ro |
| server.key | /volume1/docker/crm-stack/nginx/certs/server.key | /etc/nginx/certs/server.key:ro |

---

## 3. 反向代理配置

### 3.1 架构

```
用户浏览器
   ↓ HTTPS 8443
Docker nginx 容器（huakey-nginx）
   ↓ HTTP app:5000（内部网络）
huakey-app 容器
   ↓
MySQL + Redis（内部网络）
```

### 3.2 nginx 配置

文件：`/volume1/docker/crm-stack/nginx/nginx.conf`

```nginx
server {
    listen 8443 ssl;
    http2 on;
    server_name 192.168.0.200 _;

    # SSL 证书
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";

    # 请求大小限制
    client_max_body_size 50m;

    # 反向代理到 App
    location / {
        proxy_pass http://app:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 3.3 Header 转发验证

| Header | 配置 | 状态 |
|--------|------|------|
| Host | `$host` | ✅ |
| X-Real-IP | `$remote_addr` | ✅ |
| X-Forwarded-For | `$proxy_add_x_forwarded_for` | ✅ |
| X-Forwarded-Proto | `$scheme` | ✅ |
| Upgrade（WebSocket） | `$http_upgrade` | ✅ |
| Connection（WebSocket） | `"upgrade"` | ✅ |

### 3.4 协议支持

| 协议 | 支持 |
|------|------|
| GET | ✅ |
| POST | ✅ |
| PUT/DELETE/PATCH | ✅ |
| WebSocket | ✅ |
| HTTP/2 | ✅ |
| TLS 1.2 | ✅ |
| TLS 1.3 | ✅ |

---

## 4. 生产配置变更

### 4.1 docker-compose.synology.yml 变更

| 服务 | 变更项 | 变更前 | 变更后 |
|------|--------|--------|--------|
| app | 端口映射 | `ports: "6789:5000"` | `expose: "5000"`（移除外部端口） |
| nginx | 新增服务 | 无 | nginx:alpine, 8443:8443, 证书+配置挂载 |

nginx 服务定义：

```yaml
nginx:
  image: nginx:alpine
  container_name: huakey-nginx
  restart: unless-stopped
  mem_limit: 128m
  ports:
    - "8443:8443"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - ./nginx/certs:/etc/nginx/certs:ro
  depends_on:
    app:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "wget", "-qO-", "https://localhost:8443/api/v1/health", "--no-check-certificate"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s
  networks:
    - crm-network
```

### 4.2 .env 变更（NAS 生产）

| 配置项 | 变更前 | 变更后 |
|--------|--------|--------|
| CORS_ORIGIN | `http://192.168.0.200:6789` | `https://192.168.0.200:8443` |

### 4.3 Cookie Secure 配置确认

| 检查项 | 结果 |
|--------|------|
| COOKIE_SECURE 环境变量 | 项目未使用该变量（无需新增） |
| Cookie Secure 实现方式 | `secure: isProduction && req.secure`（代码层自动判断） |
| trust proxy | `app.set('trust proxy', 1)`（生产环境已启用） |
| HTTPS 下 req.secure | true（经 nginx X-Forwarded-Proto 传递） |
| Cookie Secure 标志 | ✅ 自动生效（无需新增配置） |

相关代码：
- `backend/middleware/csrf.js`：`secure: isProduction && req.secure`
- `backend/routes/auth.js`：token Cookie `secure: isProduction && req.secure`
- `backend/app.js`：`app.set('trust proxy', 1)`

---

## 5. 服务重启

### 5.1 执行记录

| 步骤 | 命令 | 结果 |
|------|------|------|
| 启动 nginx | `docker compose up -d nginx` | ✅ huakey-nginx 已启动 |
| 重启 app | `docker compose restart app` | ✅ huakey-app 已重启（应用新 CORS_ORIGIN） |
| 关闭 HTTP 6789 | `docker compose up -d app`（expose 替换 ports） | ✅ huakey-app 已重建（无外部端口） |

### 5.2 容器最终状态

| 容器 | 端口 | 状态 |
|------|------|------|
| huakey-app | 5000/tcp（仅内部） | ✅ Running |
| huakey-nginx | 0.0.0.0:8443->8443/tcp | ✅ Running |
| huakey-mysql | 3306/tcp（仅内部） | ✅ Running |
| huakey-redis | 6379/tcp（仅内部） | ✅ Running |

---

## 6. HTTPS 验证结果

### 6.1 页面验证

| 验证项 | 结果 |
|--------|------|
| HTTPS 访问 | ✅ https://192.168.0.200:8443 正常打开 |
| HTTP 状态码 | 200 |
| 页面大小 | 629 bytes |
| 响应时间 | 0.042s |

### 6.2 健康检查 API

```
GET https://192.168.0.200:8443/api/v1/health
```

```json
{
  "code": 200,
  "message": "服务运行正常",
  "data": {
    "status": "ok",
    "version": "1.5.0",
    "nodeEnv": "production",
    "expressVersion": "4.22.2",
    "mysqlVersion": "MySQL 8.0.46",
    "db": true,
    "redis": true,
    "timestamp": "2026-08-06T07:45:15Z"
  }
}
```

状态：✅ 通过

### 6.3 Cookie 验证

HTTPS 下 Set-Cookie 响应头：

```
Set-Cookie: csrf-token=...; Max-Age=604800; Path=/; Secure; SameSite=Strict
```

| 检查项 | 结果 |
|--------|------|
| Secure 标志 | ✅ 已设置 |
| SameSite | ✅ Strict |
| HttpOnly（token） | ✅ 由 auth 路由设置 |

### 6.4 HTTP 访问验证

| 验证项 | 结果 |
|--------|------|
| HTTP 6789 外部访问 | ✅ 已关闭（code 000，连接被拒绝） |
| HTTP 是否跳转 HTTPS | N/A（HTTP 已直接禁止） |

### 6.5 登录端点验证

| 验证项 | 结果 |
|--------|------|
| HTTPS 登录端点可达 | ✅ /api/v1/auth/login 可达 |
| 端点响应 | ✅ 正常响应（测试用无效 JSON 返回 400，端点工作正常） |

---

## 7. 安全检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| HTTP 暴露登录入口 | ✅ 已消除 | 6789 外部端口已关闭，仅 HTTPS 8443 可达 |
| Cookie 未加密 | ✅ 无风险 | HTTPS 下 Cookie 自动设置 Secure 标志 |
| CORS 旧地址 | ✅ 已更新 | CORS_ORIGIN 已从 HTTP 改为 HTTPS |
| MySQL 外部暴露 | ✅ 无风险 | 仅内部网络 3306/tcp |
| Redis 外部暴露 | ✅ 无风险 | 仅内部网络 6379/tcp |
| Swagger 文档 | ✅ 已关闭 | ENABLE_SWAGGER=false |
| 验证码跳过 | ✅ 未跳过 | SKIP_CAPTCHA=false |

---

## 8. 执行总结

| 阶段 | 状态 |
|------|------|
| 1. 实施前检查 | ✅ 完成 |
| 2. 证书配置 | ✅ 自签证书（10 年有效期） |
| 3. 反向代理配置 | ✅ Docker nginx 8443 |
| 4. 生产配置变更 | ✅ CORS + 端口映射 |
| 5. 服务重启 | ✅ 容器全部运行 |
| 6. HTTPS 验证 | ✅ 全部通过 |
| 7. 安全检查 | ✅ 无 HTTP 暴露 |

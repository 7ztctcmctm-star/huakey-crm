# CORS 修复变更报告 — https://crm.huakey.local

> **编制日期**: 2026-08-07
> **执行人**: Claude Code（SSH 运维通道）
> **目标**: 修复员工电脑访问 `https://crm.huakey.local` 登录时 CORS 错误
> **约束**: 不修改 helmet / HSTS / nginx 架构 / 代码

---

## 1. 执行结果摘要

| 步骤 | 内容 | 结果 |
|------|------|------|
| 1 | 检查生产 NAS 当前 CORS_ORIGIN 最终来源 | ✅ 完成 |
| 2 | 确认 .env.secrets 是否覆盖 .env | ✅ 完成（无冲突） |
| 3 | 修改生产配置为 https://crm.huakey.local | ⚠️ 已是该值，**无需修改** |
| 4 | 重启 app 容器 | ✅ 完成，healthy |
| 5 | 验证浏览器登录请求响应头 | ✅ 完成，CORS 匹配正常 |

---

## 2. CORS_ORIGIN 最终来源（检查结果）

**结论: 生产配置已是最新值，且三层一致。**

| 来源 | 值 | 状态 |
|------|-----|------|
| `/volume1/docker/crm-stack/.env` | `https://crm.huakey.local` | ✅ |
| `/volume1/docker/crm-stack/.env.secrets` | `https://crm.huakey.local` | ✅ |
| 运行中 app 容器 `/proc/1/environ` | `https://crm.huakey.local` | ✅ |

**历史轨迹**（由 `.bak.domain` 备份还原）：
- 修改前 `.env`: `https://192.168.0.200:8443`（旧 IP 直连）
- 修改前 `.env.secrets`: `http://192.168.0.200:6789`（更旧的 HTTP 入口）
- 已统一改为 `https://crm.huakey.local`（今天 17:21 由运维完成，本次未再改动）

---

## 3. .env.secrets 覆盖确认

`deploy.sh` 的加载链为：
```
[1] source .env.secrets      → 首次注入
[2] cp .env.synology → .env  → 复制模板（若无 .env）
[3] source .env              → 加载非敏感配置
[4] source .env.secrets      → 二次覆盖，确保真实值优先
[5] docker compose --env-file .env up -d
```

**当前 `CORS_ORIGIN` 在两个文件中值相同（`https://crm.huakey.local`），无覆盖冲突。**
若历史上 `.env.secrets` 残留旧值，会覆盖 `.env`——本次确认已无此问题。

---

## 4. 实际修改

**未做任何文件修改** —— 生产配置已是目标值 `https://crm.huakey.local`。

唯一执行的动作是**重启 app 容器**（按用户指令，确保状态一致）：
```
docker restart huakey-app
→ 等待健康检查，3 次探测后 healthy
```

---

## 5. 验证结果（浏览器登录响应头）

### 5.1 通过 DSM 反代（443）— 员工实际访问路径 ✅

| 请求 | 响应 | CORS 头 |
|------|------|---------|
| `OPTIONS /api/v1/auth/login` (Origin: `https://crm.huakey.local`) | 204 | `access-control-allow-origin: https://crm.huakey.local` ✅ 匹配 |
| `POST /api/v1/auth/login` (Origin: `https://crm.huakey.local`) | 400（预期，错误凭据） | `access-control-allow-origin: https://crm.huakey.local` + `allow-credentials: true` ✅ 匹配 |

### 5.2 拓扑确认

```
员工浏览器
  → https://crm.huakey.local (443, hosts 解析 192.168.0.200)
  → DSM nginx 反代 (http.crm-huakey-local.conf)
  → docker nginx (8443, huakey-nginx)
  → app:5000
```

- 前端 `baseURL: "/api/v1"`（相对路径 → 同源请求，本不应触发 CORS）
- 前端构建产物无残留绝对 IP 地址（已扫描确认）
- `X-Forwarded-Proto: $scheme` 正常传递

### 5.3 需要警惕的路径（非本次目标，但可能造成"仍报错"）

| 访问方式 | Origin | ACAO 返回 | 结果 |
|---------|--------|-----------|------|
| `https://crm.huakey.local`（443 反代）| `https://crm.huakey.local` | `https://crm.huakey.local` | ✅ 匹配 |
| `https://crm.huakey.local:8443`（直连 docker nginx）| `https://crm.huakey.local:8443` | `https://crm.huakey.local`（无端口）| ❌ **不匹配** |
| `http://192.168.0.200:6789`（旧 HTTP 入口，已不监听）| `http://192.168.0.200:6789` | 拒绝 | ❌ |

> **关键提示**: `cors` 中间件对字符串 origin 固定返回 `access-control-allow-origin: https://crm.huakey.local`（不反映请求 Origin），因此**浏览器 Origin 必须精确等于该值**（含端口）。员工若通过 `:8443` 或旧 IP 访问仍会报 CORS 错误——正确入口是 `https://crm.huakey.local`（443）。

---

## 6. 建议的剩余动作

1. **确认员工使用正确 URL**: `https://crm.huakey.local`（443，经 DSM 反代），不要带 `:8443` 或使用旧 IP。
2. **确认员工电脑 hosts 文件**已含 `192.168.0.200 crm.huakey.local`（`deploy/install-hosts-crm-domain.bat` 可配置）。
3. **证书信任**: DSM 反代使用 `crm.huakey.local.crt` 自签证书，员工浏览器需导入该证书（或受信任的 CA），否则浏览器会先拦截 TLS 错误而非进入 CORS。
4. **缓存清理**: 若员工浏览器此前访问过旧 IP，建议清除站点数据 / 无痕窗口验证。
5. （后续迭代，非本次范围）如需兼容 `:8443` 直连，需按设计方案改造 CORS 支持多 Origin——涉及代码修改，本次按约束未执行。

---

*本报告由 Claude Code 通过 SSH 对生产 NAS 执行并自动生成。*
*执行原则: 不修改 helmet / HSTS / nginx 架构 / 代码。*

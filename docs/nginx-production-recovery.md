# Nginx Production Recovery — 配置来源恢复记录

> **日期**: 2026-08-07
> **类型**: 配置来源恢复（恢复 Git 与生产一致）
> **参考**: [nginx-configuration-audit.md](nginx-configuration-audit.md)

## Before — Git 与生产差异

| 项 | 生产实际 | Git main 工作区（恢复前） | 差异 |
|----|---------|--------------------------|------|
| nginx/nginx.conf | 存在（39 行 bind mount） | 缺失 | 工作区缺文件 |
| nginx/certs/ | 存在 | 缺失 | 工作区缺证书 |
| compose nginx 服务 | 由 compose 管理 | 无 nginx 服务 | compose 缺定义 |

**根因**: Phase 3B git reset 使工作区恢复到 main（nginx/ 为空、compose 无 nginx 服务）。生产容器因 bind mount 仍运行，但失去恢复能力。

## Recovery Actions

1. 从 Phase 0 快照恢复 nginx/nginx.conf（39 行，与生产一致，未优化）
2. 从快照恢复 nginx/certs/ 公钥证书（server.crt 等；.key 由 gitignore 排除）
3. 在 compose backup 后补回 nginx 服务（8443 + 挂载 nginx.conf/certs）

## Production Impact

未影响生产：容器未重启、配置未修改、证书/端口/proxy 未改、compose 校验通过。

## Remaining Risk

- deploy/nginx-*.conf 废弃模板仍存在（后续清理）
- 需 push 使仓库与 NAS 对齐

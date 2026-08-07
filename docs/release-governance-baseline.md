# HuakeyCRM Release Governance Baseline

> **文档类型**: 发布治理定版
> **版本**: v1.0.1-release-engineering-ready
> **日期**: 2026-08-07

## 1. 当前生产架构

```
GitHub main → CI → Git tag v1.x.x → Docker build → NAS compose up → 生产容器
```

## 2. 发布入口（唯一路径）

```
main → CI green → tag → docker image → NAS deploy
```

## 3. 禁止事项

1. 不直接修改生产容器
2. 不手工替换 nginx 配置
3. 不绕过 migration
4. 不使用未 tag 镜像
5. 不在 NAS 工作区改代码不提交

## 4. 发布责任边界

| 层 | 机制 | 来源 |
|----|------|------|
| 代码 | Git (main) | GitHub |
| 镜像 | Docker (crm-stack-app:v1.x.x) | 构建 |
| 配置 | compose/env | NAS 部署 |
| 数据 | Migration (database/migrations/) | 版本化 |

## 5. 关键来源文件

| 用途 | 文件 |
|------|------|
| 生产 Dockerfile | Dockerfile.synology |
| 生产 Compose | docker-compose.synology.yml |
| 生产 nginx | nginx/nginx.conf |
| CI Compose | docker-compose.ci.yml |
| 发布流程 | docs/release-process.md |
| 恢复记录 | docs/nginx-production-recovery.md |

## 6. 发布状态

| 项 | 值 |
|----|-----|
| 生产基线 | v1.0.0-prod-baseline-2026-08-07 (2081021) |
| 开发主线 | main → 7f3dd62 |
| 工程治理 | v1.0.1-release-engineering-ready |
| 生产运行 | huakey-app b036ad59 / huakey-nginx healthy |

## 7. Phase 5 建议 (Sales Pipeline Domain Audit)

进入 Phase 5 前不要直接开发 Opportunity。先做管道审计:

```
Lead → Customer → Opportunity → Contract → Payment
```

重点: 数据模型连接 / 状态流转 / 权限 / 页面入口 / API 边界 / E2E 流程。

原因: Customer Center 与 Opportunity Center 已历经领域拆分，先固化边界再开发。

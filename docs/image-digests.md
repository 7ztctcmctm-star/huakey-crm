# 容器基础镜像 digest 固定表

> [P2-12 2026-10-26] 生产/测试/灰度/CI 使用的所有外部基础镜像均以
> `镜像:tag@sha256:<多架构索引 digest>` 形式固定，防止 tag 被重新推送后
> 在不知情的情况下换入新内容（供应链风险）。
>
> 解析时间：2026-10-26。解析方式：本机无法直连 Docker Hub
> （`registry-1.docker.io:443` 超时），改用两个独立镜像站
> `docker.m.daocloud.io` 与 `docker.1panel.live` 查询 manifest index，
> 两者返回的 digest 完全一致。**官方 Hub 直连未验证**。

| 镜像 | tag | 多架构索引 digest | 使用位置 |
|---|---|---|---|
| mysql | 8.0 | `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b` | `docker-compose*.yml` / `deploy/docker-compose.*.yml` |
| redis | 7-alpine | `sha256:57e4255cc971b1c8d6f8a6ca283ac01bc3ecdd914273ef6bfaede87aaecd6541` | 同上 |
| node | 22-alpine | `sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914` | `Dockerfile.synology` / `backend/Dockerfile` / `frontend/Dockerfile` |
| nginx | alpine | `sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417` | `Dockerfile.synology`（无）/ `frontend/Dockerfile` / canary/root compose |

## 升级流程

1. 在可访问 Docker Hub 的机器上解析新 digest（或继续使用镜像站，并至少两个站点交叉验证）：
   ```bash
   docker buildx imagetools inspect mysql:8.0
   docker buildx imagetools inspect redis:7-alpine
   docker buildx imagetools inspect node:22-alpine
   docker buildx imagetools inspect nginx:alpine
   ```
2. 确认返回的是**多架构索引**（`application/vnd.oci.image.index.v1+json`
   或 `application/vnd.docker.distribution.manifest.list.v2+json`），不要使用单架构 manifest digest。
3. 全局替换本表与各文件中的 digest，更新本文件的“解析时间”。
4. 重新构建并跑完整回归；基础镜像升级必须单独提交，便于回滚。

## 回滚

将 digest 改回上一个已记录的版本即可。tag 仍在（如 `mysql:8.0`），
但**不要**为了省事退回只写 tag 的形式。

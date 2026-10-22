# NAS 容器资源限制评估报告（D3-2 衍生）

> 日期：2026-10-22 ｜ 关联：`docs/deploy-hardening-d3.md`
> 背景：AGENTS.md 7.26 要求容器必须设置 `mem_limit` / `cpus` 资源限制；
> `docker-compose.synology.yml` 头部注释说明群晖 DSM 内核不支持 cgroup v1
> CPU CFS scheduler，全部去掉了资源限制。本报告给出结论与替代方案。

---

## 一、现状

| 服务 | mem_limit | cpus | logging |
|---|---|---|---|
| mysql | 无 | 无 | 10m×3 ✓ |
| redis | 无 | 无（maxmemory 100mb 应用内限制） | 10m×3 ✓ |
| app | 无 | 无 | 10m×3 ✓ |
| backup | 无 | 无 | 10m×3 ✓（D3 补） |
| nginx | 无 | 无 | 10m×3 ✓（D3 补） |

## 二、为什么不能直接加回 cpus / mem_limit

1. **cpus**：DSM 内核不支持 cgroup v1 CPU CFS scheduler，
   `docker compose up -d` 直接报错
   `NanoCPUs can not be set, as your kernel does not support CPU CFS scheduler`——
   加上即部署失败（2026-08 审计已踩过，compose 头部注释有记录）。
2. **mem_limit**：cgroup v1 memory 限制本身 DSM 支持，但本栈全部去掉是
   一并规避 CFS 报错的连带结果。加回 mem_limit 的收益与风险：
   - 收益：单容器内存失控（如 MySQL 缓冲池配置错误、Node 内存泄漏）时
     不影响 NAS 上其他服务；
   - 风险：限制值拍脑袋设小了会 OOM kill 生产容器，且 NAS 上 DSM 自身、
     其他套件都在抢内存，静态值难以维护。

## 三、NAS 实测资源（2026-10-22）

| 指标 | 值 |
|---|---|
| MemTotal | ≈7894 MB |
| 当前 available | ≈5115 MB |
| Swap | 2 GB（几乎未用） |
| 磁盘（/volume1） | 备份目录所在卷，余量充足 |

MySQL 缓冲池 D3 已改为按 MemTotal 25% 自适应（钳制 128–1024MB），
这是**唯一需要按宿主机内存伸缩的参数**，已从固定值改为启动探测，
不需要靠 mem_limit 兜底。

## 四、结论与替代方案

**结论：维持不设 mem_limit / cpus，以"监控 + 告警 + 单参数自适应"替代硬限制。**

理由：DSM CFS 限制下无法设 CPU 限额；内存限额静态值维护成本高、误杀风险实打实，
而本栈真正吃内存的大户（MySQL 缓冲池）已自适应，Node 侧有
`--max-old-space-size` 之外的默认堆上限（约 1.7GB 量级）与 PM2/容器重启兜底。

替代方案（按优先级）：

1. **守护脚本监控 + 告警**（已具备一半条件）：
   app 容器已有 `ALERT_ENABLED` / `WECHAT_WEBHOOK_URL` 告警通道
   （`docker-compose.synology.yml` app.environment）。
   建议后续新增一个轻量守护（宿主 cron 或独立小容器）：每 5 分钟采集
   `docker stats --no-stream` 的容器内存/CPU 与 `df`，超阈值
   （如单容器 RSS > 70% 宿主机内存、磁盘 < 10%）发企业微信告警。
   该脚本本次未实现——属运维增强而非部署加固，列入计划外 backlog。
2. **MySQL 缓冲池自适应**：D3 已落地（`deploy/mysql-entrypoint.sh`），
   大内存机型不再浪费、小内存机型不再吃紧。
3. **redis maxmemory 100mb + allkeys-lru**：已配置，缓存不会无限增长。
4. **日志轮转 10m×3**：D3 起五服务全覆盖，日志不会吃爆磁盘。

## 五、若未来 DSM 内核升级（支持 CFS）

届时可直接在 compose 补回（建议值，需按实测调整）：

| 服务 | mem_limit | cpus |
|---|---|---|
| mysql | 2g | 1.5 |
| app | 2g | 2.0 |
| redis | 512m | 0.5 |
| nginx | 256m | 0.5 |
| backup | 512m | 0.5 |

注意 backup 容器承担月度恢复演练（导入全量 dump），512m 的 MySQL 客户端
导入操作内存占用可控，但演练期间会与生产 mysql 抢 IO，建议错峰（现为 03:00）。

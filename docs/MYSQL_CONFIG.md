# MySQL 配置说明（群晖 NAS）

> 适用文件：`docker-compose.synology.yml`
> 适用环境：群晖 NAS Container Manager
> 资源限制：**不在 compose 内设置** `mem_limit` / `cpus` / `deploy.resources`
> （DSM 内核不支持 cgroup v1 CPU CFS scheduler，设置后 `docker compose up` 会报
> `NanoCPUs can not be set`；资源上限由 DSM / Container Manager 统一管理）

---

## 1. 容器资源限制说明

`docker-compose.synology.yml` **不包含** `deploy.resources.limits` 段。
历史文档中的 “MySQL 256M / App 384M / Redis 128M” 已随该调整失效，
不要再按固定上限估算 MySQL 内存。

---

## 2. 当前 MySQL 启动参数

启动参数已从 compose `command:` 迁入 `deploy/mysql-entrypoint.sh`：

```bash
docker-entrypoint.sh mysqld \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --default-authentication-plugin=mysql_native_password \
  --innodb_buffer_pool_size="${POOL_MB}M" \
  --innodb_log_file_size=128M \
  --max_connections=100 \
  --skip-host-cache \
  --skip-name-resolve \
  --explicit_defaults_for_timestamp=1 \
  --slow_query_log=ON \
  --long_query_time=2 \
  --default-time-zone=+08:00
```

其中 `POOL_MB` 的计算规则：

- 未设置 `INNODB_BUFFER_POOL_SIZE_MB` 时，取容器可见 `MemTotal` 的 **25%**；
- 钳制在 **128MB ~ 1024MB**；
- 读取 `/proc/meminfo` 失败时回退 **256MB**；
- 设置环境变量 `INNODB_BUFFER_POOL_SIZE_MB` 可手动覆盖。

---

## 3. 各参数说明

| 参数 | 当前值 | 说明 |
|---|---|---|
| `character-set-server` | `utf8mb4` | 服务器默认字符集，支持完整 Unicode（含 emoji） |
| `collation-server` | `utf8mb4_unicode_ci` | 默认排序规则，支持 Unicode 排序且不区分大小写 |
| `default-authentication-plugin` | `mysql_native_password` | 默认认证插件，兼容旧版 MySQL 客户端和 Node.js mysql2 驱动 |
| `innodb_buffer_pool_size` | 自适应 `MemTotal/4`，钳制 128M–1024M | InnoDB 缓冲池；大内存机型自动放大，小内存机型保底 128M |
| `max_connections` | `100` | 最大并发连接数 |
| `slow_query_log` | `ON` | 开启慢查询日志 |
| `long_query_time` | `2` | 慢查询阈值 2 秒 |
| `innodb_log_file_size` | `128M` | InnoDB redo log 文件大小 |
| `default-time-zone` | `+08:00` | 与 `TZ=Asia/Shanghai` 双保险 |

---

## 4. 验证配置是否生效

进入 MySQL 容器后执行：

```sql
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'innodb_log_file_size';
SHOW VARIABLES LIKE 'system_time_zone';
```

示例输出（buffer pool 随宿主机内存变化，以下仅为 1GB 机型示例）：

```text
+-------------------------+-----------+
| Variable_name           | Value     |
+-------------------------+-----------+
| innodb_buffer_pool_size | 268435456 |
| max_connections         | 100       |
| slow_query_log          | ON        |
| long_query_time         | 2.000000  |
| innodb_log_file_size    | 134217728 |
| system_time_zone        | CST       |
+-------------------------+-----------+
```

> `innodb_buffer_pool_size` 与 `innodb_log_file_size` 以字节显示；
> 实际 pool 大小以容器启动日志
> `[mysql-entrypoint] MemTotal=... -> innodb_buffer_pool_size=...MB` 为准。

---

## 5. 调整建议

1. **手动固定 buffer pool**：在 `.env` / compose 中设置 `INNODB_BUFFER_POOL_SIZE_MB`，重启 MySQL 生效。
2. **观察 OOM**：在 Container Manager 查看 MySQL 内存曲线；若长期接近 NAS 可用内存上限，
   调低 `INNODB_BUFFER_POOL_SIZE_MB` 或 `max_connections`。
3. **慢查询**：`SHOW VARIABLES LIKE 'slow_query_log_file';` 查看输出路径。
4. **连接数**：`SHOW STATUS LIKE 'Threads_connected';` / `Max_used_connections` 观察实际峰值。

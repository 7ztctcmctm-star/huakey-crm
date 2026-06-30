# MySQL 配置说明（群晖 NAS）

> 适用文件：`docker-compose.synology.yml`
> 适用环境：群晖 NAS Container Manager
> 内存限制：MySQL 256M / App 384M / Redis 128M

---

## 1. 容器内存限制

`docker-compose.synology.yml` 中通过 `deploy.resources.limits` 限制各服务内存：

```yaml
services:
  mysql:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '1.0'

  app:
    deploy:
      resources:
        limits:
          memory: 384M
          cpus: '1.0'

  redis:
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: '0.5'
```

---

## 2. 当前 MySQL 启动参数

```yaml
command:
  - --character-set-server=utf8mb4
  - --collation-server=utf8mb4_unicode_ci
  - --default-authentication-plugin=mysql_native_password
  - --innodb_buffer_pool_size=256M
  - --max_connections=50
  - --slow_query_log=ON
  - --long_query_time=2
  - --innodb_log_file_size=128M
```

---

## 2. 各参数说明

| 参数 | 当前值 | 说明 |
|---|---|---|
| `character-set-server` | `utf8mb4` | 服务器默认字符集，支持完整 Unicode（含 emoji） |
| `collation-server` | `utf8mb4_unicode_ci` | 默认排序规则，支持 Unicode 排序且不区分大小写 |
| `default-authentication-plugin` | `mysql_native_password` | 默认认证插件，兼容旧版 MySQL 客户端和 Node.js mysql2 驱动 |
| `innodb_buffer_pool_size` | `128M` | InnoDB 缓冲池大小，用于缓存表数据和索引；256MB 容器内建议不超过 128M |
| `max_connections` | `50` | 最大并发连接数，控制同时连接到 MySQL 的客户端数量 |
| `slow_query_log` | `ON` | 开启慢查询日志，记录执行时间超过阈值的 SQL |
| `long_query_time` | `2` | 慢查询阈值，执行时间超过 2 秒的 SQL 会被记录到慢查询日志 |
| `innodb_log_file_size` | `128M` | InnoDB redo log 文件大小，影响写入性能和崩溃恢复速度 |

---

## 3. NAS 总内存 1GB 场景下的分配建议

当前 `docker-compose.synology.yml` 中各容器内存上限为：MySQL 256M + App 384M + Redis 128M = **768M**，为系统和其他进程预留约 256M。为保证容器稳定运行，建议按以下原则分配：

### 3.1 内存占用估算

| 用途 | 建议占用 | 说明 |
|---|---|---|
| `innodb_buffer_pool_size` | **128MB** | 占容器内存的 50%，给连接线程和系统预留余量 |
| 连接线程 + 临时表 + 排序缓冲 | **~25MB** | 按 `max_connections=50` 估算，单连接占用约 0.5MB |
| MySQL 进程基础开销 | **~60MB** | 包括日志缓冲、字典缓存、线程池等 |
| 操作系统 / Docker 开销 | **~43MB** | 预留余量，避免 OOM |
| **合计** | **~256MB** | 与容器内存上限一致 |

### 3.2 关键参数建议值

| 参数 | 建议值 | 理由 |
|---|---|---|
| `innodb_buffer_pool_size` | `128M` | 256MB 容器下的合理上限，避免 OOM |
| `max_connections` | `50` | CRM 并发用户通常不高，50 个连接足够；过多连接会消耗额外内存 |
| `innodb_log_file_size` | `128M` | 满足日常写入吞吐，redo log 总大小约 256MB（2 个文件） |
| `slow_query_log` | `ON` | 便于后续性能调优和问题定位 |
| `long_query_time` | `2` | 2 秒阈值适合 OLTP 场景，可捕获明显慢 SQL |

### 3.3 后续监控与调整

1. **观察 OOM 情况**：部署后查看 Container Manager 中 MySQL 容器的内存曲线，若长期接近 256MB，可进一步降低 `innodb_buffer_pool_size` 至 `96M` 或调低 `max_connections`。
2. **慢查询日志位置**：默认输出到 MySQL 错误日志或 `mysql.slow_log` 表，可通过 `SHOW VARIABLES LIKE 'slow_query_log_file';` 查看路径。
3. **连接数监控**：定期执行 `SHOW STATUS LIKE 'Threads_connected';` 和 `SHOW STATUS LIKE 'Max_used_connections';`，若长期低于 30，可将 `max_connections` 降至 30 以节省内存。

---

## 4. 验证配置是否生效

进入 MySQL 容器后执行：

```sql
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'innodb_log_file_size';
```

预期输出：

```text
+-------------------------+-----------+
| Variable_name           | Value     |
+-------------------------+-----------+
| innodb_buffer_pool_size | 134217728 |
| max_connections         | 50        |
| slow_query_log          | ON        |
| long_query_time         | 2.000000  |
| innodb_log_file_size    | 134217728 |
+-------------------------+-----------+
```

> `innodb_buffer_pool_size` 和 `innodb_log_file_size` 以字节显示，分别为 128M 和 128M。

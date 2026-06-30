# 铧旗 CRM 故障排查手册

## 1. 数据库连接失败

**现象**：后端启动报错 "Access denied for user" 或 "ECONNREFUSED"

**排查**：
1. 确认 MySQL 容器运行中：`docker ps | grep mysql`
2. 确认 `.env` 中 `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` 正确
3. 进入 MySQL 容器验证：`docker exec -it crm-prod-mysql mysql -u root -p`
4. 确认用户权限：`SHOW GRANTS FOR 'crm_user'@'%';`

**解决**：修正 `.env` 后重启 app 容器：`docker compose restart app`

## 2. 前端 502 Bad Gateway

**现象**：页面打开显示 502

**排查**：
1. 确认后端容器运行中：`docker ps | grep crm-prod-app`
2. 确认后端端口：`curl http://localhost:5000/api/health`
3. 检查 Nginx upstream 配置：确认 `proxy_pass` 指向正确端口（6789）

**解决**：重启 app 容器，确认 Nginx reload

## 3. 上传文件失败

**现象**：上传报错 500 或文件找不到

**排查**：
1. 本地开发：确认 `backend/uploads/` 目录存在且可写
2. 生产环境：确认 Supabase Storage 配置（`SUPABASE_URL` / `SUPABASE_KEY`）
3. Docker 环境：确认 uploads volume 正确挂载
   ```bash
   docker compose exec app ls -la /app/uploads
   ```

**解决**：创建缺失目录或修正存储配置

## 4. 定时任务不执行

**现象**：公海客户不自动释放、提醒不生成

**排查**：
1. 确认不在 Vercel 环境（`VERCEL` 环境变量为空）
2. 确认 node-cron 正常：`docker compose logs app | grep "定时任务"`
3. 确认 cron 相关表存在：`sys_cron_log`
4. 检查 `AUTO_RELEASE_DAYS` 环境变量（默认 30 天）

**解决**：确认容器运行中，查看 `sys_cron_log` 表是否记录了失败原因

## 5. JWT Token 频繁过期

**现象**：用户频繁被踢出

**排查**：
1. 确认 `JWT_EXPIRES_IN` 值：`echo $JWT_EXPIRES_IN`
2. 确认时区同步：`date`（服务器时间不应偏差过大）
3. 确认 `JWT_SECRET` 未在 `.env` 中修改（修改后所有旧 token 失效）

**解决**：调整 `JWT_EXPIRES_IN` 为更长时长（如 `14d`）

## 6. 慢查询导致页面卡顿

**现象**：客户列表/报表加载超过 5 秒

**排查**：
1. 检查慢查询日志：`backend/logs/app-*.log` 中搜索 "Slow query"
2. 调整阈值排查：`SLOW_QUERY_THRESHOLD_MS=500` 重启
3. MySQL 中检查慢查询：`SHOW FULL PROCESSLIST;`
4. 检查索引是否缺失：`EXPLAIN SELECT ...`（针对日志中的 SQL）

**解决**：添加缺失索引，调整 `SLOW_QUERY_THRESHOLD_MS`

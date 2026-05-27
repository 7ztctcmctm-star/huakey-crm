# 铧旗CRM系统 — 群晖 NAS 部署指南

## 第一步：群晖套件中心安装必要软件

打开群晖 DSM 桌面 → **套件中心**，搜索并安装以下套件：

### 必须安装

| 套件名称 | 用途 | 说明 |
|---------|------|------|
| **Node.js v22** | 运行后端服务 | 搜索 "Node.js"，选择版本 22 |
| **MariaDB 10** | 数据库 | 搜索 "MariaDB"，安装后要设置 root 密码 |
| **Web Station** | 前端网页服务 | 自带 Nginx，用来托管前端页面和反向代理 API |

### 可选安装

| 套件名称 | 用途 |
|---------|------|
| **phpMyAdmin** | 数据库可视化管理工具，方便执行 SQL |

---

## 第二步：上传项目文件到群晖

### 2.1 在群晖上创建项目目录

1. 打开 **File Station**（文件管理器）
2. 进入 `homes` 或创建一个共享文件夹（如 `docker`）
3. 新建文件夹，命名为 `huakey-crm`

### 2.2 上传部署包

1. 将 `huakey-crm-deploy.tar.gz` 上传到 `huakey-crm` 文件夹
2. 右键点击文件 → **解压缩**，解压到当前目录
3. 解压后你会看到 `backend/`、`frontend/`、`database/` 等文件夹

---

## 第三步：配置 MariaDB 数据库

### 3.1 创建数据库和用户

打开 **phpMyAdmin**（或通过 SSH 连接 MariaDB），执行以下 SQL：

```sql
-- 创建数据库
CREATE DATABASE huakey_crm
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 创建数据库用户（请替换 your_password 为你的密码）
CREATE USER 'crm_user'@'localhost' IDENTIFIED BY 'your_password';
CREATE USER 'crm_user'@'127.0.0.1' IDENTIFIED BY 'your_password';

-- 授权
GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'localhost';
GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 3.2 执行建表脚本

在 phpMyAdmin 中选中 `huakey_crm` 数据库，然后按顺序导入 SQL 文件（点击"导入" → 选择文件 → 执行）：

```
1. database/init.sql
2. database/customer.sql
3. database/follow_up.sql
4. database/opportunity.sql
5. database/quote.sql
6. database/business_tables.sql
7. database/migrations/002_refine_customer_source.sql
8. database/migrations/003_add_customer_pool_columns.sql
9. database/migrations/004_boss_rbac_and_reminder.sql
```

> 每执行完一个再执行下一个，顺序不能乱。

### 3.3 验证

导入完成后，在 phpMyAdmin 中查看 `huakey_crm` 数据库，应该看到以下表：

```
sys_dept, sys_role, sys_user, sys_log,
crm_customer, crm_contact, crm_follow_up,
crm_opportunity, crm_product, crm_quote, crm_quote_item,
crm_contract, crm_payment, crm_payment_plan,
crm_service_order, crm_pool_log, crm_assign_log,
crm_follow_up_reminder
```

确认 `sys_user` 表中有一个 admin 用户（默认密码 admin123）。

---

## 第四步：配置并启动后端

### 4.1 通过 SSH 连接群晖

1. 群晖 DSM → **控制面板** → **终端机和 SNMP** → 勾选"启用 SSH 服务" → 应用
2. 使用 SSH 工具（Windows 用 PowerShell `ssh` 命令，Mac 用终端）连接：

```bash
ssh 你的群晖用户名@群晖IP地址
# 例如: ssh admin@192.168.1.100
```

3. 输入你的群晖登录密码

### 4.2 进入项目目录并配置

```bash
# 进入项目目录（根据你实际存放位置调整）
cd /volume1/homes/你的用户名/huakey-crm
# 或者
cd /volume1/docker/huakey-crm

# 进入后端目录
cd backend

# 创建 .env 配置文件
cp .env.example .env

# 编辑 .env 文件
vi .env
```

### 4.3 修改 .env 配置

按 `i` 进入编辑模式，修改以下内容：

```ini
PORT=5000

# 数据库连接（填你第三步设置的密码）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=crm_user
DB_PASSWORD=your_password    # ← 改成你的数据库密码
DB_NAME=huakey_crm

# JWT 密钥（必须修改！用下面命令生成一个随机密钥）
JWT_SECRET=改成随机64位字符串
JWT_EXPIRES_IN=7d

# Redis（不用管，默认关闭）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=false

# 生产模式
NODE_ENV=production
```

按 `Esc` 键，输入 `:wq` 回车保存退出。

> **生成随机 JWT 密钥**：在 SSH 终端执行 `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`，把输出的字符串复制粘贴到 `JWT_SECRET`。

### 4.4 安装依赖并初始化

```bash
# 确保在 backend 目录下
cd /volume1/homes/你的用户名/huakey-crm/backend

# 安装生产依赖
npm ci --production

# 创建日志表（如果还没创建）
node create_sys_log_table.js

# 测试启动
node app.js
```

如果看到 `Server running on port 5000` 和 `数据库连接测试成功`，说明后端启动成功。

按 `Ctrl+C` 停止，接下来配置后台运行。

---

## 第五步：配置 Web Station 部署前端

### 5.1 创建虚拟主机

1. 打开群晖 **Web Station**
2. 点击 **网页服务门户** → **新增** → **创建服务门户**
3. 选择 **虚拟主机**
4. 填写：
   - **门户类型**：基于名称
   - **主机名**：`*`（或输入你的群晖 IP）
   - **端口**：`80`（或 `8080` 等）
   - **文档根目录**：浏览选择 `huakey-crm/frontend/dist` 文件夹
   - **HTTP 后端服务器**：选择 **Nginx**

5. 点击保存

### 5.2 配置 API 反向代理

1. 在 Web Station 中，点击 **脚本语言设置**
2. 选中刚创建的虚拟主机，点击 **编辑**
3. 切换到 **Nginx** 标签页
4. 在配置文本框中，找到 `server { }` 块，在 `location / { }` 前面添加：

```nginx
# API 反向代理
location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
}
```

5. 点击保存，Web Station 会自动重启 Nginx

### 5.3 验证前端

浏览器访问 `http://你的群晖IP`，应该看到 CRM 登录页面。

---

## 第六步：让后端开机自启动（使用任务计划）

### 6.1 创建启动脚本

在群晖 File Station 中，进入 `huakey-crm` 目录，右键 → 新建 → 新建文本文件，命名为 `start-backend.sh`，内容：

```bash
#!/bin/bash
cd /volume1/homes/你的用户名/huakey-crm/backend
/usr/local/bin/node app.js >> /volume1/homes/你的用户名/huakey-crm/backend/logs/app.log 2>&1
```

> 路径中的 `你的用户名` 换成你实际的群晖用户名。

### 6.2 创建日志目录

SSH 到群晖执行：

```bash
mkdir -p /volume1/homes/你的用户名/huakey-crm/backend/logs
chmod +x /volume1/homes/你的用户名/huakey-crm/start-backend.sh
```

### 6.3 添加开机任务

1. 群晖 DSM → **控制面板** → **任务计划**
2. 点击 **新增** → **触发的任务** → **开机**
3. 填写：
   - **任务名称**：启动铧旗CRM后端
   - **用户账号**：root
   - **运行命令**：`bash /volume1/homes/你的用户名/huakey-crm/start-backend.sh`

4. 点击确定

---

## 第七步：配置每日提醒任务

1. 群晖 DSM → **控制面板** → **任务计划**
2. 点击 **新增** → **触发的任务** → **定时**
3. 填写：
   - **任务名称**：CRM逾期提醒
   - **用户账号**：root
   - **时间**：每天 → 09:00
   - **运行命令**：
   ```
   cd /volume1/homes/你的用户名/huakey-crm/backend && /usr/local/bin/node scripts/generate_reminders.js
   ```

4. 点击确定

---

## 第八步：验证整体部署

### 8.1 检查后端

浏览器访问 `http://你的群晖IP:5000/api/health`

应该返回：
```json
{"code":200,"message":"服务运行正常","data":{"status":"ok","version":"crm_v1","timestamp":"..."}}
```

### 8.2 检查前端

浏览器访问 `http://你的群晖IP`，应该看到登录页面。

用 `admin` / `admin123` 登录。

### 8.3 测试功能

登录后逐一验证：
- 仪表盘数据正常加载
- 客户列表可搜索
- 新建/编辑客户正常
- 管理员可以看到"分配"按钮
- 团队看板页面正常

---

## 日常管理

### 查看后端日志

```bash
tail -f /volume1/homes/你的用户名/huakey-crm/backend/logs/app.log
```

### 重启后端

```bash
# 查找进程
ps aux | grep "node app.js"
# 杀掉进程
kill -9 进程ID
# 重新启动
bash /volume1/homes/你的用户名/huakey-crm/start-backend.sh
```

### 备份数据库

在群晖任务计划中添加每日备份任务：

```bash
mysqldump -u root -p你的root密码 huakey_crm > /volume1/homes/你的用户名/huakey-crm/backups/crm_$(date +%Y%m%d).sql
```

---

## 故障排查

| 问题 | 检查方法 |
|------|---------|
| 无法访问前端 | 检查 Web Station 虚拟主机是否启动，端口是否正确 |
| 登录后 API 报 500 | 检查后端是否在运行：`ps aux \| grep node` |
| 数据库连接失败 | 检查 MariaDB 是否启动，`.env` 中密码是否正确 |
| 表不存在 | 确认所有 SQL 文件已按顺序导入 |
| 端口冲突 | 检查 5000 端口是否被占用：`netstat -tlnp \| grep 5000` |
| Node.js 命令找不到 | 检查 Node.js 套件是否安装，`which node` 查看路径 |

## AI 助手配置（方案A：PC跑Ollama）

在 NAS 的 `backend/.env` 中添加：

```ini
OLLAMA_URL=http://你电脑的局域网IP:11434
```

确保你电脑的防火墙允许 11434 端口，且 Ollama 正在运行。


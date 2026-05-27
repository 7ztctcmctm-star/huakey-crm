# 铧旗CRM 群晖NAS部署 — 手把手教程

## 准备工作

在你的电脑上找到这个文件，记住它的位置：
```
c:\huakey-crm\huakey-crm-deploy.tar.gz
```

---

## 第一步：登录群晖 DSM

打开浏览器，输入你群晖的地址（局域网 IP），例如：
```
http://192.168.1.100:5000
```
输入管理员账号密码登录。

---

## 第二步：安装三个套件

点击群晖桌面左上角的 **套件中心** 图标（彩色方块），分别搜索并安装：

### 2.1 MariaDB 10

1. 搜索 `MariaDB`
2. 点击 **安装**
3. 安装时会提示你设置 root 密码 → 记下来！（例如 `MyNasDB@2024`）
4. 安装完成后，MariaDB 图标会出现在桌面

### 2.2 Node.js v22

1. 搜索 `Node.js`
2. 在版本下拉中选择 **Node.js 22**
3. 点击 **安装**

### 2.3 Web Station

1. 搜索 `Web Station`
2. 点击 **安装**

---

## 第三步：上传并解压部署包

### 3.1 打开 File Station

点击群晖桌面上的 **File Station** 图标（文件夹图标）。

### 3.2 上传文件

1. 在左侧目录树中选择一个位置，比如 `homes/你的用户名` 或新建的共享文件夹
2. 点击上方工具栏的 **上传** 按钮（向上箭头图标）
3. 选择 `huakey-crm-deploy.tar.gz`
4. 等待上传完成

### 3.3 解压

1. 在 File Station 中找到上传的 `huakey-crm-deploy.tar.gz`
2. 右键点击 → **解压缩** → 选择解压到当前目录
3. 解压完成后会看到一个 `huakey-crm` 文件夹

---

## 第四步：创建数据库

### 4.1 安装 phpMyAdmin（可选但推荐）

回到套件中心，搜索 `phpMyAdmin`，安装它。这是网页版数据库管理工具。

### 4.2 打开 phpMyAdmin

1. 点击桌面上的 phpMyAdmin 图标
2. 用户名：`root`
3. 密码：`你安装MariaDB时设置的密码`

### 4.3 创建数据库

1. 点击左侧 **新建**
2. 数据库名：`huakey_crm`
3. 字符集选择：`utf8mb4_unicode_ci`
4. 点击 **创建**

### 4.4 创建数据库用户

点击顶部 **SQL** 标签，粘贴以下 SQL，把 `your_password` 改成你自己的密码：

```sql
CREATE USER 'crm_user'@'localhost' IDENTIFIED BY 'your_password';
CREATE USER 'crm_user'@'127.0.0.1' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'localhost';
GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

点击 **执行**。

### 4.5 导入建表 SQL

1. 点击左侧选中 `huakey_crm` 数据库
2. 点击顶部 **导入** 标签
3. 点击 **选择文件**，依次导入以下文件（**每导完一个再导下一个，顺序不能错**）：

| 顺序 | 文件位置（在 File Station 中） |
|------|------|
| 1 | `huakey-crm/database/init.sql` |
| 2 | `huakey-crm/database/customer.sql` |
| 3 | `huakey-crm/database/follow_up.sql` |
| 4 | `huakey-crm/database/opportunity.sql` |
| 5 | `huakey-crm/database/quote.sql` |
| 6 | `huakey-crm/database/business_tables.sql` |
| 7 | `huakey-crm/database/migrations/002_refine_customer_source.sql` |
| 8 | `huakey-crm/database/migrations/003_add_customer_pool_columns.sql` |
| 9 | `huakey-crm/database/migrations/004_boss_rbac_and_reminder.sql` |
| 10 | `huakey-crm/database/migrations/005_add_lead_fields.sql` |

每次导入点击 **选择文件** → 找到文件 → **执行**。

### 4.6 验证

导入完成后，在 phpMyAdmin 左侧点击 `huakey_crm`，应该能看到 20 张左右的表。有 `sys_user` 和 `crm_customer` 就说明成功了。

---

## 第五步：配置后端

### 5.1 开启 SSH

1. 群晖桌面 → **控制面板** → **终端机和 SNMP**
2. 勾选 **启用 SSH 服务**
3. 端口保持默认 `22`
4. 点击 **应用**

### 5.2 用 SSH 连接群晖

**Windows 用户**：打开 PowerShell，输入：

```powershell
ssh 你的群晖用户名@群晖IP地址
```

例如：
```powershell
ssh admin@192.168.1.100
```

会提示输入密码 → 输入你群晖的登录密码（输入时不显示是正常的）。

**Mac 用户**：打开终端，一样用 `ssh` 命令。

### 5.3 进入项目目录

```bash
# 找到你解压的位置（根据你实际路径调整）
cd /volume1/homes/你的用户名/huakey-crm
```

> 提示：如果不确定完整路径，输入 `cd /volume1` 后按 Tab 键可以补全目录名。

### 5.4 配置环境变量

```bash
cd backend

# 复制模板文件为正式配置
cp .env.example .env

# 编辑 .env 文件
vi .env
```

进入 vi 编辑器后，按 `i` 键进入编辑模式。

需要修改的内容（用方向键移动光标）：

```ini
PORT=5000
NODE_ENV=production

# 数据库 → 填你在第四步设置的密码
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=crm_user
DB_PASSWORD=你设置的密码          # ← 改这里
DB_NAME=huakey_crm

# JWT 密钥 → 必须改！下面这行是例子，你要换成自己生成的
JWT_SECRET=改成随机64位字符串     # ← 改这里
JWT_EXPIRES_IN=7d

# Redis → 不用动
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=false
```

**生成随机 JWT 密钥**：另开一个 SSH 窗口，输入：

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

把输出的那一长串字符复制粘贴到 `JWT_SECRET` 的值。

编辑完成后按 `Esc` 键，然后输入 `:wq` 回车保存退出。

### 5.5 检查 node 命令

```bash
# 查看 node 是否在系统路径中
which node
```

如果显示 `/usr/local/bin/node` 或类似路径，说明正常。

如果显示找不到，Node.js 套件的实际路径可能是：
```bash
/var/packages/Node.js_v22/target/usr/local/bin/node
```

记下这个路径，后面会用到。

### 5.6 安装依赖并测试

```bash
# 确保在 backend 目录下
cd /volume1/homes/你的用户名/huakey-crm/backend

# 安装依赖（只需一次）
npm ci --production

# 创建日志表
node create_sys_log_table.js

# 测试启动
node server.js
```

如果看到：
```
Server running on port 5000
API地址: http://localhost:5000/api
数据库连接测试成功
```

说明后端启动成功！按 `Ctrl + C` 停止。

---

## 第六步：配置 Web Station

### 6.1 创建虚拟主机

1. 群晖桌面打开 **Web Station**
2. 点击 **网页服务门户** 标签
3. 点击 **新增** → **创建服务门户** → 选择 **虚拟主机**

4. 填写表单：
   - **门户类型**：`基于名称`
   - **主机名**：留空或填 `*`
   - **端口**：`80`
   - **文档根目录**：点击浏览 → 找到 `huakey-crm/frontend/dist` → 确定
   - **HTTP 后端服务器**：`Nginx`

5. 点击 **保存**

### 6.2 配置 API 反向代理

1. 在 Web Station 中，切换到 **脚本语言设置** 标签
2. 选中刚创建的虚拟主机，点击 **编辑**
3. 在 Nginx 配置中找到 `server { ... }` 代码块
4. 在 `location / { ... }` 这一段的**前面**，插入：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```

5. 点击 **保存**，Web Station 会自动重启 Nginx

---

## 第七步：配置后端开机自启动

### 7.1 创建启动脚本

SSH 到群晖，执行：

```bash
# 创建启动脚本
cat > /volume1/homes/你的用户名/huakey-crm/start-backend.sh << 'EOF'
#!/bin/bash
cd /volume1/homes/你的用户名/huakey-crm/backend
mkdir -p logs
node server.js >> logs/app.log 2>&1
EOF

# 授权执行
chmod +x /volume1/homes/你的用户名/huakey-crm/start-backend.sh
```

> 路径中的 `你的用户名` 全部替换成你实际的群晖用户名。

### 7.2 添加开机任务

1. 群晖桌面 → **控制面板** → **任务计划**
2. 点击 **新增** → **触发的任务** → **开机**
3. 填写：
   - **任务名称**：启动铧旗CRM
   - **用户账号**：`root`
   - **事件**：`开机`
   - **运行命令**：
     ```
     bash /volume1/homes/你的用户名/huakey-crm/start-backend.sh
     ```
4. 点击 **确定**

### 7.3 手动启动一次

回到 SSH：

```bash
bash /volume1/homes/你的用户名/huakey-crm/start-backend.sh
```

---

## 第八步：配置每日提醒

1. 群晖桌面 → **控制面板** → **任务计划**
2. 点击 **新增** → **触发的任务** → **定时**
3. 填写：
   - **任务名称**：CRM逾期提醒
   - **用户账号**：`root`
   - **运行时间**：每天，09:00
   - **运行命令**：
     ```
     cd /volume1/homes/你的用户名/huakey-crm/backend && /usr/local/bin/node scripts/generate_reminders.js
     ```
4. 点击 **确定**

---

## 第九步：验证部署

### 9.1 检查 API

浏览器访问：
```
http://你的群晖IP:5000/api/health
```

应该返回：
```json
{"code":200,"message":"服务运行正常","data":{"status":"ok","version":"crm_v1"}}
```

### 9.2 检查前端

浏览器访问：
```
http://你的群晖IP
```

应该看到 CRM 登录页面。

**登录信息：**
- 用户名：`admin`
- 密码：`admin123`

### 9.3 测试功能

登录后验证：
- 仪表盘正常显示
- 客户列表能看到 429 条数据
- 能新建/编辑/删除客户
- 产品管理页面正常
- 公海能看到 25 条数据

---

## 故障排查

| 问题 | 解决办法 |
|------|---------|
| 无法访问前端 | 检查 Web Station 虚拟主机状态是否为绿色 |
| API 500 错误 | SSH 查看日志：`tail -f /volume1/homes/你的用户名/huakey-crm/backend/logs/app.log` |
| 数据库连接失败 | 确认 MariaDB 正在运行，`.env` 中密码正确 |
| 表不存在错误 | 确认 9 个 SQL 文件按顺序全部导入了 |
| 前端页面空白 | 确认 `frontend/dist/` 目录里有 `index.html` |
| 登录失败 | 确认 admin 用户存在：phpMyAdmin → huakey_crm → sys_user 表 |

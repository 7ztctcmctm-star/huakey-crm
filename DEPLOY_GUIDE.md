# 把 CRM 部署到公网 —— 小白版指南

> 全程不需要懂代码，跟着点鼠标就行。大约 30 分钟搞定。

---

## 先解释你要做什么

你的 CRM 现在只能在你自己的电脑上打开。要让它像百度、淘宝一样在任意设备上通过网址访问，需要三样东西：

| 需要什么 | 用什么服务 | 一句话解释 |
|----------|-----------|-----------|
| 一个**数据库**（存数据的地方） | **Supabase** | 把你 CRM 的客户、合同等数据存到云端 |
| 一个**服务器**（运行程序的地方） | **Vercel** | 把你的网页和后台程序放到公网上跑 |
| 一个**代码仓库**（存代码的地方） | **GitHub** | 让 Vercel 能读取你的代码 |

**流程是这样的：**
```
你的电脑代码 → 上传到 GitHub → Vercel 自动读取 → 部署到公网
                                          ↓
                               Supabase 提供数据库
```

---

## 第一步：注册账号（5分钟）

你需要注册两个网站。都支持**直接用 GitHub 账号登录**，所以建议先注册 GitHub。

### 1.1 注册 GitHub

1. 打开 [github.com](https://github.com)
2. 点右上角 **Sign up**
3. 填邮箱、密码、用户名
4. 收验证邮件，点链接确认
5. 注册完成

> **记下来：** 你的 GitHub 用户名和密码

### 1.2 注册 Vercel

1. 打开 [vercel.com](https://vercel.com)
2. 点右上角 **Sign up**
3. 选择 **「Continue with GitHub」**
4. 授权登录

### 1.3 注册 Supabase

1. 打开 [supabase.com](https://supabase.com)
2. 点 **「Start your project」**
3. 选择 **「Continue with GitHub」**
4. 授权登录

> 三个账号全用 GitHub 登录，管理方便。

---

## 第二步：把代码上传到 GitHub（5分钟）

### 2.1 下载 GitHub Desktop

你的电脑可能没有安装 Git。用 GitHub Desktop 最简单：

1. 打开 [desktop.github.com](https://desktop.github.com)
2. 点 **Download**，安装
3. 打开 GitHub Desktop，用 GitHub 账号登录

### 2.2 创建仓库并上传

1. 在 GitHub Desktop 中，点 **File → Add Local Repository**
2. 选择你的 CRM 项目文件夹 `C:\huakey-crm`
3. 会提示 "This directory does not appear to be a Git repository"，点 **create a repository**
4. Name 填 `huakey-crm`，点 **Create Repository**
5. 点右上角 **Publish repository**
6. **取消勾选** "Keep this code private"（选公开仓库，免费）
7. 点 **Publish Repository**

> 代码已经上传到 `https://github.com/你的用户名/huakey-crm`

---

## 第三步：创建 Supabase 数据库（10分钟）

### 3.1 新建项目

1. 打开 [supabase.com/dashboard](https://supabase.com/dashboard)
2. 点橙色的 **「New project」** 按钮
3. 填写表单：
   - **Name**：填 `huakey-crm`
   - **Database Password**：**设一个密码，一定要记下来！**（比如 `WoDeCRM2026!`）
   - **Region**：选 `Asia Pacific` 下面的（新加坡或悉尼都行，离中国近）
4. 点绿色的 **「Create project」**
5. 等 2-3 分钟，看到 "Project is ready" 就行

### 3.2 记下三个重要信息

项目创建完后，你需要记下三个东西。**建议新建一个记事本记下来：**

#### ① 数据库连接地址

1. 在 Supabase 项目页面，点左边菜单 **Settings**（齿轮图标）
2. 点 **Database**
3. 往下滚动到 **Connection string** 区域
4. 点 **URI** 标签
5. 复制那一长串地址，大概长这样：

```
postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

6. **把 `[YOUR-PASSWORD]` 替换成你刚才设置的数据库密码**

> 例如：`postgresql://postgres.abc123:WoDeCRM2026!@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`

📝 **记下来，标为「DATABASE_URL」**

#### ② Supabase 网址

1. 点左边菜单 **Settings → API**
2. 找到 **Project URL**，复制它

```
https://xxxxxx.supabase.co
```

📝 **记下来，标为「SUPABASE_URL」**

#### ③ Supabase 密钥

1. 还在 **Settings → API** 页面
2. 往下找到 **Project API Keys**
3. 找到 `service_role` 那一行，点 **Copy**
4. 这是一长串以 `eyJ` 开头的字符

📝 **记下来，标为「SUPABASE_SERVICE_KEY」**

### 3.3 创建文件存储空间

1. 在 Supabase 左边菜单，点 **Storage**
2. 点 **「New bucket」**
3. 名称填：`attachments`
4. ✅ **勾选 「Public bucket」**
5. 点 **「Create bucket」**

### 3.4 导入数据库表结构

你的 CRM 有 48 张表需要创建。AI 已经把建表语句准备好了。

1. 打开你电脑上的文件夹 `C:\huakey-crm\supabase\migrations`
2. 里面有 35 个 `.sql` 文件，从 `000_baseline.sql` 到 `034_...sql`

**最简单的方式——用 Supabase SQL Editor：**

1. 在 Supabase 左边菜单，点 **SQL Editor**
2. 点 **「New query」**
3. 在电脑上打开文件 `C:\huakey-crm\supabase\migrations\000_baseline.sql`，**全选→复制**
4. 粘贴到 Supabase 的 SQL Editor 里
5. 点右下角绿色的 **Run** 按钮
6. 等它执行完

7. 重复上述步骤，依次把 001 到 034 的文件都执行一遍

> 💡 提示：如果嫌一个一个来太慢，你可以把所有文件内容拼在一起一次性执行。但建议一个一个来，出错了容易排查。

### 3.5 导入种子数据

1. 打开 `C:\huakey-crm\supabase\seed.sql`
2. 全选复制
3. 在 Supabase SQL Editor 新建一个查询，粘贴进去
4. 点 **Run**

### 3.6 验证数据库

1. 在 Supabase 左边菜单，点 **Table Editor**
2. 你应该能看到一长串表名
3. 点 `sys_user` 表，应该能看到一条 admin 用户的数据
4. 点 `sys_permission` 表，应该能看到几十条权限数据

> ✅ 数据库配置完成！

---

## 第四步：部署到 Vercel（10分钟）

### 4.1 导入项目到 Vercel

1. 打开 [vercel.com](https://vercel.com)
2. 点右上角 **「New Project」**
3. 在列表中找到你的仓库 `huakey-crm`，点 **Import**
4. 接下来是配置页面，**不用改任何东西**，Vercel 会自动读取你项目里的 `vercel.json` 配置文件
5. 找到 **Environment Variables** 区域，把第三步记下的内容填进去：

**一个一个添加（点 Add 按钮）：**

| Name（变量名） | Value（值） |
|---------------|------------|
| `DATABASE_URL` | 你记下的数据库连接地址 |
| `SUPABASE_URL` | 你记下的 Supabase 网址 |
| `SUPABASE_SERVICE_KEY` | 你记下的 Supabase 密钥 |
| `JWT_SECRET` | 随便打一串乱码字符，越长越好（如 `abc123xyz789!@#`） |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `AUTO_RELEASE_DAYS` | `30` |

6. 点 **Deploy** 按钮
7. 等待 2-3 分钟，看到 "Congratulations!" 就成功了

### 4.2 找到你的网址

部署完成后，Vercel 会显示一个网址：

```
https://huakey-crm-xxxx.vercel.app
```

🎉 **这就是你的 CRM 公网地址！用手机、平板、任何电脑都能打开！**

### 4.3 登录试试

1. 打开你的网址
2. 用户名：`admin`
3. 密码：`admin123`
4. 检测能否正常看到客户列表、合同等

---

## 第五步：以后怎么更新

你改了代码后，只需要在 GitHub Desktop 里：

1. 左下角填个描述（比如"修复了XX问题"）
2. 点 **Commit to main**
3. 点右上角 **Push origin**

**Vercel 会自动检测到代码更新，自动重新部署。** 你什么都不用做，等 2 分钟就行了。

---

## 常见问题

### Q：打开网址是空白页？
打开浏览器按 F12，看 Console 有没有红字报错。通常是环境变量没配对。

### Q：登录提示"网络错误"？
环境变量 `DATABASE_URL` 配错了。回到 Vercel → Settings → Environment Variables 检查。

### Q：客户列表加载不出来？
Supabase 数据库表没建全。回第三步检查 SQL 是否全部执行。

### Q：想用自己的域名（如 crm.我的公司.com）？
在 Vercel 项目页 → Settings → Domains 添加你的域名，然后去域名服务商那里改 DNS 就行了。

### Q：要钱吗？
完全免费。Supabase 免费档 500MB 数据库空间，Vercel 免费档 100GB 月流量。对中小 CRM 绰绰有余。

---

## 需要帮助？

如果卡在某一步，可以把以下信息发给 AI 帮你排查：
- 截图你卡住的页面
- 浏览器 F12 控制台的红字报错
- Vercel 部署日志（Vercel 项目页 → Deployments → 点最新的 → 看日志）

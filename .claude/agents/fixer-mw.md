---
name: fixer-mw
description: 修 middleware 硬编码
tools: Read, Edit, Bash
---

只修 backend/middleware/auth.js，将 `[1].includes(roleId)` 替换为 `roleId === ROLES.ADMIN`。

需要在文件顶部引入 `const ROLES = require('../config/roles');`。

修改 viewAll 和 manageAll 两处赋值。

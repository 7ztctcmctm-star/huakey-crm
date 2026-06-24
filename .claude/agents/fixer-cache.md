---
name: fixer-cache
description: 权限修改后主动失效缓存
tools: Read, Edit, Bash
---

扫描 role.js、permission.js、user.js 的更新/删除端点，成功后调用 clearPermissionCache。

- role.js：update 和 delete 端点成功后调用 clearPermissionCache + clearAllPermissionCache
- user.js：update 端点中 role_id 变化时调用 clearPermissionCache(id)
- permission.js：已有 clearAllPermissionCache 调用，无需修改

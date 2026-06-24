---
name: fixer-perm
description: 权限码统一
tools: Read, Edit, Bash
---

competitor.js 15个端点权限码细分：

- GET 端点（list, detail, encounters, intel, analysis）→ checkPermission('competitor:view')
- POST /add → checkPermission('competitor:add')
- PUT/DELETE 端点 → checkPermission('competitor:edit') 或 checkPermission('competitor:delete')

映射：
| 端点 | 权限码 |
|------|--------|
| GET /list | competitor:view |
| GET /:id | competitor:view |
| POST /add | competitor:add |
| PUT /:id | competitor:edit |
| DELETE /:id | competitor:delete |
| GET /:id/encounters | competitor:view |
| POST /encounters/add | competitor:edit |
| PUT /encounters/:id | competitor:edit |
| DELETE /encounters/:id | competitor:delete |
| GET /:id/intel | competitor:view |
| POST /intel/add | competitor:edit |
| PUT /intel/:id | competitor:edit |
| DELETE /intel/:id | competitor:delete |
| GET /analysis/overview | competitor:view |
| GET /analysis/compare | competitor:view |

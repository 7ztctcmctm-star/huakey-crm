# Huakey CRM - Bug Database

---

# BUG-001

## 问题

登录后跳转回登录页。

## 根因

Token刷新逻辑错误。

## 修改文件

- auth.js
- request.js

## 修复时间

2026-05-27

## 是否回归测试

是

---

# BUG-002

## 问题

客户列表分页异常。

## 根因

分页参数类型错误。

## 修改文件

- customerController.js

## 修复时间

2026-05-27

## 是否回归测试

是

---

# BUG-004

## 问题

客户列表"快速跟进"和"批量跟进"调用接口返回404。

## 根因

前端调用 `/followUp/add` 和 `/followUp/batch-add`（驼峰），但后端注册路由为 `/follow-up`（连字符），URL不匹配导致404。

## 修改文件

- frontend/src/views/customer/List.vue — `/followUp/` → `/follow-up/`
- frontend/src/views/Dashboard.vue — `/followUp/` → `/follow-up/`

## 修复时间

2026-05-28

## 是否回归测试

待测试

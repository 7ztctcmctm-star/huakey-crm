with open(r"C:\huakey-crm\AUDIT_CHECKLIST.md", "r", encoding="utf-8") as f:
    content = f.read()

r3 = content.index("## 3.1 ")
r41 = content.index("## 4.1 ")

result_r3 = """## 3.1 分层一致性

### 3.1.1 Route -> Service 映射

- [x] 审计完成
- 结果: 3 处 route 中有 pool.query（auth.js refresh 路由），属于特殊路由，其他 48 个 route 文件均通过 service 层操作
- 判定: 分层清晰

### 3.1.2 控制器层

- [x] 审计完成
- 结果: controllers/ 目录仅少量文件（opportunity, quote, customer），大部分 route 直接用 service；两层架构为主
- 判定: 混合模式（三层用于复杂模块，两层用于简单模块），可接受

---

## 3.2 错误处理

### 3.2.1 全局错误中间件

- [x] 审计完成
- 结果: errorHandler.js 双层设计（appErrorHandler + globalErrorHandler），Joi/AppError/未知异常分别处理
- 判定: 设计完善

### 3.2.2 Service 层错误传播

- [x] 审计完成
- 结果: Service 使用 Object.assign(new Error(...), { code }) 模式抛出结构化错误
- 判定: 模式一致

---

## 3.3 事务完整性

### 3.3.1 事务使用

- [x] 审计完成
- 结果: 43 处 getConnection() 调用，全部在 finally 中有 release()；approvalService, purchaseService, contractCrudService 等核心写入使用 beginTransaction/commit/rollback
- 判定: 无连接泄漏，事务使用规范

---

## 3.4 代码重复

### 3.4.1 CRUD 模式

- [x] 审计完成
- 结果: 多数 service 有重复的 SELECT COUNT + SELECT * LIMIT 分页模式；无公共分页 util
- 判定: P3 — 存在显著的 CRUD 模板代码重复，建议抽取公共函数

### 3.4.2 参数校验

- [x] 审计完成
- 结果: 每个 route 独立定义 Joi schema，部分 listSchema 有重复的 page/pageSize/ keyword 定义
- 判定: P3 — 可抽取公共 listSchema 基类

---

## 3.5 N+1 查询

### 3.5.1 循环查询扫描

- [x] 审计完成
- 结果: 46 处 for 循环附近有 pool.query，其中 cron scheduler 的 auto-release 循环内逐条 UPDATE + INSERT（scheduler.js 行 115-130）是典型 N+1
- 判定: P2 — scheduler.js 公海回收批处理应使用批量 UPDATE

### 3.5.2 关联数据预加载

- [x] 审计完成（抽样）
- 结果: customerDetailService 使用并行查询模式
- 判定: 模式良好

---

## 3.6 缓存策略

### 3.6.1 Redis 使用

- [x] 审计完成
- 结果: 仅 3 处 getCache/setCache/invalidateCache 调用（product list 路由使用 cache(120) 中间件）
- 判定: P2 — Redis 缓存几乎未使用（依赖 REDIS_ENABLED=false 默认关闭），高频列表查询无缓存加速

---

## 3.7 AI 集成

### 3.7.1 AI 调用超时

- [x] 审计完成
- 结果: aiRouteService.js 未发现 AbortController 或 timeout 参数
- 判定: P2 — AI 请求缺少超时机制，长时间 Ollama 响应可能阻塞

---

## 3.8 报表性能

### 3.8.1 聚合查询

- [x] 审计完成（抽样）
- 结果: reportAnalyticsService 使用 COALESCE(SUM(...)) 聚合查询
- 判定: 聚合查询模式安全，但需 MySQL 索引配合

### 3.8.2 自定义报表安全

- [x] 审计完成
- 结果: customReportService 使用 fields.join(', ') 构建动态 SQL，字段名来自 config 而非用户直接输入
- 判定: 安全
"""

# Write result
content = content[:r3] + result_r3 + "\n\n" + content[r41:]

with open(r"C:\huakey-crm\AUDIT_CHECKLIST.md", "w", encoding="utf-8", newline="") as f:
    f.write(content)
print("R3 done")

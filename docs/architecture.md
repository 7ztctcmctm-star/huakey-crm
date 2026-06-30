# 铧旗 CRM 系统架构

## 架构总览（单体架构）

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Nginx      │────▶│  Express App │
│  (Vue 3 SPA) │     │  (反向代理)   │     │  (Node.js)   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                   │
                           ┌───────────────────────┼───────────────────────┐
                           │                       │                       │
                    ┌──────▼──────┐         ┌──────▼──────┐        ┌──────▼──────┐
                    │   MySQL 8.0 │         │  Redis 7    │        │  WeChat     │
                    │  (主数据库)   │         │  (可选缓存)  │        │  Webhook    │
                    └─────────────┘         └─────────────┘        └─────────────┘
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Element Plus + ECharts + Pinia |
| 后端 | Node.js + Express 4 + mysql2 + Joi |
| 数据库 | MySQL 8.0 (utf8mb4) |
| 缓存 | Redis 7 (ioredis，可选) |
| 认证 | JWT (jsonwebtoken + bcryptjs) |
| 定时任务 | node-cron |
| 文件存储 | Supabase Storage / 本地磁盘 |
| 部署 | Docker + Container Manager (NAS) |
| AI | Ollama (qwen2.5:3b，Text-to-SQL) |

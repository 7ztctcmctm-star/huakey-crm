---
name: run-dev
description: |
  Launch the huakey CRM app locally in development mode. Starts both the
  Express backend (port 5000) and Vite frontend dev server (port 5173).
  Requires Node.js, MySQL 8.0 (local), and npm dependencies installed.
---

# Run huakey CRM (Dev Mode)

## Prerequisites

- Node.js 18+
- MySQL 8.0 running locally
- `.env` file at repo root with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `SKIP_CAPTCHA=true` in `.env` for local dev (captcha skipped only in non-production)
- Backend dependencies: `cd backend && npm install`
- Frontend dependencies: `cd frontend && npm install`

## Launch

Start both servers in parallel:

```bash
# Terminal 1 — Backend (port 5000)
cd backend
npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend
npx vite --host
```

Wait for the backend to log `数据库连接测试成功` and the frontend to show `Local: http://localhost:5173/`.

## Verify

```bash
# Backend health check
curl http://localhost:5000/api/v1/health

# Frontend
curl -s http://localhost:5173/ | head -5
```

## Apply Migrations (if needed)

```bash
cd backend
node -e "
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'huakey_crm',
    multipleStatements: true
  });
  const dir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql') && !f.includes('_down'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await pool.query(sql);
      console.log('OK: ' + file);
    } catch (e) {
      console.log('SKIP (may already be applied): ' + file);
    }
  }
  await pool.end();
})();
"
```

## Kill Stale Processes

If port 5000 is already in use (common after a crash):

```bash
# Find and kill the stale process
netstat -ano | grep ":5000 "
taskkill //PID <pid> //F
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EADDRINUSE :::5000` | Kill stale node process holding port 5000 |
| `Access denied for user 'root'` | Check `.env` has correct `DB_USER`/`DB_PASSWORD` |
| Backend crashes after "数据库连接测试成功" | Check migration status — run the migration script above |
| Frontend 500 on `/api/v1/customer/:id/360` | Customer ID may not exist; try a valid ID (e.g., 11+) |

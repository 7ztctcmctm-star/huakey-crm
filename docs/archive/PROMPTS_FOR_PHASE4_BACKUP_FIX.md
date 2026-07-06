<!--
  测试修复 — backup.test.js
  生成日期: 2026-06-30
  前提: 已阅读 backend/TEST_FAILURES.md、PROMPTS_FOR_PHASE3_TESTFIX.md
         Phase3 任务 A (auth编码) 和 B (migration DB连接) 已完成
  当前: 64/65 suites, 490/491 tests 通过。仅剩 backup.test.js 1 个失败
-->

# Phase 4 — backup.test.js 修复 Prompt

> 单任务，预计 10 分钟

---

## 任务: 修复 backup.test.js — restore 端点返回 500

### 背景
- 文件: `backend/tests/backup.test.js`
- 测试用例: `数据备份模块 POST /api/backup/restore 应该返回200当正常恢复备份`（第 121 行附近）
- 症状: Expected 200, Received 500

### 根因分析

调用链：

```
test POST /api/backup/restore
  authenticateToken (pool.query x 2: blacklist + role)    mock 已配置 OK
  checkPermission('backup:restore')                        permissionService 已 mock OK
  requireAdmin                                             admin.js fallback 已修复 OK
  handler
    backupService.restoreBackup(pool, id, confirm_code)    未 mock! 走真实实现 BUG
      pool.query('SELECT FROM sys_backup_record ...')       mock 已配置 OK
      fs.existsSync(backup.file_path)                       fs 已 mock 返回 true OK
      dbPass = process.env.DB_PASSWORD                      已配置 'test_db_pass' OK
      fs.readFileSync(file_path, 'utf8')                    fs 已 mock 返回 'SELECT 1;' OK
      execFile('mysql', [...], {...}, callback).stdin.end() 未 mock! BUG
                                                              本地无 mysql 命令 ENOENT
                                                              .stdin 可能为 null TypeError
                                                              restoreBackup 抛异常
  catch(error) res.status(500)                             最终返回 500
```

`backupRouteService.js` 第 117 行调用 `execFile('mysql', ...)` — Node.js `child_process` 的真实系统调用。测试环境没有 `mysql` CLI 工具，spawn 失败，`.stdin` 可能是 null，调用 `.end()` 抛 TypeError。

测试文件 mock 了 `fs`、`permissionService`、`database`、`logger`，**遗漏了 `child_process`**。

### 修复要求

**方案（推荐，5 行）**: 在 `backup.test.js` 中添加 `child_process` mock

在 `jest.mock('fs', ...)` 块之后（约第 31 行附近），插入：

```js
jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, callback) => {
    if (callback) callback(null, '', '');
    return { stdin: { end: jest.fn() } };
  })
}));
```

这个 mock 让 `execFile`：
- 调用 callback(null, '', '') 表示成功
- 返回带 `{ stdin: { end } }` 的对象，避免 `.stdin.end()` 抛 TypeError

### 验收标准
- 运行 `npx jest tests/backup.test.js --forceExit --no-coverage`，7 个测试全部通过
- 全量测试 65/65 suites, 491/491 tests 通过

---

## 执行后

```bash
cd C:\huakey-crm\backend
npx jest --forceExit --no-coverage
```

预期全绿，然后 `git add -A && git commit -m "fix: backup.test.js 补充 child_process mock — 全量 65/65 通过"`。

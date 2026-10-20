# 迁移链基线与治理（B4 · 2026-10-20 建立）

> 本文是 `database/migrations/` 与两份基线文件的结构总览与治理约定。
> 对应守卫：`backend/tests/db/migrationGuard.test.js`（静态三层一致 + 迁移↔记账双向一致）。
> 生成器：`scripts/regen-baseline.js`（头部有完整用法）。

## 一、为什么需要 000 基线

`001_init_baseline.sql` 只创建 `schema_migrations`，其注释写明「初始建表脚本在本迁移之前已执行」。
即**迁移链本身不自足**：空库直接跑 `run_migrations.js` 会在 `002` 崩溃
（实测 `Table 'crm_customer' doesn't exist`，exit 1）。历史上靠 `deploy/init-complete.sql`
兜底，但它是「旧基线 + 迁移 + 手工补丁」的并集，长期未与生产对齐，实测已漂移 26 处
（缺 `sys_cron_log` / `sys_client_perf` / 归档事件，多出幽灵表 `sys_operation_log`，
外键引用动作与生产相反等）。

## 二、三层结构

```
空库 ──000──▶ 初始结构 ──001..123──▶ 生产权威终态
        （下界）        （迁移链）        （= init-complete.sql 上界）
```

| 层 | 文件 | 性质 |
|---|---|---|
| 下界 | `database/migrations/000_real_baseline.sql` | **生成物，禁止手工编辑**；幂等建表（只 `CREATE TABLE IF NOT EXISTS`，绝无 DROP/TRUNCATE——它会跑在存有生产数据的库上） |
| 迁移链 | `database/migrations/001..123_*.sql` + `_down.sql` 成对 | 三位数递增；已提交禁改，只允许新增 |
| 上界 | `deploy/init-complete.sql` | **生成物**，全新环境自举（含视图/事件），必须等价于「000 + 迁移链终态」 |

**权威源 = 生产库实测结构**，快照落在 `database/baseline/prod-schema-snapshot.sql`。
两份基线都由 `scripts/regen-baseline.js` 从快照库反向生成，不再手工拼接并集。

## 三、刷新流程（结构变更后）

1. `bash scripts/dump-prod-schema.sh` —— ssh 免密到 nas-crm 导生产结构快照；
2. 快照导入临时库（库名含 `test`，避免误伤）；
3. `DB_PASSWORD=*** DB_NAME=<临时库> MYSQLDUMP=<mysqldump 路径> node scripts/regen-baseline.js`；
4. 跑 `backend/tests/db/migrationGuard.test.js` 验证三层一致；
5. 提交（生成物连同快照一起入库，保证可追溯）。

## 四、守卫分层

- **静态层（默认 jest 就跑）**：`migrationGuard.test.js` 校验 000 / 生产快照 / init-complete.sql
  三者表集合一致（白名单差异见测试内 `KNOWN_BASELINE_EXCEPTIONS`，每条必须写明原因），
  外加迁移↔`schema_migrations` 记账双向一致。
- **DB 往返层（只能显式单独跑）**：
  `npx jest tests/db/migration-roundtrip.test.js --testPathIgnorePatterns="/node_modules/" --testTimeout=600000`
  （需 `DB_USER`/`DB_PASSWORD`；该套件会深回滚+重放，已移出共享池，CI migration-test job 执行）。

## 五、编号治理

- 新迁移从当前最大编号之后递增，**严禁填补历史空缺**（会与已部署环境的 `schema_migrations` 冲突）。
- 已考证跳号：**064 / 065 / 115**（历史合并/直推生产导致版本号被占用，均无害），
  依据记在 `database/migrations/README.md`；新增跳号会被守卫的连续性检查拦下，须先补考证。
- down 脚本一律 `information_schema` + `PREPARE/EXECUTE` 条件化 DDL（MySQL 8.0 不支持
  `DROP ... IF EXISTS`）；条件化失败借临时存储过程发 `SIGNAL`（`MESSAGE_TEXT` ≤128 字符）。

## 六、已知未收口项

- `crm_contract` 双外键冗余（`fk_contract_opp` 与 `fk_contract_opportunity` 同在
  `opportunity_id` 上）及一批冗余索引尚未去重——需新建迁移并在备份/从库预检后执行
  （B4 计划子项，2026-10-20 时未完成）。

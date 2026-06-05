检查以下 SQL 是否符合 MySQL 8.0 语法：
- 禁止 $1 占位符，用 ?
- 禁止 EXTRACT(DAY FROM ...)，用 DATEDIFF()
- 禁止 NOW() - INTERVAL '30 days'，用 NOW() - INTERVAL 30 DAY
- pool.query() 而非 pool.execute()

SQL: $ARGUMENTS

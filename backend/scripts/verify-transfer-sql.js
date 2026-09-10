/**
 * verify-transfer-sql.js —— 客户转移相关 SQL 的「真库核验」工具
 *
 * 【为什么需要它】
 *   backend/tests/transferService.test.js 用的是 mock pool，只验证分支逻辑，
 *   抓不到「列名写错 / 约束冲突 / 类型不兼容」这类**只在真库暴露**的问题。
 *   本脚本把 transferService 与通知中心里的 SQL 逐条拿到真实 MySQL 执行一遍，
 *   全程包在事务里、最后 ROLLBACK，因此**不会修改测试库数据**。
 *
 * 【用法】
 *   cd backend && node scripts/verify-transfer-sql.js
 *   凭据读自仓库根目录 .env.test（DB_HOST / DB_PORT / DB_USER / DB_PASSWORD）
 *   目标库：huakey_crm_test（若不存在含 crm_customer_transfer 的库则自动跳过）
 *
 * 【退出码】0 = 全部通过；1 = 有 SQL 失败；2 = 脚本自身异常
 *
 * ⚠️ 副作用：InnoDB 不回收 AUTO_INCREMENT，反复执行会让相关表的自增 ID 前移。
 *    仅影响测试库的自增值，不影响数据正确性。
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env.test'), quiet: true });
const mysql = require('mysql2/promise');

const results = [];
const record = (name, fn) => fn().then(
  msg => results.push(['PASS', name, msg]),
  e => results.push(['FAIL', name, `${e.code || ''} ${e.message}`])
);

/** 被测的原始 SQL —— 与 backend/services/reminderService.js 保持一致 */
const TODO_SQL = {
  'reminderService.getMyReminders.transferPending': `SELECT t.id, t.customer_id, t.reason, t.expire_at, t.create_time,
            c.company_name,
            u.real_name AS from_user_name
       FROM crm_customer_transfer t
       LEFT JOIN crm_customer c ON c.id = t.customer_id
       LEFT JOIN sys_user u ON u.id = t.from_user_id
      WHERE t.to_user_id = ? AND t.status = 'pending'
        AND t.deleted_at IS NULL AND t.expire_at > NOW()
      ORDER BY t.create_time DESC
      LIMIT 20`,
  'reminderService.getReminderCenter.transferPending': `SELECT t.id, t.customer_id, t.reason, t.create_time, t.expire_at,
            CONCAT('客户转移-', COALESCE(c.company_name, CONCAT('客户#', t.customer_id)),
                   '（来自', COALESCE(u.real_name, '未知'), '）') as title,
            CONCAT('/customer/detail/', t.customer_id) as link
     FROM crm_customer_transfer t
     LEFT JOIN crm_customer c ON c.id = t.customer_id
     LEFT JOIN sys_user u ON u.id = t.from_user_id
     WHERE t.to_user_id = ? AND t.status = 'pending'
       AND t.deleted_at IS NULL AND t.expire_at > NOW()
     ORDER BY t.create_time DESC LIMIT 5`
};

async function findTargetDb(conn) {
  const [dbs] = await conn.query('SHOW DATABASES');
  const names = dbs.map(d => Object.values(d)[0]);
  console.log('可见数据库:', names.join(', '));
  for (const db of names) {
    if (!/huakey|crm/i.test(db)) continue;
    try {
      const [t] = await conn.query(
        `SELECT COUNT(*) c FROM information_schema.tables
          WHERE table_schema = ? AND table_name = 'crm_customer_transfer'`, [db]
      );
      if (t[0].c > 0) return db;
    } catch { /* 无权限的库忽略 */ }
  }
  return null;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });

  const target = await findTargetDb(conn);
  if (!target) {
    console.log('\n未找到含 crm_customer_transfer 的库 —— 迁移 112 尚未应用，跳过核验');
    await conn.end();
    return;
  }
  console.log(`目标库：${target}\n`);
  await conn.query(`USE \`${target}\``);

  // ---------- 第一部分：通知中心「客户转移待办」查询 ----------
  console.log('【一】通知中心待办查询（新增）');
  for (const [name, sql] of Object.entries(TODO_SQL)) {
    await record(name, async () => {
      const [rows] = await conn.query(sql, [1]);
      if (rows.length === 0) {
        // 空结果也要证明列结构可用
        await conn.query(`SELECT * FROM (${sql.replace(/LIMIT \d+$/, 'LIMIT 0')}) AS t`, [1]);
      }
      return `可执行，命中 ${rows.length} 行`;
    });
  }

  // ---------- 第二部分：转移服务全链路 SQL ----------
  const [[customer]] = await conn.query(
    'SELECT id, company_name, owner_id FROM crm_customer WHERE owner_id IS NOT NULL AND deleted_at IS NULL LIMIT 1'
  );
  const [others] = await conn.query(
    'SELECT id, real_name FROM sys_user WHERE deleted_at IS NULL AND status = 1 AND id <> ? ORDER BY id LIMIT 1',
    [customer ? customer.owner_id : 0]
  );
  if (!customer || !others.length) {
    console.log('\n测试库样本不足（需 1 个有主客户 + 1 个其他用户），跳过转移服务核验');
    await printSummary(conn);
    return;
  }
  const fromUserId = customer.owner_id;
  const toUserId = others[0].id;
  console.log(`\n【二】转移服务 SQL（样本：客户 #${customer.id}「${customer.company_name}」，用户 #${fromUserId} → #${toUserId}）`);

  await conn.beginTransaction();
  let transferId = null;

  await record('createTransfer · 客户行锁读', async () => {
    const [r] = await conn.query(
      'SELECT id, company_name, owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [customer.id]
    );
    if (!r.length) throw Object.assign(new Error('客户不存在'), { code: 'EMPTY' });
    return `FOR UPDATE 生效，读回「${r[0].company_name}」`;
  });

  await record('createTransfer · 接收人校验', async () => {
    const [r] = await conn.query(
      'SELECT id, real_name FROM sys_user WHERE id = ? AND deleted_at IS NULL AND status = 1',
      [toUserId]
    );
    if (!r.length) throw Object.assign(new Error('接收人不可用'), { code: 'EMPTY' });
    return `接收人「${r[0].real_name}」`;
  });

  await record('createTransfer · 查重待处理申请', async () => {
    await conn.query(
      `SELECT id FROM crm_customer_transfer
        WHERE customer_id = ? AND status = ? AND deleted_at IS NULL FOR UPDATE`,
      [customer.id, 'pending']
    );
    return 'OK';
  });

  await record('createTransfer · 插入申请', async () => {
    const [r] = await conn.query(
      `INSERT INTO crm_customer_transfer
         (customer_id, from_user_id, to_user_id, status, reason, expire_at, create_time)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
      [customer.id, fromUserId, toUserId, 'pending', '核验用', 3]
    );
    transferId = r.insertId;
    return `insertId=${r.insertId}`;
  });

  await record('acceptTransfer · 读申请行锁', async () => {
    const [r] = await conn.query(
      `SELECT id, customer_id, from_user_id, to_user_id, status, expire_at
         FROM crm_customer_transfer WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [transferId]
    );
    if (!r.length) throw Object.assign(new Error('申请不存在'), { code: 'EMPTY' });
    return `状态=${r[0].status}`;
  });

  await record('acceptTransfer · 归属变更【负例】条件不符应拒绝', async () => {
    // 用不存在的原负责人 ID，验证守卫条件真的拦得住（防并发/越权覆盖）
    const [r] = await conn.query(
      `UPDATE crm_customer
          SET owner_id = ?, pool_status = 'private', last_follow_time = NOW(), update_time = NOW()
        WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
      [toUserId, customer.id, fromUserId + 999999]
    );
    if (r.affectedRows !== 0) throw Object.assign(new Error(`不该更新却更新了 ${r.affectedRows} 行`), { code: 'LEAK' });
    return 'affectedRows=0（守卫正确拒绝）';
  });

  await record('acceptTransfer · 归属原子变更', async () => {
    const [r] = await conn.query(
      `UPDATE crm_customer
          SET owner_id = ?, pool_status = 'private', last_follow_time = NOW(), update_time = NOW()
        WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
      [toUserId, customer.id, fromUserId]
    );
    if (r.affectedRows !== 1) throw Object.assign(new Error(`affectedRows=${r.affectedRows}`), { code: 'MISMATCH' });
    return 'affectedRows=1（守卫条件命中）';
  });

  await record('acceptTransfer · 状态流转（守卫 pending）', async () => {
    const [r] = await conn.query(
      `UPDATE crm_customer_transfer SET status = ?, handle_time = NOW() WHERE id = ? AND status = ?`,
      ['accepted', transferId, 'pending']
    );
    if (r.affectedRows !== 1) throw Object.assign(new Error(`affectedRows=${r.affectedRows}`), { code: 'MISMATCH' });
    // 再跑一次，验证「已处理」的申请不会被二次处理
    const [again] = await conn.query(
      `UPDATE crm_customer_transfer SET status = ?, handle_time = NOW() WHERE id = ? AND status = ?`,
      ['accepted', transferId, 'pending']
    );
    if (again.affectedRows !== 0) throw Object.assign(new Error('重复处理未被拦截'), { code: 'LEAK' });
    return 'affectedRows=1，重复处理 affectedRows=0';
  });

  await record('acceptTransfer · pool_log 写入', async () => {
    const [r] = await conn.query(
      `INSERT INTO crm_pool_log (customer_id, action, from_user_id, to_user_id) VALUES (?, 'transfer', ?, ?)`,
      [customer.id, fromUserId, toUserId]
    );
    return `insertId=${r.insertId}`;
  });

  await record('rejectTransfer · 备注写入', async () => {
    const [r] = await conn.query(
      `UPDATE crm_customer_transfer SET status = ?, handle_remark = ?, handle_time = NOW()
        WHERE id = ? AND status = ?`,
      ['rejected', '核验用备注', transferId, 'accepted']
    );
    if (r.affectedRows !== 1) throw Object.assign(new Error(`affectedRows=${r.affectedRows}`), { code: 'MISMATCH' });
    return 'affectedRows=1';
  });

  await record('expireTransfers · 超时回流（真跑一次，含过期样本）', async () => {
    // 造一条「已过期但仍 pending」的申请 —— 模拟定时任务扫描前一刻的真实状态
    const [ins] = await conn.query(
      `INSERT INTO crm_customer_transfer
         (customer_id, from_user_id, to_user_id, status, reason, expire_at, create_time)
       VALUES (?, ?, ?, 'pending', '超时核验', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY))`,
      [customer.id, fromUserId, toUserId]
    );
    const [r] = await conn.query(
      `UPDATE crm_customer_transfer SET status = ?, handle_time = NOW()
        WHERE status = ? AND expire_at <= NOW() AND deleted_at IS NULL`,
      ['expired', 'pending']
    );
    if (r.affectedRows < 1) throw Object.assign(new Error('未扫到已过期申请'), { code: 'EMPTY' });
    const [[row]] = await conn.query('SELECT status FROM crm_customer_transfer WHERE id = ?', [ins.insertId]);
    if (row.status !== 'expired') throw Object.assign(new Error(`状态未流转：${row.status}`), { code: 'MISMATCH' });
    // 客户归属不应被回流影响
    const [[cus]] = await conn.query('SELECT owner_id FROM crm_customer WHERE id = ?', [customer.id]);
    if (cus.owner_id !== toUserId) throw Object.assign(new Error(`归属被误改：${cus.owner_id}`), { code: 'LEAK' });
    return `扫到 ${r.affectedRows} 条并置为 expired，客户归属未被影响`;
  });

  await record('listMyPending · 待办查询', async () => {
    const [r] = await conn.query(
      `SELECT t.id, t.customer_id, t.status, t.reason, t.expire_at, t.create_time,
              c.company_name, u.real_name AS from_user_name
         FROM crm_customer_transfer t
         LEFT JOIN crm_customer c ON c.id = t.customer_id
         LEFT JOIN sys_user u ON u.id = t.from_user_id
        WHERE t.to_user_id = ? AND t.status = ? AND t.deleted_at IS NULL
        ORDER BY t.create_time DESC LIMIT ? OFFSET ?`,
      [toUserId, 'pending', 20, 0]
    );
    return `返回 ${r.length} 行`;
  });

  await record('listTransferCandidates · 候选人', async () => {
    const [r] = await conn.query(
      `SELECT id, real_name, username FROM sys_user
        WHERE deleted_at IS NULL AND status = 1 AND id <> ? ORDER BY real_name ASC, id ASC LIMIT 50`,
      [fromUserId]
    );
    return `返回 ${r.length} 人`;
  });

  await record('listByCustomer · 转移历史', async () => {
    const [r] = await conn.query(
      `SELECT t.id, t.status, t.reason, t.handle_remark, t.expire_at, t.handle_time, t.create_time,
              uf.real_name AS from_user_name, ut.real_name AS to_user_name
         FROM crm_customer_transfer t
         LEFT JOIN sys_user uf ON uf.id = t.from_user_id
         LEFT JOIN sys_user ut ON ut.id = t.to_user_id
        WHERE t.customer_id = ? AND t.deleted_at IS NULL
        ORDER BY t.create_time DESC`,
      [customer.id]
    );
    return `返回 ${r.length} 行`;
  });

  await record('通知写入 · crm_notification 表契约', async () => {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'crm_notification'`
    );
    const typeCol = cols.find(c => c.COLUMN_NAME === 'type');
    if (!typeCol) throw Object.assign(new Error('缺 type 列'), { code: 'SCHEMA' });
    // type 必须是变长字符串，否则 'customer_transfer' 会被 ENUM 截断/拒绝
    if (!/^varchar/i.test(typeCol.COLUMN_TYPE)) {
      throw Object.assign(new Error(`type 列为 ${typeCol.COLUMN_TYPE}，写入 customer_transfer 可能失败`), { code: 'SCHEMA' });
    }
    const names = cols.map(c => c.COLUMN_NAME);
    const missing = ['to_user_id', 'title', 'content', 'is_read', 'is_dismissed'].filter(n => !names.includes(n));
    if (missing.length) throw Object.assign(new Error(`缺列：${missing.join(',')}`), { code: 'SCHEMA' });
    return `type=${typeCol.COLUMN_TYPE}，createNotification 所需列齐全`;
  });

  await conn.rollback();
  console.log('已 ROLLBACK —— 测试库数据未被修改\n');
  await printSummary(conn);
})().catch(e => { console.error('核验脚本异常:', e.message); process.exit(2); });

async function printSummary(conn) {
  const width = Math.max(...results.map(r => r[1].length));
  results.forEach(([st, name, msg]) => console.log(`  ${st}  ${name.padEnd(width)}  ${msg}`));
  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(`\n=== ${results.length - failed.length}/${results.length} 通过 ===`);
  await conn.end();
  process.exit(failed.length ? 1 : 0);
}

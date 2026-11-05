/**
 * [S3 收口 · B-03] 跟进记录可见性 = 客户归属权威
 *
 * 背景（2026-11-05 复现）：回收（owner_id=NULL）后，原销售的跟进独立列表仍能查到
 * 该客户的历史跟进——permission.js followup self 分支旧子句 `f.create_by = ?`
 * 与客户归属完全无关（routes/followUp.js:117 → followUpService.listFollowUps）。
 *
 * 修复后口径（permission.js self·followup + followUpService getTaskStats/getCalendar）：
 *   · 名下客户的全部历史跟进可见（含他人创建 → 新负责人可见历史，不整段隐藏）；
 *   · 自己创建且客户已不存在（软删/无客户）的记录仍可见（防呆兜底）；
 *   · 已回收（owner_id IS NULL）或已归他人的客户跟进对原销售不可见；
 *   · boss/超管（type=all）不受影响。
 */
const pool = require('../../config/database');
const { buildDataPermissionWhere } = require('../../middleware/permission');
const followUpService = require('../../services/followUpService');

describe('B-03 跟进可见性：回收/转派后原销售不可见（db）', () => {
  let dbOK = false;
  const tag = `s3fup_${Date.now()}`;
  const ids = { users: [], customers: [], followUps: [] };

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbOK = true;
    } catch {
      dbOK = false; // 测试库不可达：跳过（与 poolStateConsistency 同约定）
      return;
    }

    const mkUser = async (name) => {
      const [r] = await pool.query(
        `INSERT INTO sys_user (username, password, real_name, role_id, status, dept_id, create_time)
         VALUES (?, 'x', ?, 3, 1, 1, NOW())`, [name, name]
      );
      ids.users.push(r.insertId);
      return r.insertId;
    };
    const mkCustomer = async (ownerId, companyName) => {
      const [r] = await pool.query(
        `INSERT INTO crm_customer (company_name, status, business_status, pool_status, owner_id, create_time)
         VALUES (?, 'following', 'following', 'private', ?, NOW())`, [companyName, ownerId]
      );
      ids.customers.push(r.insertId);
      return r.insertId;
    };

    ids.salesA = await mkUser(`${tag}_a`); // 原销售
    ids.salesB = await mkUser(`${tag}_b`); // 新负责人

    // C1：归 A 的客户 + A 的历史跟进（next_time=今天，喂给 getTaskStats/getCalendar）
    ids.c1 = await mkCustomer(ids.salesA, `${tag}_C1`);
    const [f1] = await pool.query(
      `INSERT INTO crm_follow_up (customer_id, content, create_by, next_time)
       VALUES (?, '${tag}_F1', ?, NOW())`, [ids.c1, ids.salesA]
    );
    ids.followUps.push(f1.insertId);

    // C2：A 的客户（随后软删）+ A 的跟进 → 防呆兜底用例（客户不存在时创建人仍可见）
    ids.c2 = await mkCustomer(ids.salesA, `${tag}_C2`);
    const [f2] = await pool.query(
      `INSERT INTO crm_follow_up (customer_id, content, create_by, next_time)
       VALUES (?, '${tag}_F2', ?, NOW())`, [ids.c2, ids.salesA]
    );
    ids.followUps.push(f2.insertId);
    await pool.query(`UPDATE crm_customer SET deleted_at = NOW() WHERE id = ?`, [ids.c2]);
  });

  afterAll(async () => {
    // 共享连接池（config/database）不在这里关闭，与其他 db 测试同约定
    try {
      await pool.query(`DELETE FROM crm_follow_up WHERE id IN (?)`, [ids.followUps]);
      await pool.query(`DELETE FROM crm_customer WHERE id IN (?)`, [ids.customers]);
      await pool.query(`DELETE FROM sys_user WHERE id IN (?)`, [ids.users]);
    } catch { /* 清理失败不阻塞测试结果 */ }
  });

  // 跟进独立列表的等价查询：listFollowUps 的权限片段构造 + /list 同款 WHERE
  const listVisibleFollowUps = async (dataPermission, customerId) => {
    const perm = await buildDataPermissionWhere(dataPermission, 'f');
    const [rows] = await pool.query(
      `SELECT f.id, f.content FROM crm_follow_up f
       WHERE f.deleted_at IS NULL AND f.customer_id = ? AND ${perm.clause}`,
      [customerId, ...perm.params]
    );
    return rows;
  };
  const selfFup = (userId) => ({ type: 'self', userId, ownerColumn: 'create_by', module: 'followup' });

  test('① 回收（owner_id=NULL）后：原销售查不到该客户的跟进', async () => {
    if (!dbOK) return;
    await pool.query(
      `UPDATE crm_customer SET owner_id = NULL, status = 'sea', pool_status = 'sea' WHERE id = ?`,
      [ids.c1]
    );
    const rows = await listVisibleFollowUps(selfFup(ids.salesA), ids.c1);
    expect(rows.length).toBe(0);
  });

  test('② 回收后：boss（type=all）仍可见', async () => {
    if (!dbOK) return;
    const rows = await listVisibleFollowUps({ type: 'all', ownerColumn: 'create_by', module: 'followup' }, ids.c1);
    expect(rows.length).toBe(1);
    expect(rows[0].content).toBe(`${tag}_F1`);
  });

  test('③ 重新分配给新负责人后：新销售可见全部历史跟进，原销售不可见', async () => {
    if (!dbOK) return;
    await pool.query(
      `UPDATE crm_customer SET owner_id = ?, status = 'following', pool_status = 'private' WHERE id = ?`,
      [ids.salesB, ids.c1]
    );
    // 新负责人：历史跟进可见（F1 由原销售创建，归属权威不整段隐藏）
    const forNew = await listVisibleFollowUps(selfFup(ids.salesB), ids.c1);
    expect(forNew.length).toBe(1);
    expect(forNew[0].content).toBe(`${tag}_F1`);
    // 原销售：客户已归他人 → 不可见
    const forOld = await listVisibleFollowUps(selfFup(ids.salesA), ids.c1);
    expect(forOld.length).toBe(0);
  });

  test('④ 防呆兜底：客户已软删时，创建人仍可见自己的跟进', async () => {
    if (!dbOK) return;
    const rows = await listVisibleFollowUps(selfFup(ids.salesA), ids.c2);
    expect(rows.length).toBe(1);
    expect(rows[0].content).toBe(`${tag}_F2`);
  });

  test('⑤ getTaskStats：回收后原销售统计不计该客户跟进，新负责人计入', async () => {
    if (!dbOK) return;
    // 回收 C1
    await pool.query(
      `UPDATE crm_customer SET owner_id = NULL, status = 'sea', pool_status = 'sea' WHERE id = ?`,
      [ids.c1]
    );
    const statsOld = await followUpService.getTaskStats(pool, { type: 'self', userId: ids.salesA, manage_all: false });
    expect(Number(statsOld.today_count)).toBe(0);

    // 重新分配给 B
    await pool.query(
      `UPDATE crm_customer SET owner_id = ?, status = 'following', pool_status = 'private' WHERE id = ?`,
      [ids.salesB, ids.c1]
    );
    const statsNew = await followUpService.getTaskStats(pool, { type: 'self', userId: ids.salesB, manage_all: false });
    expect(Number(statsNew.today_count)).toBe(1);
  });

  test('⑥ getCalendar：回收后原销售日历无该跟进，新负责人可见', async () => {
    if (!dbOK) return;
    // 回收 C1
    await pool.query(
      `UPDATE crm_customer SET owner_id = NULL, status = 'sea', pool_status = 'sea' WHERE id = ?`,
      [ids.c1]
    );
    const now = new Date();
    const calOld = await followUpService.getCalendar(
      pool, { year: now.getFullYear(), month: now.getMonth() + 1 },
      { type: 'self', userId: ids.salesA, manage_all: false }
    );
    expect(calOld.list.filter(r => r.content === `${tag}_F1`).length).toBe(0);

    // 重新分配给 B
    await pool.query(
      `UPDATE crm_customer SET owner_id = ?, status = 'following', pool_status = 'private' WHERE id = ?`,
      [ids.salesB, ids.c1]
    );
    const calNew = await followUpService.getCalendar(
      pool, { year: now.getFullYear(), month: now.getMonth() + 1 },
      { type: 'self', userId: ids.salesB, manage_all: false }
    );
    expect(calNew.list.filter(r => r.content === `${tag}_F1`).length).toBe(1);
  });
});

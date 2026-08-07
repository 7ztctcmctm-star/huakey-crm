// 检查 huakey_crm_test 的 demo 用户与种子数据状态
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({ host:'127.0.0.1', port:3306, user:'root', password:'huakey123', database:'huakey_crm_test', multipleStatements:true });
  try {
    const [u] = await pool.query("SELECT username, role_id, must_change_password FROM sys_user WHERE username IN ('demo_admin','demo_sales','demo_purchase','admin')");
    console.log('[demo users]:', u.length === 0 ? 'NONE' : u);
    const [roles] = await pool.query("SELECT id, role_code, role_name, manage_all FROM sys_role ORDER BY id");
    console.log('[roles]:', roles.length, 'rows');
    roles.forEach(r => console.log('   ', r.id, r.role_code, r.role_name, 'manage_all='+r.manage_all));
    const [c] = await pool.query("SELECT COUNT(*) AS cnt FROM crm_customer WHERE deleted_at IS NULL");
    console.log('[customers]:', c[0].cnt);
    const [perm] = await pool.query("SELECT COUNT(*) AS cnt FROM sys_permission");
    console.log('[permissions]:', perm[0].cnt);
  } catch (e) { console.error('[ERROR]', e.message); process.exitCode=1; }
  finally { await pool.end(); }
})();

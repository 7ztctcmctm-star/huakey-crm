/**
 * 生产环境初始管理员账号创建脚本
 *
 * 用法（在 deploy.sh 中通过 docker exec 调用）：
 *   docker exec -e ADMIN_INITIAL_PASSWORD="<强密码>" huakey-app node scripts/create-admin.js
 *
 * 安全检查：
 *   - 必须传入 ADMIN_INITIAL_PASSWORD 环境变量
 *   - 密码通过 bcryptjs 哈希后存储，不记录明文
 *   - must_change_password=1 确保首次登录强制改密
 *   - WHERE NOT EXISTS 确保幂等（重复执行安全）
 */

const bcrypt = require('bcryptjs');
const pool = require('../config/database');

async function run() {
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  if (!password || password.length < 8) {
    console.error('FATAL: ADMIN_INITIAL_PASSWORD 未设置或长度不足（需要至少8位）');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  // 确保 super_admin 角色存在
  await pool.execute(
    `INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['超级管理员', 'super_admin', '系统超级管理员，仅用于平台级运维', 1, 1, 1]
  );

  // 创建初始管理员（幂等：已存在则跳过）
  const [result] = await pool.execute(
    `INSERT INTO sys_user (username, password, real_name, role_id, status, must_change_password)
     SELECT ?, ?, ?, (SELECT id FROM sys_role WHERE code = ? LIMIT 1), ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM sys_user WHERE username = ?)`,
    ['admin', hash, '系统管理员', 'super_admin', 1, 1, 'admin']
  );

  if (result.affectedRows > 0) {
    console.log('OK: 初始管理员账号 admin 已创建（must_change_password=1）');
  } else {
    console.log('OK: 管理员账号 admin 已存在，跳过创建');
  }

  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('FATAL: 管理员账号创建失败:', err.message);
  process.exit(1);
});

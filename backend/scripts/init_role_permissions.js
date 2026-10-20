/**
 * 全角色权限初始化脚本
 * 为 boss / manager / sales / hr / purchase / finance / engineer 补齐
 * 菜单权限、按钮权限和数据权限。
 *
 * 设计原则：
 * - 仅插入缺失的权限数据，幂等执行
 * - 菜单权限控制前端 Sidebar / 路由守卫
 * - 按钮权限控制页面操作按钮
 * - 数据权限控制列表/详情可见范围
 * - 使用统一的 config/database.js 连接池，符合项目 MySQL 用法约定
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('../config/database');

if (!process.env.DB_PASSWORD) {
  console.error('FATAL: 请在 .env 中设置 DB_PASSWORD 后再执行权限初始化脚本');
  process.exit(1);
}

// 权限码与角色矩阵：唯一真源在 ./permission-definitions.js，
// 脚本与测试共用同一份，避免两处定义各自漂移（步骤 C1 抽取）。
const {
  MENU_PERMISSIONS,
  BUTTON_PERMISSIONS,
  ROLE_PERMISSIONS,
  DATA_PERMISSIONS
} = require('./permission-definitions');


async function main() {
  // ---- CLI 参数解析（2026-09-21 新增：默认只增不删，--force-clean 才 DELETE）----
  const args = {
    forceClean: process.argv.includes('--force-clean') || process.argv.includes('--clean'),
    diffCheck: !process.argv.includes('--no-diff')
  };
  if (!args.forceClean) {
    console.log('[模式] 默认安全模式：仅 INSERT 缺失的权限/关联，不删除白名单外的数据。');
    console.log('       如需强制清理白名单外的权限关联，请加 --force-clean 参数。');
  } else {
    console.log('[模式] 强制清理模式：将删除不在 ROLE_PERMISSIONS / DATA_PERMISSIONS 白名单中的关联。');
  }
  console.log('');

  // 1. 补齐菜单权限
  for (const p of MENU_PERMISSIONS) {
    await pool.query(
      `INSERT IGNORE INTO sys_permission (name, code, type, parent_id, path, icon, sort)
       VALUES (?, ?, 'menu', 0, ?, ?, ?)`,
      [p.name, p.code, p.path || null, p.icon || null, p.sort || 0]
    );
  }

  // 2. 补齐按钮权限并绑定父级
  for (const p of BUTTON_PERMISSIONS) {
    const [[parent]] = await pool.query('SELECT id FROM sys_permission WHERE code = ?', [p.parent]);
    const parentId = parent ? parent.id : 0;
    await pool.query(
      `INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort)
       VALUES (?, ?, 'button', ?, 0)`,
      [p.name, p.code, parentId]
    );
  }

  // 2b. 规范化历史类型：098 迁移曾以 type='api' 写入以下操作码，
  //     统一为 button（操作按钮权限）；权限校验按 code 匹配，类型不影响功能
  await pool.query(
    `UPDATE sys_permission SET type = 'button'
     WHERE code IN ('pool:view', 'pool:claim', 'customer:release', 'leads:view', 'leads:convert')`
  );

  // 3. 获取角色映射
  const [roles] = await pool.query('SELECT id, code FROM sys_role');
  const roleMap = Object.fromEntries(roles.map(r => [r.code, r.id]));

  // 4. 为每个角色分配权限
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) {
      console.warn(`角色 ${roleCode} 不存在，跳过`);
      continue;
    }
    for (const code of codes) {
      await pool.query(
        `INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
         SELECT ?, id FROM sys_permission WHERE code = ?`,
        [roleId, code]
      );
    }
  }

  // 5. 数据权限
  for (const [roleCode, modules] of Object.entries(DATA_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;
    for (const [module, scope] of Object.entries(modules)) {
      await pool.query(
        `INSERT IGNORE INTO sys_data_permission (role_id, module, data_scope)
         VALUES (?, ?, ?)`,
        [roleId, module, scope]
      );
    }
  }

  // 6. diff 检查：发现白名单外的角色权限（2026-09-21 新增）
  if (args.diffCheck) {
    console.log('');
    console.log('=== Diff 检查（白名单 vs 数据库实际 ===）');
    for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleMap[roleCode];
      if (!roleId) continue;
      const [extra] = await pool.query(
        `SELECT p.code FROM sys_role_permission rp
         JOIN sys_permission p ON rp.permission_id = p.id
         WHERE rp.role_id = ? AND p.code NOT IN (${codes.map(() => '?').join(',')})
         ORDER BY p.code`,
        [roleId, ...codes]
      );
      if (extra.length > 0) {
        console.warn(`  ⚠️  [${roleCode}] 有 ${extra.length} 个权限码不在 ROLE_PERMISSIONS 白名单：`);
        console.warn(`     ${extra.map(e => e.code).join(', ')}`);
      } else {
        console.log(`  ✅ [${roleCode}] 白名单与数据库一致`);
      }
    }
  }

  // 7. 清理不在配置中的历史残留权限（仅 --force-clean 时执行）
  //    安全默认：只增不删，防止 UI 端新增但白名单未登记的权限被部署脚本误删
  if (args.forceClean) {
    console.log('');
    console.log('=== 执行 force-clean（清理白名单外的关联）===' );
    for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleMap[roleCode];
      if (!roleId) continue;
      if (codes.length === 0) {
        await pool.query('DELETE FROM sys_role_permission WHERE role_id = ?', [roleId]);
        continue;
      }
      const placeholders = codes.map(() => '?').join(',');
      await pool.query(
        `DELETE rp FROM sys_role_permission rp
         WHERE rp.role_id = ?
           AND rp.permission_id NOT IN (
             SELECT id FROM sys_permission WHERE code IN (${placeholders})
           )`,
        [roleId, ...codes]
      );
    }

    // 清理不在配置中的历史残留数据权限
    for (const [roleCode, modules] of Object.entries(DATA_PERMISSIONS)) {
      const roleId = roleMap[roleCode];
      if (!roleId) continue;
      const moduleCodes = Object.keys(modules);
      if (moduleCodes.length === 0) {
        await pool.query('DELETE FROM sys_data_permission WHERE role_id = ?', [roleId]);
        continue;
      }
      const placeholders = moduleCodes.map(() => '?').join(',');
      await pool.query(
        `DELETE FROM sys_data_permission
         WHERE role_id = ?
           AND module NOT IN (${placeholders})`,
        [roleId, ...moduleCodes]
      );
    }
    console.log('  ✅ force-clean 完成');
  } else {
    console.log('');
    console.log('  💡 提示：如需强制清理白名单外的关联，请加 --force-clean 参数。');
  }

  // 8. 对账输出
  const [rows] = await pool.query(
    `SELECT r.code AS role_code, r.name AS role_name,
            COUNT(DISTINCT rp.permission_id) AS perm_count,
            (SELECT COUNT(*) FROM sys_data_permission dp WHERE dp.role_id = r.id) AS data_count
     FROM sys_role r
     LEFT JOIN sys_role_permission rp ON rp.role_id = r.id
     GROUP BY r.id, r.code, r.name
     ORDER BY r.id`
  );
  console.log('=== 角色权限对账 ===');
  console.table(rows);

  // 每个角色的权限码清单
  for (const row of rows) {
    const roleId = roleMap[row.role_code];
    const [codes] = await pool.query(
      `SELECT p.code, p.type FROM sys_role_permission rp
       JOIN sys_permission p ON rp.permission_id = p.id
       WHERE rp.role_id = ? ORDER BY p.type, p.code`,
      [roleId]
    );
    console.log(`\n[${row.role_code}] 权限列表 (${codes.length}):`);
    console.log(codes.map(c => `${c.type}:${c.code}`).join(', '));
  }

  await pool.end();

  // 显式退出：config/database → utils/alert 中的 5 分钟 setInterval 会挂住事件循环，
  // 不退出会导致 docker exec 等调用方永远等待
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

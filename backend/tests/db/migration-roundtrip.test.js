/**
 * 迁移回合测试：验证 up + down 脚本的往返正确性。
 *
 * 环境要求：CI MySQL（docker-compose.ci.yml, DB_PORT=3306）
 *
 * 运行：DB_PORT=3306 DB_NAME=huakey_crm_test npx jest tests/db/migration-roundtrip.test.js --forceExit --testTimeout=60000
 */

const { execSync } = require('child_process');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const net = require('net');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

// 严格模式：**仅由 migration-test job 显式开启**（MIGRATION_ROUNDTRIP_STRICT=1）。
// ⚠️ 不能用 process.env.CI 判定 —— GitHub Actions 在**所有** job 都设 CI=true，
//    而 backend-test 也会跑到本文件（jest.config 只排除了 tests/e2e//security//performance/，
//    **未排除 tests/db/**）且那里没有 MySQL ⇒ 会把 backend-test 直接弄红。
// 开严格模式的语义：DB 就绪即不许静默跳过，任何「没真跑」都必须让 job 红。
const STRICT = process.env.MIGRATION_ROUNDTRIP_STRICT === '1';

// 5 张核心业务表 — 往返后结构必须一致
const KEY_TABLES = ['crm_customer', 'crm_opportunity', 'crm_quote', 'crm_contract', 'sys_user'];

// 有 up+down 配对的迁移版本号（000_template 只有 down 模板，无 up，故不参与）
const TEST_VERSIONS = ['002', '008', '061'];
// Phase 9R: 新增 down 脚本的版本号全部纳入 roundtrip 验证
const NEW_DOWN_VERSIONS = [
  '004', '005', '006', '010', '011', '012', '014', '015', '016', '017', '018', '019', '020',
  '024', '025', '026', '027', '028', '029', '031', '032', '033', '034', '035', '036', '037',
  '038', '039', '041', '042', '043', '044', '045', '046', '047', '048', '049', '050', '051',
  '052', '053', '054', '055', '056', '057', '058', '059', '060', '062'
];
const ROUNDTRIP_VERSIONS = [...TEST_VERSIONS, ...NEW_DOWN_VERSIONS, '066', '067', '068'];

let pool;

/**
 * 检查 DB 端口是否可达
 */
function checkDbReachable() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(DB_PORT, DB_HOST);
  });
}

/**
 * 调用 run_migrations.js 执行迁移或回滚
 */
function runMigration(args = '') {
  const cmd = `node "${path.join(MIGRATIONS_DIR, 'run_migrations.js')}" ${args}`;
  execSync(cmd, {
    env: {
      ...process.env,
      DB_HOST,
      DB_PORT: String(DB_PORT),
      DB_USER,
      DB_PASSWORD,
      DB_NAME
    },
    stdio: 'pipe'
  });
}

beforeAll(async () => {
  const reachable = await checkDbReachable();
  if (!reachable) {
    if (STRICT) {
      throw new Error(`[migration-roundtrip] 数据库不可达（端口 ${DB_PORT}）：严格模式不允许静默跳过`);
    }
    console.warn(`[migration-roundtrip] MySQL 不可达 (端口 ${DB_PORT})，跳过迁移往返测试（本机便利跳过）`);
    return; // 本机便利跳过：后续 test 检测到 pool 为 undefined 后自行跳过
  }

  // 确保测试库存在
  const adminPool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });
  try {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await adminPool.query(`USE \`${DB_NAME}\``);
  } catch (err) {
    await adminPool.end();
    if (STRICT) {
      // 严格模式下认证失败 ⇒ 工作流 env 有误（如口令只写在单个 step 的行内变量里），必须显式失败
      throw new Error(`[migration-roundtrip] DB 认证失败（严格模式，环境配置有误，不允许静默跳过）: ${err.message}`);
    }
    // 端口可达但认证失败（如本地无密码 root），本机优雅跳过
    console.warn(`[migration-roundtrip] DB 认证失败: ${err.message}，跳过迁移往返测试（本机便利跳过）`);
    return;
  }

  await adminPool.end();

  // 进入"迁移链重放态"：深回滚到最老测试版本后全量重放。
  // 背景：init-complete 基线快照与迁移链终态存在历史漂移（列注释/字符集等），
  // 以基线态为对比基准必然失败；roundtrip 的本意是验证 down→up 的往返保真，
  // 故 before/after 统一取迁移链重放态。
  // ⚠️ 注意：这一步**不是空操作** —— 实测它会对每个有 down 脚本的版本执行一次回滚再重放
  //    （CI 上约 7-8 分钟）。早期注释写"runMigration 为空操作"是错的，正是这个误判
  //    让"迁移链早已断裂"长期无人发现（见 docs/ci-failure-analysis-2026-09-20.md §10.7）。
  //
  // ⚠️⚠️ 2026-10-15 修复「毁库 landmine」（2026-10-14 审计实测三次复现）：
  // 旧写法把 rollback 与 replay 放进**同一个 try** —— rollback 一旦抛错（如 097_down 崩），
  // replay 永远不会执行，而 121~003 的 down 脚本已经跑完（删 crm_contract_item /
  // crm_approval_rule 两张表、清空 manager 全部权限、删 7 条记账），库被毁；
  // 非严格模式仅 warn+return ⇒ 55 个往返用例「被跳过」而套件报告 PASS。
  // 新写法：**无论回滚成败都执行正向重放** —— 失败时重放即修复（up 脚本均为
  // information_schema 守卫 + IF NOT EXISTS + INSERT IGNORE，可重建 down 脚本的删除）；
  // 重放仍不正常才按严格/非严格分别处置。
  let rollbackError = null;
  try {
    // --force：防御性开关 —— 若未来再出现无 down 的迁移，深回滚建立重放态时显式接受跳过而非硬失败
    // （2026-10-15：119 已补 down，当前无缺口）
    runMigration('--rollback 002 --force');
  } catch (err) {
    rollbackError = err;
  }
  try {
    runMigration();
  } catch (replayErr) {
    if (STRICT) {
      throw new Error(
        `[migration-roundtrip] 迁移链执行失败（严格模式，属真实缺陷，不再静默跳过）: `
        + `回滚=${rollbackError ? rollbackError.message : '成功'}；重放修复=${replayErr.message}`
      );
    }
    console.warn(`[migration-roundtrip] 迁移链执行失败: 回滚=${rollbackError ? rollbackError.message : '成功'}，`
      + `重放修复也失败=${replayErr.message}，跳过迁移往返测试（非严格模式）`);
    return;
  }
  if (rollbackError) {
    // 回滚失败但已被正向重放修复 ⇒ DB 结构完整，55 个往返用例仍可执行、仍有价值。
    // 但严格模式必须红：回滚链断裂本身就是要抓的真实缺陷，不能因"事后修好了"就放过。
    if (STRICT) {
      throw new Error(
        `[migration-roundtrip] 回滚链断裂（严格模式，属真实缺陷）: ${rollbackError.message}`
        + '（正向重放已完成修复，但回滚能力缺陷必须显性失败）'
      );
    }
    console.warn(`[migration-roundtrip] 回滚失败但已通过正向重放修复: ${rollbackError.message}`);
  }

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true
  });
}, 300000);

afterAll(async () => {
  // 无论用例成败都把共享测试库修回「健康态」——深回滚的破坏必须完全抹平。
  // （2026-10-14 审计：用例在 rollback 后、replay 前失败时，库会被毁且后续套件假红。）
  // 注意：这只是卫生保证 —— 用例失败本身已在上面显式报错，不会被这里掩盖。
  //
  // 2026-10-15 完善的「回滚后重建」序列（两次实测踩坑后固化）：
  //   ① 正向重放 —— 恢复**结构**（表/索引/记账）
  //   ② init_role_permissions.js —— 重建**权限字典**（唯一年事实源；重放不保证字典完整：
  //      多个 down 脚本删 sys_permission 行，且 119 无 down 脚本被跳过导致其码不重播）
  //   ③ 清空 manager 授权后重放 120/121 —— 恢复**120 的拷贝全量语义**。
  //      为何必须清：120_up 是 INSERT IGNORE 加法语义，manager 若留有历史授权就会 > boss，
  //      migrationGuard 的「manager 追平 boss」断言会红（两次实测 117 vs 116）。
  if (pool) {
    try {
      runMigration();
      const initPerm = path.join(__dirname, '../../scripts/init_role_permissions.js');
      execSync(`node "${initPerm}"`, {
        env: { ...process.env, DB_HOST, DB_PORT: String(DB_PORT), DB_USER, DB_PASSWORD, DB_NAME },
        stdio: 'pipe'
      });
      await pool.query(
        `DELETE rp FROM sys_role_permission rp
           JOIN sys_role r ON r.id = rp.role_id
          WHERE r.code = 'manager'`
      );
      await pool.query("DELETE FROM schema_migrations WHERE version IN ('120','121')");
      runMigration();
    } catch (err) {
      console.warn(`[migration-roundtrip] afterAll 重建失败: ${err.message}`);
    }
    await pool.end();
  }
});

/**
 * 获取 SHOW CREATE TABLE 结果
 */
async function getTableSchema(tableName) {
  const [rows] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
  return rows[0]?.['Create Table'] || '';
}

/**
 * 规范化表结构 DDL 用于对比：
 * SHOW CREATE TABLE 中 KEY/CONSTRAINT 的显示顺序 = 索引创建顺序，
 * down→up 重放后索引重建顺序天然可能与首轮不同（如 008/021 分批加的 deleted_at 索引），
 * 属 DDL 固有现象而非结构漂移。故列定义保持原序，键定义统一排序后对比。
 *
 * ⚠️ 2026-10-15：剔除 `AUTO_INCREMENT=n` —— 往返过程（DROP/CREATE + 种子数据插入）
 * 会让自增值差 1，而自增计数**不属于表结构**，纳入对比只会造成假红
 * （本机 55 个用例因 beforeAll 历史失败从未真正执行过，该脆弱性因此一直潜伏）。
 */
function normalizeTableSchema(ddl) {
  if (!ddl) return ddl;
  const lines = ddl.split('\n');
  const closingIdx = lines.findIndex(l => l.trim().startsWith(') ENGINE'));
  if (closingIdx === -1) return ddl;
  const body = lines.slice(1, closingIdx).map(l => l.trim().replace(/,$/, ''));
  const cols = body.filter(l => l.startsWith('`'));
  const keys = body.filter(l => /^(UNIQUE KEY|KEY|FULLTEXT KEY|SPATIAL KEY|PRIMARY KEY|CONSTRAINT)/.test(l)).sort();
  const closing = lines[closingIdx].replace(/\s*AUTO_INCREMENT=\d+/i, '');
  return [lines[0], ...cols, ...keys, closing].join('\n');
}


/**
 * Phase 9R D1: 审计所有迁移的 down 脚本覆盖情况
 *
 * 2026-10-15 收紧（原断言 `withDown >= 17` 是 2025 年的过时弱断言，形同虚设）：
 * 改为**显式白名单** —— 新增迁移若忘记写 down 脚本，本用例立即红，
 * 逼着补脚本或把版本显式登记进 KNOWN_MISSING_DOWN 并说明理由。
 *
 * 2026-10-15 晚些时候：白名单已清空 —— 119 补上了 down 脚本
 * （它曾是唯一缺口，且直接导致深回滚后 log:delete 码永久消失、守卫假红）。
 * 现在要求：**每个 up 迁移都必须有配对的 down**。
 */
const KNOWN_MISSING_DOWN = [] // 2026-10-15：119 已补 down，白名单清空

function auditDownScripts() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'));

  const upScripts = files
    .filter(f => !f.includes('_down') && !f.includes('template'))
    .sort();
  const downSet = new Set(
    files
      .filter(f => f.endsWith('_down.sql'))
      .map(f => f.replace('_down.sql', '.sql'))
  );

  const missing = upScripts.filter(f => !downSet.has(f));
  const withDown = upScripts.filter(f => downSet.has(f));

  return {
    total: upScripts.length,
    withDown: withDown.length,
    missing: missing.length,
    missingList: missing.map(f => f.replace('.sql', '')),
  };
}

describe('Phase 8 D1: 迁移 down 脚本审计', () => {
  test('审计所有迁移的 down 覆盖情况', () => {
    const audit = auditDownScripts();
    console.log('\n=== 迁移 Down 脚本审计结果 ===');
    console.log('总迁移数:', audit.total);
    console.log('有 down 脚本:', audit.withDown);
    console.log('缺失 down 脚本:', audit.missing);
    if (audit.missingList.length > 0) {
      console.log('缺失版本:', audit.missingList.join(', '));
    }
    console.log('================================\n');

    expect(audit.total).toBeGreaterThan(0);
    // 白名单断言：缺失集合必须与已知清单逐项相等（多了=新迁移漏写 down，少了=请更新白名单）
    expect(audit.missingList.slice().sort()).toEqual(KNOWN_MISSING_DOWN.slice().sort());
  }, 30000);
});
describe('数据库迁移 roundtrip 测试', () => {
  ROUNDTRIP_VERSIONS.forEach(version => {
    test(`版本 ${version}: down → up 往返后关键表结构一致`, async () => {
      if (!pool) {
        if (STRICT) {
          throw new Error('未建立数据库连接：严格模式下不允许静默跳过（本往返用例并未执行）');
        }
        console.warn('[migration-roundtrip] 跳过：数据库不可达（本机便利跳过）');
        return;
      }

      // 1. 记录关键表结构
      const schemasBefore = {};
      for (const table of KEY_TABLES) {
        try {
          schemasBefore[table] = await getTableSchema(table);
        } catch {
          schemasBefore[table] = null;
        }
      }

      // 2. 回滚到目标版本（run_migrations.js 会回滚该版本及之后的所有迁移）
      // --force：防御性开关（2026-10-15：119 已补 down，当前无缺口）
      runMigration(`--rollback ${version} --force`);

      // 3. 重新执行所有正向迁移
      runMigration();

      // 4. 对比关键表结构（规范化后：键定义排序，消除 down→up 索引重建顺序差异）
      for (const table of KEY_TABLES) {
        if (schemasBefore[table]) {
          const schemaAfter = await getTableSchema(table);
          expect(normalizeTableSchema(schemaAfter)).toBe(normalizeTableSchema(schemasBefore[table]));
        }
      }
    }, 120000);
  });
});


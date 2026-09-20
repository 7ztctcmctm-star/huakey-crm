/**
 * requireManager 使用约束守卫（静态审计，2026-09-20）
 *
 * `middleware/admin.js` 的 `requireManager` **只判「是不是管理层」，不判「有没有该功能权限」**。
 * 它一旦被单独挂载，端点就会暴露给**所有**经理。因此本文件把该约束固化为不变式：
 *
 *   1) `backend/routes/**` 中每一处 `requireManager` 都必须与 `checkPermission('<code>')` 同挂；
 *   2) `requireManager` 必须纳入 `ROLE_CODES.MANAGER`（防修复回退）；
 *   3) `checkPermission` 必须按 `permission_code` 判定，不得回退到 roleId 数值。
 *
 * 纯静态文件扫描，无 DB / 无网络依赖。
 */

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', '..', 'routes');
const ADMIN_MW = path.join(__dirname, '..', '..', 'middleware', 'admin.js');
const PERM_MW = path.join(__dirname, '..', '..', 'middleware', 'permission.js');

function listJsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 把文件按 `router.` 切成一条条路由声明，返回 { file, src } */
function routeStatements(file) {
  const content = fs.readFileSync(file, 'utf8');
  const parts = content.split(/\brouter\s*\.\s*/);
  const out = [];
  // parts[0] 是文件头（require/常量），从 parts[1] 起才是路由
  for (let i = 1; i < parts.length; i++) {
    const src = parts[i];
    if (!/^(get|post|put|delete|patch|all)\s*\(/.test(src)) continue;
    out.push({ file, src });
  }
  return out;
}

describe('requireManager 使用约束（静态审计）', () => {
  const files = listJsFiles(ROUTES_DIR);
  const statements = files.flatMap(routeStatements);
  const usingRequireManager = statements.filter((s) => /\brequireManager\b/.test(s.src));

  it('应扫描到路由文件与 requireManager 挂载点（防止扫描逻辑失效导致假绿）', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(usingRequireManager.length).toBeGreaterThanOrEqual(40);
  });

  it('每一处 requireManager 都必须与 checkPermission 配对（否则会放宽到所有经理）', () => {
    const violations = usingRequireManager
      .filter((s) => !/checkPermission\s*\(/.test(s.src))
      .map((s) => `${path.relative(ROUTES_DIR, s.file)} :: ${s.src.trim().slice(0, 120)}`);

    expect(violations).toEqual([]);
  });

  it('routes/** 不得出现硬编码 roleId 数值判权（铁律）', () => {
    const violations = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((l, i) => {
        // 跳过注释
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        // 形如 roleId === 2 / role_id === 3 / [1, 2, 3].includes(roleId)
        if (/role_?[Ii]d\s*===\s*[0-9]/.test(l) || /\[[^\]]*\b[0-9]\s*,\s*[0-9][^\]]*\]\s*\.includes\(\s*role/.test(l)) {
          violations.push(`${path.relative(ROUTES_DIR, file)}:${i + 1}  ${l.trim().slice(0, 110)}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});

describe('requireManager 实现守卫（防修复回退）', () => {
  const src = fs.readFileSync(ADMIN_MW, 'utf8');

  it('requireManager 必须纳入 ROLE_CODES.MANAGER', () => {
    const mw = src.slice(src.indexOf('const requireManager'));
    expect(mw).toMatch(/ROLE_CODES\.MANAGER/);
  });

  it('requireManager 仍须保留 boss/manageAll 放行判据', () => {
    const mw = src.slice(src.indexOf('const requireManager'));
    expect(mw).toMatch(/manageAll/);
    expect(mw).toMatch(/ADMIN_ROLE_CODES/);
  });
});

describe('checkPermission 实现守卫', () => {
  const permMw = fs.readFileSync(PERM_MW, 'utf8');
  const permSvc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'services', 'permissionService.js'),
    'utf8'
  );

  it('checkPermission 必须委托 permissionService 按权限码判定，不自行比较 roleId 数值', () => {
    expect(permMw).toMatch(/getUserPermissions/);
    expect(permMw).not.toMatch(/role_?[Ii]d\s*===\s*[0-9]/);
  });

  it('权限码来源必须是 sys_permission.code（而非 roleId 数值映射）', () => {
    expect(permSvc).toMatch(/sys_permission/);
    expect(permSvc).toMatch(/p\.code/);
  });
});

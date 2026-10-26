/**
 * 生产迁移执行器守卫（审计 2026-10-23 · P1-19）
 *
 * 旧生产 CMD 使用 database/migrate.js：单文件失败后仍继续执行后续迁移，
 * 可能在半套 schema 上跑后面的 DDL，最后才退出。本测试确保：
 *   1. 镜像启动改用严格 runner（run_migrations.js）；
 *   2. 旧 migrate.js 也改为失败即停（防止脚本/人工入口继续使用旧行为）；
 *   3. deploy.sh 的迁移失败关键字仍能命中 runner 的真实输出。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DOCKERFILE = read('Dockerfile.synology');
const MIGRATE_JS = read('database/migrate.js');
const RUNNER_JS = read('database/migrations/run_migrations.js');
const DEPLOY_SH = read('deploy/deploy.sh');

describe('P1-19 · 生产容器迁移入口', () => {
  it('CMD 必须先执行严格 runner，再 exec node app.js', () => {
    const cmdLine = DOCKERFILE.split('\n').find((line) => line.startsWith('CMD '));
    expect(cmdLine).toBeDefined();
    expect(cmdLine).toContain('database/migrations/run_migrations.js');
    expect(cmdLine).toContain('exec node app.js');
    // 不得再使用旧的 migrate.js 作为启动入口
    expect(cmdLine).not.toContain('database/migrate.js');
  });

  it('运行镜像必须包含 migrations 目录（runner 与 SQL 同目录）', () => {
    expect(DOCKERFILE).toMatch(/COPY\s+--chown=nodejs:nodejs\s+database\/migrations\s+\/app\/database\/migrations/);
  });
});

describe('P1-19 · 单文件失败即停', () => {
  it('严格 runner 在单文件失败后立即 process.exit(1)', () => {
    const catchBlock = RUNNER_JS.slice(RUNNER_JS.indexOf('} catch (err)'));
    expect(catchBlock).toContain('执行失败');
    expect(catchBlock).toContain('process.exit(1)');
  });

  it('旧 migrate.js 也改为失败即停，不继续后续迁移', () => {
    const catchBlock = MIGRATE_JS.slice(MIGRATE_JS.indexOf('} catch (error)'));
    expect(catchBlock).toContain('不再继续后续迁移');
    expect(catchBlock).toContain('process.exit(1)');
  });

  it('严格 runner 只处理三位版本号的正向迁移', () => {
    expect(RUNNER_JS).toContain("f.endsWith('.sql') && /^\\d{3}_/.test(f) && !f.endsWith('_down.sql')");
  });
});

describe('P1-19 · 部署门禁仍能识别迁移失败', () => {
  it('deploy.sh 的失败关键字必须覆盖 runner 的输出', () => {
    const line = DEPLOY_SH.split('\n').find((l) => l.includes('grep -qE'));
    expect(line).toBeDefined();
    expect(line).toContain('执行失败');
    expect(line).toContain('致命错误');
  });

  it('deploy.sh 注释与容器实际 CMD 保持一致', () => {
    expect(DEPLOY_SH).toContain('node database/migrations/run_migrations.js && exec node app.js');
  });
});

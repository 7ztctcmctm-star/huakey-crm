/**
 * 部署回滚门禁（deploy/deploy.sh）的静态守卫测试
 *
 * ## 为什么要测一个 shell 脚本
 * deploy.sh 靠「日志关键字」判断迁移是否失败（[8/12] 与 [9/12] 两处 grep -qE）。
 * 这类关键字断言有个致命失效模式：**迁移脚本改了日志文案，门禁不会报错，只是再也拦不住了** ——
 * 于是带着失败的迁移继续启动新代码，且没有任何信号。历史上「服务已启动」关键字
 * 与后端实际输出「启动成功」不一致导致部署假失败，正是同一类耦合问题（见 deploy.sh 内注释）。
 *
 * 本测试把两端钉在一起：
 *   1. 迁移执行器真实打印的失败文案，必须能被 deploy.sh 的判据命中（否则门禁形同虚设）；
 *   2. 迁移执行器的成功文案，必须**不**被命中（否则每次部署都误回滚）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const DEPLOY_SH = path.join(ROOT, 'deploy/deploy.sh');
const RUNNER_JS = path.join(ROOT, 'database/migrations/run_migrations.js');

const read = (p) => fs.readFileSync(p, 'utf8');

/** 抽出 deploy.sh 里所有 `grep -qE "..."` 的迁移失败判据，拆成候选正则分支 */
function migrationFailureBranches() {
  const src = read(DEPLOY_SH);
  const branches = new Set();
  const re = /grep\s+-qE\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    for (const branch of m[1].split('|')) {
      if (branch) branches.add(branch);
    }
  }
  return [...branches];
}

/** 从迁移执行器里抽出 console.* 的消息模板，并把 ${...} 渲染成占位文本 */
function runnerMessages() {
  const src = read(RUNNER_JS);
  const out = [];
  const re = /console\.(log|error|warn)\(\s*(['"`])([\s\S]*?)\2/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const rendered = m[3].replace(/\$\{[^}]*\}/g, 'X');
    out.push({ level: m[1], text: rendered });
  }
  return out;
}

describe('deploy.sh · 迁移失败回滚门禁', () => {
  const branches = migrationFailureBranches();

  it('应存在迁移失败判据（否则迁移失败会被静默放过）', () => {
    expect(branches.length).toBeGreaterThan(0);
  });

  it('每个判据都必须是可被 grep -E 解析的合法正则', () => {
    for (const b of branches) {
      expect(() => new RegExp(b)).not.toThrow();
    }
  });

  it('迁移执行器的真实失败输出必须被判据命中', () => {
    // 只认「迁移文件执行失败」与「致命错误」两类判据文案；
    // ✗ 也用于「迁移不可逆」提示，属于回滚路径的拒绝提示，不在此列。
    const failures = runnerMessages().filter(
      (msg) => msg.text.includes('执行失败') || msg.text.includes('致命错误')
    );
    // 先自证取样有效：执行器确实会打印失败行，否则本用例就是空的绿
    expect(failures.length).toBeGreaterThan(0);

    for (const f of failures) {
      const hit = branches.some((b) => new RegExp(b).test(f.text));
      expect({ text: f.text, hit }).toEqual({ text: f.text, hit: true });
    }
  });

  it('成功文案不得被命中（避免误回滚）', () => {
    const successes = runnerMessages().filter((msg) => /执行成功|无需操作/.test(msg.text));
    expect(successes.length).toBeGreaterThan(0);
    expect(
      successes.some((s) => branches.some((b) => new RegExp(b).test(s.text)))
    ).toBe(false);
  });

  it('回滚动作必须先回切 :prev 再拉起，且最终以非零码退出', () => {
    const src = read(DEPLOY_SH);
    const start = src.indexOf('rollback_and_exit()');
    expect(start).toBeGreaterThan(-1);

    const body = src.slice(start, src.indexOf('\n}', start));
    expect(body).toMatch(/docker tag "\$PREV_IMAGE"/);
    expect(body).toMatch(/--no-build/);

    // 顺序：回切镜像必须出现在重新拉起容器之前
    expect(body.indexOf('docker tag')).toBeLessThan(body.indexOf('up -d'));

    // 必须明确提示「镜像回滚不回滚数据库」+ 给出快照路径
    expect(body).toMatch(/不会回滚数据库/);
    expect(body).toMatch(/DUMP_FILE/);
    expect(body).toMatch(/exit 1/);
  });
});

describe('deploy.sh · 部署前快照', () => {
  const src = read(DEPLOY_SH);

  it('down 之前必须完成 mysqldump 快照与 :prev 标记', () => {
    const idxDump = src.indexOf('mysqldump');
    const idxPrev = src.indexOf('docker tag');
    const idxDown = src.indexOf('compose -f docker-compose.synology.yml down');
    expect(idxDump).toBeGreaterThan(-1);
    expect(idxPrev).toBeGreaterThan(-1);
    expect(idxDown).toBeGreaterThan(-1);
    expect(idxDump).toBeLessThan(idxDown);
    expect(idxPrev).toBeLessThan(idxDown);
  });

  it('mysqldump 密码必须走 MYSQL_PWD，不得出现在命令行', () => {
    const dumpLine = src.split('\n').find((l) => l.includes('mysqldump'));
    expect(dumpLine).toBeDefined();
    expect(dumpLine).not.toMatch(/-p\$?\{?MYSQL_ROOT/);
    expect(src).toMatch(/-e MYSQL_PWD="\$MYSQL_ROOT_PASSWORD"/);
  });

  it('stderr 不得并入 dump 文件', () => {
    expect(src).toMatch(/2>\s*"\$DUMP_FILE\.err"/);
  });
});

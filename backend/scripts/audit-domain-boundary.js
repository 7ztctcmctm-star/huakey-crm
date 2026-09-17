#!/usr/bin/env node
/**
 * 领域边界静态审计（PRD R-06 / AGENTS.md 架构铁律）
 *
 * 规则来源（PRD「架构铁律」原文）：
 *   非 Customer 模块**仅允许 SELECT** `crm_customer`，
 *   禁止 UPDATE/DELETE、禁止下游反向改上游、禁止跨模块 cron 同步。
 *   违反 = P0 架构违规。
 *
 * 本脚本做三件事：
 *   A. 扫描后端生产代码（不含 tests/），找出所有对 crm_customer 的写操作，
 *      对照「Customer 域白名单」判定 ALLOWED / VIOLATION。
 *   B. 解析 cron/scheduler.js 的每个调度块，沿 require() 溯源到真实模块，
 *      列出各作业写入的表，标记其中写 crm_customer 的（= 跨模块 cron 同步）。
 *   C. 顺带列出客户「相关表」（crm_contact 等）的写点，供审阅（非判定项）。
 *
 * 用法：
 *   node scripts/audit-domain-boundary.js              # 只报告（默认，永远 exit 0）
 *   node scripts/audit-domain-boundary.js --strict     # 有**新增**越界时 exit 1（CI 卡点用）
 *
 * 卡点口径（ratchet 模式）：
 *   存量债登记在 scripts/domain-boundary-baseline.json（按「文件+动词+允许条数」），卡点只看**新增**；
 *   债务整改后需下调基线，脚本会提示可收缩条目；基线超过 review_by 日期即判 FAIL（强制重评审）。
 *   用 BOUNDARY_BASELINE=<path> 可指向自定义基线（便于自测）。
 *
 * 退出码：0 = 通过 / 1 = 有新增越界或基线过期（仅 --strict）/ 2 = 脚本自身错误
 */

const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '..');
const STRICT = process.argv.includes('--strict');

// 扫描范围：生产代码目录（tests/ 有意排除——测试夹具写库是合法的，不属于产品链路）
const SCAN_DIRS = [
  'controllers', 'routes', 'services', 'cron', 'workers',
  'tools', 'utils', 'config', 'core', 'api', 'scripts'
];
const SKIP_DIRS = new Set(['node_modules', 'coverage', 'backups', 'uploads', 'logs', 'tmp', 'tests', 'docs']);

/** 定时任务注册表（调度块所在文件）——换注册文件时只改这里 */
const CRON_REGISTRY = 'cron/scheduler.js';

/**
 * 非生产代码（测试 / 真库核验脚本）排除规则
 *
 * 这些文件的写入是**测试夹具或负例验证**（例如 verify-transfer-sql.js 在事务内执行后 ROLLBACK，
 * 且不被任何生产代码引用），不属于「生产模块越界写」的治理范围。
 *
 * ⚠️ 规则必须**窄**且**显式**：仅匹配 `scripts/verify-*.js` 这类核验工具；
 *    **禁止**用它排除 `services/`、`routes/`、`cron/`（那才是治理对象）。
 * 排除结果会在报告里**显式列出数量与文件名**，不做静默排除。
 */
const NON_PROD_SCRIPT_PATTERNS = [/^scripts\/verify-[^/]+\.js$/];
const isNonProdScript = (rel) => NON_PROD_SCRIPT_PATTERNS.some((re) => re.test(rel));

/**
 * 「已知越界」基线（ratchet 模式）
 * 目的：让卡点**立刻可用**——存量债被登记为已知，只拦**新增**；
 * 债务被整改后必须同步收缩基线，否则脚本会提示（见 stale 报告）。
 * 可用环境变量 BOUNDARY_BASELINE 指向自定义基线路径。
 */
function loadBaseline() {
  const p = process.env.BOUNDARY_BASELINE || path.join(BACKEND, 'scripts/domain-boundary-baseline.json');
  if (!fs.existsSync(p)) return { path: p, data: { crm_customer_writes: {}, cross_module_cron: {} }, missing: true };
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')), missing: false };
}

/** 基线是否过期（review_by）——过期即视为失败，强制重新评审 */
function baselineExpired(data) {
  if (!data?.review_by) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > data.review_by;
}

/**
 * Customer 域白名单：**只有这些文件允许写 crm_customer**。
 * 判定依据 = 该文件属于「客户中心」模块（PRD 冻结的 Customer 域）自身。
 * ⚠️ 新增写点必须在此显式登记，否则扫描会报 VIOLATION —— 这是刻意的摩擦。
 * ⚠️ 本清单是**按代码职责推断**的，尚需产品/架构签署（见审计报告 §五）。
 */
const CUSTOMER_DOMAIN_ALLOWLIST = {
  'services/customerService.js': '客户主服务（状态流转/公海认领/归属）',
  'services/customerDetailService.js': '客户详情与编辑（updateCustomer 等）',
  'services/poolService.js': '公海池（释放/认领/转移）',
  'services/assignService.js': '客户分配规则（客户域内）',
  'routes/customers.js': '客户中心 API（/customers）',
  'routes/leads.js': '潜客池 API（/leads）',
  'routes/pool.js': '公海 API（/pool）'
};

// 客户「相关表」——写这些不算违规，但列出来便于审阅（非判定项）
const CUSTOMER_RELATED_TABLES = ['crm_contact', 'crm_customer_tag', 'crm_follow_up', 'crm_customer_assign_log'];

const WRITE_VERB = String.raw`(INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)`;
// 任意写操作（用于统计某文件「写入了哪些表」）
const WRITE_ANY = String.raw`(?:INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+` + '[`\'"]?([a-z_][a-z0-9_]*)';

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** 把「压缩空白后的文本」的偏移映射回原始行号 */
function makeLineMapper(raw) {
  const lines = raw.split('\n');
  const starts = [];
  let acc = 0;
  for (const l of lines) { starts.push(acc); acc += l.length + 1; }
  return (offset) => {
    let lo = 0, hi = starts.length - 1, ans = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= offset) { ans = mid + 1; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };
}

/** 命中是否位于注释行（整行以 // 或 * 开头）——粗判，够用且不误伤字符串里的 URL */
function inCommentLine(line) {
  const t = (line || '').trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** 把原文压平为单空白文本，并记录每个压平字符对应的原文偏移 */
function flatten(raw) {
  const flatChars = [];
  const offsets = [];
  let prevSpace = false;
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) {
      if (!prevSpace) { flatChars.push(' '); offsets.push(i); prevSpace = true; }
    } else { flatChars.push(raw[i]); offsets.push(i); prevSpace = false; }
  }
  return { flat: flatChars.join(''), offsets };
}

function scanFile(file) {
  const rel = path.relative(BACKEND, file).split(path.sep).join('/');
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const lineOf = makeLineMapper(raw);
  const { flat, offsets } = flatten(raw);

  const hits = [];
  const re = new RegExp(`${WRITE_VERB}\\s+[\`'\"]?crm_customer\\b`, 'gi');
  let m;
  while ((m = re.exec(flat)) !== null) {
    const line = lineOf(offsets[m.index] ?? 0);
    hits.push({
      rel, line,
      verb: m[1].toUpperCase().replace(/\s+/g, ' '),
      snippet: (lines[line - 1] || '').trim().slice(0, 120),
      comment: inCommentLine(lines[line - 1])
    });
  }

  const related = [];
  for (const t of CUSTOMER_RELATED_TABLES) {
    const r2 = new RegExp(`${WRITE_VERB}\\s+[\`'\"]?${t}\\b`, 'gi');
    let m2;
    while ((m2 = r2.exec(flat)) !== null) {
      const line = lineOf(offsets[m2.index] ?? 0);
      related.push({ rel, line, table: t, verb: m2[1].toUpperCase().replace(/\s+/g, ' ') });
    }
  }

  const allWrites = new Set();
  const reAll = new RegExp(WRITE_ANY, 'gi');
  let m3;
  while ((m3 = reAll.exec(flat)) !== null) {
    const line = lineOf(offsets[m3.index] ?? 0);
    if (inCommentLine(lines[line - 1])) continue;
    allWrites.add(m3[1].toLowerCase());
  }

  return { hits, related, allWrites: [...allWrites] };
}

/**
 * 定时任务溯源：解析调度表里每个 cron.schedule 块，沿块内 require() 解析到真实模块文件，
 * 取其「写入表」集合。
 *
 * ⚠️ 为什么必须溯源而不能只扫字符串：真正的作业实现（如
 *    services/cronService.autoReleaseCustomers）本身不含 cron.schedule，
 *    只扫「哪个文件出现 cron.schedule」会**漏报**——本脚本第一版就误报「0 个跨模块 cron 写客户」。
 */
function scanCron(writeIndex) {
  const registryFile = path.join(BACKEND, CRON_REGISTRY);
  if (!fs.existsSync(registryFile)) return [];
  const raw = fs.readFileSync(registryFile, 'utf8');
  const re = /cron\.schedule\s*\(\s*(['"`])([^'"`]+)\1/g;
  const marks = [];
  let m;
  while ((m = re.exec(raw)) !== null) marks.push({ expr: m[2], idx: m.index });

  const jobs = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx;
    const end = i + 1 < marks.length ? marks[i + 1].idx : raw.length;
    const block = raw.slice(start, end);
    const modules = [];
    const tables = new Set();
    for (const r of block.matchAll(/require\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
      const req = r[1];
      if (!req.startsWith('.')) continue;
      const base = path.resolve(path.dirname(registryFile), req);
      const found = [base, `${base}.js`, path.join(base, 'index.js')]
        .find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (!found) continue;
      const rel = path.relative(BACKEND, found).split(path.sep).join('/');
      modules.push(rel);
      for (const t of (writeIndex[rel] || [])) tables.add(t);
    }

    // ② 块内内联 SQL（有些作业直接在本块里写库，如清理 sys_log）
    for (const w of block.matchAll(new RegExp(WRITE_ANY, 'gi'))) tables.add(w[1].toLowerCase());

    // ③ 顶部/函数内「解构 require + 块内按名调用」的作业
    //    （如 const { autoReleaseCustomers } = require('../services/cronService')
    //      然后 cron.schedule(..., () => autoReleaseCustomers(pool, days))）
    for (const dr of raw.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
      const req = dr[2];
      if (!req.startsWith('.')) continue;
      const names = dr[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean);
      if (!names.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(block))) continue;
      const base = path.resolve(path.dirname(registryFile), req);
      const found = [base, `${base}.js`, path.join(base, 'index.js')]
        .find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (!found) continue;
      const rel = path.relative(BACKEND, found).split(path.sep).join('/');
      modules.push(rel);
      for (const t of (writeIndex[rel] || [])) tables.add(t);
    }
    jobs.push({
      expr: marks[i].expr,
      modules: [...new Set(modules)],
      tables: [...tables].sort(),
      writesCustomer: tables.has('crm_customer')
    });
  }
  return jobs;
}

function main() {
  const files = [];
  for (const d of SCAN_DIRS) walk(path.join(BACKEND, d), files);

  const violations = [];
  const allowed = [];
  const relatedWrites = [];
  const writeIndex = {};
  const excludedNonProd = [];

  for (const f of files) {
    const rel = path.relative(BACKEND, f).split(path.sep).join('/');
    if (isNonProdScript(rel)) { excludedNonProd.push(rel); continue; }
    const { hits, related, allWrites } = scanFile(f);
    writeIndex[rel] = allWrites;
    relatedWrites.push(...related);
    for (const h of hits) {
      if (h.comment) continue;
      const reason = CUSTOMER_DOMAIN_ALLOWLIST[h.rel];
      if (reason) allowed.push({ ...h, reason });
      else violations.push(h);
    }
  }

  // ---- 与基线比对：区分「存量债（已知）」与「新增越界（拦停）」----
  const baseline = loadBaseline();
  const allowedByFileVerb = baseline.data.crm_customer_writes || {};
  const knownViolations = [];
  const newViolations = [];
  const grouped = {};
  for (const v of violations) {
    const key = `${v.rel}||${v.verb}`;
    (grouped[key] ||= []).push(v);
  }
  const usedBaseline = {};
  for (const [key, list] of Object.entries(grouped)) {
    const [rel, verb] = key.split('||');
    const budget = allowedByFileVerb[rel]?.[verb] ?? 0;
    list.sort((a, b) => a.line - b.line);
    for (let i = 0; i < list.length; i++) {
      if (i < budget) knownViolations.push(list[i]); else newViolations.push(list[i]);
    }
    usedBaseline[rel] ||= {};
    usedBaseline[rel][verb] = list.length;
  }
  // 基线登记了但实际已清掉/条数变少 → 提示收缩基线
  const staleEntries = [];
  for (const [rel, verbs] of Object.entries(allowedByFileVerb)) {
    for (const [verb, budget] of Object.entries(verbs)) {
      const actual = usedBaseline[rel]?.[verb] || 0;
      if (actual < budget) staleEntries.push(`${rel} ${verb}: 基线 ${budget} → 实际 ${actual}`);
    }
  }

  const cronJobs = scanCron(writeIndex);
  const cronCustomerWrites = cronJobs.filter((j) => j.writesCustomer);
  // 基线键容错：允许写成 "45 0 * * *" 或 "[45 0 * * *]"
  const cronBaseline = baseline.data.cross_module_cron || {};
  const normExpr = (s) => String(s || '').replace(/[[\]]/g, '').trim();
  const cronKnown = (expr) => Object.keys(cronBaseline).some((k) => normExpr(k) === normExpr(expr));
  const knownCron = cronCustomerWrites.filter((j) => cronKnown(j.expr));
  const newCron = cronCustomerWrites.filter((j) => !cronKnown(j.expr));

  console.log('=== 领域边界静态审计（R-06） ===');
  console.log(`扫描目录: ${SCAN_DIRS.join(', ')}`);
  console.log(`扫描文件: ${files.length} 个 .js（已排除 tests/ 与构建产物）`);
  console.log('');
  console.log(`【A】crm_customer 写操作共 ${allowed.length + violations.length} 处`);
  console.log(`  · 白名单（Customer 域内，允许）: ${allowed.length} 处`);
  for (const a of allowed) console.log(`      ALLOWED   ${a.rel}:${a.line}  ${a.verb}  ← ${a.reason}`);
  console.log(`  · 越界（非 Customer 域，禁止）: ${violations.length} 处`
    + ` = 存量债（基线放行）${knownViolations.length} + **新增 ${newViolations.length}**`);
  const byFile = {};
  for (const v of violations) (byFile[v.rel] ||= []).push(v);
  for (const [rel, list] of Object.entries(byFile)) {
    console.log(`      ${rel}  (${list.length} 处)`);
    for (const v of list) {
      const isNew = newViolations.includes(v);
      console.log(`         ${isNew ? '🆕 NEW ' : '  已知 '} line ${v.line}  ${v.verb}`);
      console.log(`                ${v.snippet}`);
    }
  }
  console.log('');
  console.log(`【B】定时任务 ${cronJobs.length} 个（源: ${CRON_REGISTRY}）`);
  for (const j of cronJobs) {
    const isKnown = cronCustomerWrites.includes(j) && baseline.data.cross_module_cron?.[j.expr];
    const isNew = cronCustomerWrites.includes(j) && !isKnown;
    const flag = isNew
      ? '  🆕 NEW 写 crm_customer（跨模块 cron 同步，禁止）'
      : (isKnown ? '  已知（基线放行）写 crm_customer' : '');
    console.log(`      [${j.expr}]${flag}`);
    console.log(`        调用模块: ${j.modules.join(', ') || '(块内无相对 require)'}`);
    console.log(`        写入表: ${j.tables.join(', ') || '(无)'}`);
  }
  console.log('');
  console.log(`【C】客户相关表写操作（不违规，供审阅）: ${relatedWrites.length} 处`);
  const byTable = {};
  for (const r of relatedWrites) (byTable[r.table] ||= []).push(`${r.rel}:${r.line}`);
  for (const [t, list] of Object.entries(byTable)) {
    console.log(`      ${t}: ${list.length} 处 → ${[...new Set(list.map((x) => x.split(':')[0]))].join(', ')}`);
  }
  console.log('');

  console.log('');
  console.log(`【D】按口径排除的非生产脚本: ${excludedNonProd.length} 个${excludedNonProd.length ? '（测试/真库核验工具，其写入为夹具或负例验证）' : ''}`);
  for (const p of excludedNonProd) console.log(`      EXCLUDED  ${p}`);

  const expired = baselineExpired(baseline.data);
  const failed = newViolations.length > 0 || newCron.length > 0 || expired || baseline.missing;
  console.log('=== 结论 ===');
  console.log(`白名单（Customer 域内）: ${allowed.length} 处`);
  console.log(`存量债（基线放行）: ${knownViolations.length} 处 + ${knownCron.length} 个 cron 作业`
    + `  [基线: ${baseline.missing ? '❌ 未找到' : path.relative(path.resolve(BACKEND, '..'), baseline.path).split(path.sep).join('/')}]`);
  console.log(`🆕 新增越界: ${newViolations.length} 处 + ${newCron.length} 个 cron 作业  ← 卡点只看这个`);
  if (staleEntries.length) {
    console.log(`♻️ 基线可收缩 ${staleEntries.length} 条（债务已清，请同步下调基线，避免基线"注水"）：`);
    for (const s of staleEntries) console.log(`      ${s}`);
  }
  if (expired) console.log(`⏰ 基线已过期（review_by=${baseline.data.review_by}）—— 需重新评审后更新日期`);
  const debtClear = knownViolations.length === 0 && knownCron.length === 0;
  console.log(failed
    ? 'RESULT: FAIL'
    : (debtClear
      ? 'RESULT: PASS（领域边界干净：无越界写、无跨模块 cron）'
      : 'RESULT: PASS（存量债未清，但无新增越界）'));

  if (STRICT && failed) process.exit(1);
}

try { main(); } catch (e) { console.error('审计脚本自身错误:', e); process.exit(2); }

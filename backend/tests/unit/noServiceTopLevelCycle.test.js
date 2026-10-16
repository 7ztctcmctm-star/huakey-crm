/**
 * services 层「顶层 require 成环」守卫（静态审计，2026-10-16）
 *
 * 背景：2026-10-16 修 A1.5 时发现 `services/quoteService.js` 与 `services/opportunityService.js`
 * **互相顶层 require**。由于两者都在文件末尾 `module.exports = {...}` 整体重新赋值，
 * 先被加载的一方会永久捕获到对方的「半成品」exports（空对象 `{}`）：
 *
 *   按 app.js 的顺序 routes/opportunity(190) → routes/quote(192)，quoteService 先完成初始化，
 *   它拿到的 opportunityService 是空对象 ⇒ `opportunityService.advanceStage` 恒为 `undefined`
 *   ⇒ 报价审批通过/转合同后的商机推进抛 TypeError，并被内层 try/catch **静默吞掉**
 *   ⇒ 「报价审批通过自动推进商机」上线以来从未真正生效。
 *
 * 危害特征：**只在特定加载顺序下发作**，且被 try/catch 掩盖、单测不容易覆盖 ⇒ 极易复发。
 *
 * 本守卫把「services 内部的顶层 require 不得成环」固化为不变式。
 * 若确需跨服务调用（如报价→商机），请在**调用时惰性 require**（见 quoteService.getOpportunityService），
 * 惰性 require 不计入本图的「顶层」依赖。
 *
 * 纯静态文件扫描，无 DB / 无网络依赖。
 */

const fs = require('fs');
const path = require('path');

const SERVICES_DIR = path.join(__dirname, '..', '..', 'services');
const BACKEND_DIR = path.join(__dirname, '..', '..');

function listJsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() && e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

/** 剥掉注释，避免注释里提到的 require 被当成真实依赖 */
function stripComments(raw) {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

/**
 * 抽取**顶层** require（行首无缩进的 `const x = require('...')`）。
 * 函数体内的惰性 require 有缩进，不会被计入 —— 那正是本守卫鼓励的解耦写法。
 */
function topLevelRequires(file) {
  const content = stripComments(fs.readFileSync(file, 'utf8'));
  const re = /^const\s+[A-Za-z_$][\w$]*\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm;
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

function resolveToServicesFile(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('..')) return null; // 三方包/内建模块
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base.endsWith('.js') ? base : `${base}.js`, path.join(base, 'index.js')];
  for (const c of candidates) {
    if (c.startsWith(SERVICES_DIR + path.sep) && fs.existsSync(c)) return c;
  }
  return null;
}

/** 构建 services 内部顶层依赖图 */
function buildGraph() {
  const files = listJsFiles(SERVICES_DIR);
  const graph = {};
  for (const f of files) {
    const deps = topLevelRequires(f)
      .map((spec) => resolveToServicesFile(f, spec))
      .filter(Boolean);
    graph[f] = deps;
  }
  return { files, graph };
}

/** DFS 找一条环，返回节点路径；无环返回 null */
function findCycle(graph) {
  const state = Object.create(null); // 1 = visiting, 2 = done
  const stack = [];

  const dfs = (node) => {
    if (state[node] === 1) return stack.slice(stack.indexOf(node)).concat(node);
    if (state[node] === 2) return null;
    state[node] = 1;
    stack.push(node);
    for (const nb of graph[node] || []) {
      const found = dfs(nb);
      if (found) return found;
    }
    stack.pop();
    state[node] = 2;
    return null;
  };

  for (const n of Object.keys(graph)) {
    const c = dfs(n);
    if (c) return c;
  }
  return null;
}

const rel = (p) => path.relative(BACKEND_DIR, p).replace(/\\/g, '/');

describe('services 层顶层 require 不得成环（静态审计）', () => {
  const { files, graph } = buildGraph();
  const edgeCount = Object.values(graph).reduce((n, d) => n + d.length, 0);

  it('应扫描到 services 源文件与内部依赖边（防止扫描逻辑失效导致假绿）', () => {
    // 2026-10-16 实测基线：66 个 services 源文件 / 27 条 services 内部顶层依赖边
    expect(files.length).toBeGreaterThan(50);
    expect(edgeCount).toBeGreaterThan(10);
  });

  it('services 内部的顶层 require 不应构成循环依赖', () => {
    const cycle = findCycle(graph);
    // 报错时给出完整环路径，方便直接定位
    if (cycle) {
      // eslint-disable-next-line no-throw-literal
      throw new Error(`检测到 services 顶层 require 循环依赖：\n${cycle.map(rel).join('\n  → ')}`);
    }
    expect(cycle).toBeNull();
  });

  it('quoteService 不得在顶层 require opportunityService（A1.5 修复的根因，防回退）', () => {
    const quote = path.join(SERVICES_DIR, 'quoteService.js');
    const opportunity = path.join(SERVICES_DIR, 'opportunityService.js');
    expect(fs.existsSync(quote)).toBe(true);
    expect(fs.existsSync(opportunity)).toBe(true);
    expect(graph[quote]).not.toContain(opportunity);
  });

  it('跨服务的延迟调用必须走调用时 require（quoteService 保留惰性取值封装）', () => {
    const quoteSrc = fs.readFileSync(path.join(SERVICES_DIR, 'quoteService.js'), 'utf8');
    expect(quoteSrc).toMatch(/getOpportunityService\s*=\s*\(\)\s*=>\s*require\(/);
  });
});

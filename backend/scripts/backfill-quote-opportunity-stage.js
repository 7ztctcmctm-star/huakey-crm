/**
 * 一次性回填脚本：补齐「报价审批通过 / 报价转合同」本应推进但从未生效的商机阶段
 *
 * ── 背景 ────────────────────────────────────────────────────────────────
 * 2026-10-16 修复 A1.5 时发现：`services/quoteService.js` 与 `services/opportunityService.js`
 * 存在循环依赖（互相顶层 require + module.exports 整体重赋值），导致 quoteService 拿到的
 * opportunityService 是空 exports，`opportunityService.advanceStage` 恒为 undefined。
 * 于是这两处推进在修复前**一直抛 TypeError 并被内层 try/catch 静默吞掉**：
 *   - approveQuote      ：报价审批通过(approval_status=2) → 商机 stage 3（方案报价）
 *   - convertToContract ：报价转合同                        → 商机 stage 5（成交）
 * 修复之后，新产生的业务会自动推进；但**历史上**这些商机的 stage 仍停在原地，需要本脚本补齐。
 *
 * ── 对齐规则（与线上代码严格一致，勿擅自改写）─────────────────────────
 *   1. 目标阶段：审批通过 → 3；已转合同 → 5；同一商机有多张报价时取**最高**目标。
 *   2. 单向推进：仅当 `当前 stage < 目标 stage` 才推进，绝不下调
 *      （对应 quoteService.advanceStageForward 的保护）。
 *   3. 终态不碰：当前 stage 为 5(成交) / 6(失败) 直接跳过
 *      （advanceStage 自身也会拒绝，此处提前跳过以免噪音）。
 *   4. 复用 `opportunityService.advanceStage`：win_rate 按 DEFAULT_STAGE_PROBABILITY 设置、
 *      并写 `crm_opportunity_stage_log`，与线上行为**完全一致**，不在本脚本里另写 UPDATE。
 *   5. 幂等：重复执行时 stage 已达标即跳过，可安全重跑。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────
 *   # 1) 先干跑（默认，只读，不写任何数据）—— 必须先看清楚影响面
 *   node scripts/backfill-quote-opportunity-stage.js
 *
 *   # 2) 确认无误后再实际写入
 *   node scripts/backfill-quote-opportunity-stage.js --apply
 *
 * 可选参数：
 *   --apply            实际写入（缺省为 dry-run 只读）
 *   --include-demo     连 is_demo=1 的商机一起处理（默认跳过 demo 数据）
 *   --limit N          最多处理 N 个商机（默认不限）
 *   --verbose          dry-run 时逐条打印明细（默认只打印前 20 条）
 *
 * 环境变量（同 config/database.js）：DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 *
 * ⚠️ 操作生产库前请先备份，并务必先跑一次不带 --apply 的干跑核对明细。
 */

// 与 app.js 保持一致：先加载仓库根 .env，再 require 任何依赖 DB 配置的模块
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('../config/database');
const opportunityService = require('../services/opportunityService');

const STAGE_NAME = { 1: '询盘', 2: '需求确认', 3: '方案报价', 4: '谈判', 5: '成交', 6: '失败' };

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const APPLY = has('--apply');
const INCLUDE_DEMO = has('--include-demo');
const VERBOSE = has('--verbose');
const LIMIT = parseInt(opt('--limit') || '0', 10) || 0;

/** 目标 stage：审批通过 → 3，已转合同 → 5 */
function targetStageOf(row) {
  let target = null;
  if (Number(row.approval_status) === 2) target = 3; // 审批通过 → 方案报价
  if (row.contract_id) target = 5;                   // 已转合同 → 成交（更高优先）
  return target;
}

function triggerReason(target) {
  return target === 5
    ? '回填：报价转合同（A1.5 循环依赖修复前推进未生效）'
    : '回填：报价审批通过（A1.5 循环依赖修复前推进未生效）';
}

async function main() {
  console.log('='.repeat(72));
  console.log(`商机阶段回填脚本 | 模式：${APPLY ? '⚠️ APPLY（将写入数据库）' : 'DRY-RUN（只读，不写入）'}`);
  console.log(`库：${process.env.DB_NAME || 'huakey_crm'} @ ${process.env.DB_HOST || 'localhost'}`
    + ` | demo：${INCLUDE_DEMO ? '包含' : '跳过'}${LIMIT ? ` | limit：${LIMIT}` : ''}`);
  console.log('='.repeat(72));

  // 一次性取全量关联关系：报价 → 商机（+ 是否已转合同）
  const sql = `
    SELECT
      q.id            AS quote_id,
      q.quote_no      AS quote_no,
      q.opportunity_id AS opportunity_id,
      q.approval_status AS approval_status,
      q.approver_id   AS approver_id,
      q.create_by     AS quote_create_by,
      o.stage         AS opp_stage,
      o.is_demo       AS opp_is_demo,
      MAX(c.id)        AS contract_id,
      MAX(c.create_by) AS contract_create_by
    FROM crm_quote q
    INNER JOIN crm_opportunity o
      ON o.id = q.opportunity_id AND o.deleted_at IS NULL
    LEFT JOIN crm_contract c
      ON c.quote_id = q.id AND c.deleted_at IS NULL
    WHERE q.deleted_at IS NULL
      AND q.opportunity_id IS NOT NULL
    GROUP BY q.id, q.quote_no, q.opportunity_id, q.approval_status, q.approver_id,
             q.create_by, o.stage, o.is_demo
    ORDER BY q.opportunity_id, q.id
  `;
  const [rows] = await pool.query(sql);

  // 按商机聚合：取最高目标 stage，并记住触发它的那条记录（用于确定操作人）
  const byOpp = new Map();
  for (const r of rows) {
    const target = targetStageOf(r);
    if (!target) continue; // 未审批通过、也未转合同 → 不推进
    const cur = byOpp.get(r.opportunity_id);
    if (!cur || target > cur.target) {
      byOpp.set(r.opportunity_id, { target, row: r });
    } else if (target === cur.target && cur.row.contract_id && !r.contract_id) {
      // 同为目标 5 时保留有合同的那条（便于取到合同创建人作为操作人）
      byOpp.set(r.opportunity_id, { target, row: r });
    }
  }

  console.log(`\n扫描：报价 ${rows.length} 条 → 关联到 ${byOpp.size} 个商机（其中满足推进条件的）`);

  const plan = [];
  let skippedTerminal = 0;
  let skippedDemo = 0;
  let skippedAlready = 0;

  for (const [opportunityId, { target, row }] of byOpp) {
    if (!INCLUDE_DEMO && Number(row.opp_is_demo) === 1) { skippedDemo++; continue; }
    const current = Number(row.opp_stage);
    if (current === 5 || current === 6) { skippedTerminal++; continue; }
    if (current >= target) { skippedAlready++; continue; }

    // 操作人：审批通过取审批人，转合同取合同创建人，均兜底到报价创建人
    const changedBy = (target === 5)
      ? (row.contract_create_by || row.quote_create_by || null)
      : (row.approver_id || row.quote_create_by || null);

    plan.push({
      opportunityId,
      quoteId: row.quote_id,
      quoteNo: row.quote_no,
      from: current,
      to: target,
      changedBy,
      reason: triggerReason(target)
    });
  }

  if (LIMIT) plan.length = Math.min(plan.length, LIMIT);

  console.log(`\n待推进：${plan.length} 个商机`);
  console.log(`跳过：终态(5成交/6失败) ${skippedTerminal} | 已达标(不倒退) ${skippedAlready} | demo ${skippedDemo}`);

  const showCount = VERBOSE ? plan.length : Math.min(plan.length, 20);
  console.log('\n--- 明细 ---');
  for (const p of plan.slice(0, showCount)) {
    console.log(
      `  商机 #${p.opportunityId}: ${p.from}(${STAGE_NAME[p.from]}) → ${p.to}(${STAGE_NAME[p.to]})`
      + `  [来源报价 #${p.quoteId} ${p.quoteNo}] 操作人=${p.changedBy ?? 'NULL'}`
    );
  }
  if (plan.length > showCount) console.log(`  ... 另有 ${plan.length - showCount} 条（加 --verbose 全量显示）`);

  if (!APPLY) {
    console.log('\n✅ DRY-RUN 结束，未写入任何数据。确认无误后加 --apply 执行。');
    return;
  }

  console.log('\n开始写入...');
  let ok = 0;
  let failed = 0;
  for (const p of plan) {
    try {
      // 复用线上同一函数：win_rate + stage_log 全部与线上一致
      await opportunityService.advanceStage(pool, p.opportunityId, p.to, p.changedBy, { changeReason: p.reason });
      ok++;
    } catch (e) {
      failed++;
      console.error(`  ✗ 商机 #${p.opportunityId} 失败：${e.message}`);
    }
  }

  console.log(`\n✅ 完成：成功 ${ok} / 失败 ${failed}`);
  console.log('提示：脚本幂等，可重复执行；已写入的变更在 crm_opportunity_stage_log 中可用 change_reason 检索。');
}

main()
  .catch((e) => {
    console.error('脚本执行失败：', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
    // webhookDispatcher 等模块可能另建了连接池，显式退出避免挂起
    process.exit(process.exitCode || 0);
  });

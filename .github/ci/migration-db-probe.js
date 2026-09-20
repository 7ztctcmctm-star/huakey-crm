#!/usr/bin/env node
/**
 * 手动诊断工具（**已不再接入 CI**）：migration-test 的「空心绿」取证
 *
 * 现状
 *   2026-09-20 本轮已用它定位并修复了根因，并把测试本身改成"环境就绪即大声失败"，
 *   故 CI 不再需要本工具（它会让该 job 耗时翻倍）。保留为手动排查工具。
 *
 * 何时再用
 *   - 怀疑「migration 往返用例其实没执行，但 job 是绿的」；
 *   - 迁移链（down/up 脚本）改动后想快速拿到首败版本与错误原文。
 *
 * 取证通道（为什么不用日志）
 *   `GET /actions/jobs/{id}/logs` 对本仓库恒为 403（Must have admin rights）。
 *   但 GitHub 的 **check-run 注解 API 不需要 admin**：
 *       GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations
 *   而 `::warning::` 工作流命令会生成 check-run 注解 ⇒ 把它作为 CI 步骤跑，
 *   即可在无 admin 的条件下把现场取回本地（注解 message 必须是单行纯文本）。
 *
 * ⚠️ 环境对齐（首次使用踩过的坑）
 *   ci.yml 里 jest 步骤的口令是**行内**环境变量（`DB_PASSWORD=x npx jest ...`），
 *   只作用于那一个 step、**不会传给后续 step** ⇒ 若把它当独立 step 跑，
 *   必须自带同样 env，否则复现的是「无口令」场景，结论无效（脚本内已加自检告警）。
 *
 * 安全约定
 *   - 本脚本**恒 exit 0**，只做诊断，绝不改变 job 结论（如接入 CI 需配 continue-on-error）。
 *   - 不打印任何口令。
 *   - ④⑤ 会在目标库上真做回滚/重放（破坏性）⇒ 只对一次性库使用。
 *   - 默认**不重复跑 jest**（实测 ~8 分钟）；需要时用 PROBE_RERUN_JEST=1 打开。
 *
 * 用法
 *   DB_NAME=huakey_crm_test DB_PASSWORD=<口令> node .github/ci/migration-db-probe.js
 */
'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')

// 与 ci.yml 的 jest 步骤保持一致（该步骤以行内环境变量传 DB_NAME / DB_PASSWORD）
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test'

/**
 * 输出一条 workflow 注解（会被 check-run 注解 API 取回）。
 * message 必须单行，且要转义 % / \r / \n。
 */
function emit (message) {
  const one = String(message).replace(/\r?\n/g, ' ⏎ ').slice(0, 900)
  const escaped = one.replace(/%/g, '%25')
  process.stdout.write(`::warning::[mig-probe] ${escaped}\n`)
}

/**
 * 跑一条命令并**捕获全部输出**（不因非零退出而抛出），返回 { status, out }。
 * 注意：jest 的汇总行写在 stderr ⇒ 命令统一追加 `2>&1`，否则会丢。
 */
function runCapture (cmd, opts = {}) {
  const wrapped = `${cmd} 2>&1`
  try {
    return { status: 0, out: execSync(wrapped, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
      timeout: 240000,
      ...opts,
    }) }
  } catch (e) {
    return { status: e.status === undefined ? 'signal/timeout' : e.status, out: String(e.stdout || '') }
  }
}

function checkTcp () {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    sock.setTimeout(3000)
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('error', () => resolve(false))
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
    sock.connect(DB_PORT, DB_HOST)
  })
}

/** 取「已标记为执行」的迁移版本数（回答「toRollback 有多少个」） */
async function countSchemaMigrations () {
  try {
    const mysql = require(path.join(ROOT, 'backend', 'node_modules', 'mysql2', 'promise'))
    const conn = await mysql.createConnection({
      host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME,
    })
    const [rows] = await conn.query('SELECT COUNT(*) AS n FROM schema_migrations')
    await conn.end()
    return `schema_migrations 已标记执行 = ${rows[0].n}`
  } catch (e) {
    return `schema_migrations 查询失败: ${e.message}`
  }
}

async function main () {
  emit(`env DB_HOST=${DB_HOST} DB_PORT=${DB_PORT} DB_USER=${DB_USER} DB_NAME=${DB_NAME} 口令已提供=${DB_PASSWORD ? 'yes' : 'no'}`)
  // 自检：本探针必须与真实 jest 步骤的 env 逐字一致，否则复现的是"无口令"场景，结论无效
  if (!DB_PASSWORD) {
    emit('⚠️ 未收到 DB_PASSWORD ⇒ 本次复现的是「无口令」场景，**结论不可用于判定真实步骤**；'
      + '请检查调用方 env（行内环境变量只作用于单个 step，不会传递给后续 step）')
  }

  // ① 连通性（beforeAll 第一步）
  emit(`① 端口可达 = ${await checkTcp()}`)

  // ② 复跑 jest 并取精确计数（jest 自身 JSON 结果，免疫文本噪音）
  //    实测这一步在"往返真跑"时要 ~8 分钟 ⇒ 默认关闭，按需用 PROBE_RERUN_JEST=1 打开
  if (process.env.PROBE_RERUN_JEST !== '1') {
    emit('② 跳过 jest 复跑（默认关闭，需 PROBE_RERUN_JEST=1）。'
      + '提示：测试已改为 CI 上「环境就绪即大声失败」⇒ job 的红/绿本身就是判据。')
  } else {
    const jsonFile = path.join(os.tmpdir(), 'mig-roundtrip-result.json')
    const jsonArg = ` --json --outputFile=${jsonFile}`
    const jest = runCapture(
      `npx jest tests/db/migration-roundtrip.test.js --forceExit --testTimeout=240000${jsonArg}`,
      {
        cwd: path.join(ROOT, 'backend'),
        env: { ...process.env, DB_NAME, DB_PASSWORD },
        timeout: 900000, // 往返真跑约 8 分钟，别用默认 240s（否则会被杀，得出"0 行跳过"的误导性读数）
      }
    )
    const jestOut = jest.out || ''

    let counts = 'JSON 结果不可读'
    try {
      const j = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
      counts = `suites=${j.numTotalTestSuites} tests=${j.numTotalTests} passed=${j.numPassedTests} pending=${j.numPendingTests} failed=${j.numFailedTests}`
    } catch (e) {
      counts = `JSON 结果不可读: ${e.message}`
    }
    emit(`② jest 复跑 exit=${jest.status} | ${counts}`)
    // jest 会把 console.warn 正文与「代码帧」都印出来 ⇒ 只数正文行，避免把 `> 198 | console.warn(...)` 也算进去
    const skipWarns = (jestOut.match(/^\s*\[migration-roundtrip\][^\n]*跳过[^\n]*$/gm) || []).length
    emit(`② 早退告警实测 = ${skipWarns} 行（= 55 个往返用例 + 1 处 beforeAll；`
      + '若 tests=56 且 pending=0 而本行不为 0 ⇒ 用例「通过」但并未执行）')
    const testsLine = (jestOut.match(/^Tests:.*$/m) || ['(无 Tests: 行)'])[0].trim()
    emit(`② jest 汇总: ${testsLine}`)
    // beforeAll 的真实失败原因（不可达 / 认证失败 / 迁移执行失败）
    const reason = jestOut.split('\n')
      .map((l) => l.trim())
      .find((l) => /^\[migration-roundtrip\].*(认证失败|迁移执行失败|迁移链执行失败|不可达)/.test(l))
    if (reason) emit(`② beforeAll 根因: ${reason}`)
  }

  // ③ 迁移账本
  emit(`③ ${await countSchemaMigrations()}`)

  // ④ 直接复现 beforeAll 的第三步：--rollback 002（破坏性，仅限一次性 CI 库）
  const rb = runCapture('node run_migrations.js --rollback 002', {
    cwd: path.join(ROOT, 'database', 'migrations'),
    env: { ...process.env, DB_HOST, DB_PORT: String(DB_PORT), DB_USER, DB_PASSWORD, DB_NAME },
  })
  const rbLines = (rb.out || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const rbFail = rbLines.find((l) => /✗/.test(l))
  const rbDone = rbLines.find((l) => /本次回滚了/.test(l))
  const rbPrep = rbLines.find((l) => /准备回滚/.test(l))
  emit(`④ run_migrations --rollback 002 exit=${rb.status}${rbPrep ? ` | ${rbPrep}` : ''}`)
  if (rbDone) emit(`④ ${rbDone}`)
  if (rbFail) emit(`④ 首败：${rbFail}`)
  if (!rbFail && !rbDone) rbLines.slice(-3).forEach((l) => emit(`④ tail: ${l}`))

  // ⑤ 若第四步成功，再复现 beforeAll 的第四步：全量重放
  if (rb.status === 0) {
    const up = runCapture('node run_migrations.js', {
      cwd: path.join(ROOT, 'database', 'migrations'),
      env: { ...process.env, DB_HOST, DB_PORT: String(DB_PORT), DB_USER, DB_PASSWORD, DB_NAME },
    })
    const upLines = (up.out || '').split('\n').map((l) => l.trim()).filter(Boolean)
    const upFail = upLines.find((l) => /✗|失败|出错/.test(l))
    emit(`⑤ run_migrations（全量重放）exit=${up.status}`)
    if (upFail) emit(`⑤ 首败：${upFail}`)
    else upLines.slice(-3).forEach((l) => emit(`⑤ tail: ${l}`))
  } else {
    emit('⑤ 跳过（第四步已失败，重放无意义）')
  }
}

main()
  .catch((e) => emit(`探针自身异常（不影响 job）: ${e && e.message}`))
  // 恒 exit 0：本脚本只诊断，不改变 job 结论
  .finally(() => process.exit(0))

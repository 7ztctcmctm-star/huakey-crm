/**
 * E2E 测试环境启动脚本
 *
 * 1. 运行数据库迁移
 * 2. 导入测试种子数据（admin 用户/角色/部门等）
 * 3. 执行角色权限初始化脚本
 * 4. 启动后端服务（测试数据库）
 * 5. 启动前端 dev server
 *
 * Playwright 测试结束后会通过 SIGTERM 终止本进程，本进程再级联终止子进程。
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')
const backendRoot = resolve(projectRoot, '../backend')
const databaseRoot = resolve(projectRoot, '../database')

// 让数据库迁移脚本等能解析到后端 node_modules 中的 mysql2
process.env.NODE_PATH = resolve(backendRoot, 'node_modules')

// mysql2 安装在后端目录，从前端脚本通过 createRequire 定位到后端 node_modules
const require = createRequire(resolve(backendRoot, 'package.json'))
const mysql = require('mysql2/promise')

// 强制使用测试数据库与测试友好配置，避免污染开发/生产数据
process.env.NODE_ENV = 'development'
process.env.SKIP_CAPTCHA = 'true'
process.env.DB_NAME = process.env.DB_NAME || 'huakey_crm_test'
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'
process.env.DB_PORT = process.env.DB_PORT || '3306'
// 优先读取环境变量中的 MySQL 凭据（如 CI/本地已配置 MYSQL_USER/MYSQL_PASSWORD）
process.env.DB_USER = process.env.DB_USER || process.env.MYSQL_USER || 'crm_test'
process.env.DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || 'test_pass'
process.env.REDIS_ENABLED = 'false'
process.env.ENABLE_SWAGGER = 'false'

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
  connectionLimit: 2
}

// E2E 测试是否清理测试库（默认开启，仅对以 _test 结尾的数据库名生效）
// CI 已提前导入 init-complete.sql，跳过数据库初始化
const SKIP_DB_SETUP = (process.env.SKIP_DB_SETUP || 'false').toLowerCase() === 'true'
const E2E_CLEAN_DB = (process.env.E2E_CLEAN_DB || 'true').toLowerCase() === 'true'
// 数据库管理账号（创建/删除库需要更高权限），默认回退到应用账号
const DB_ADMIN_USER = process.env.MYSQL_ROOT_USER || process.env.DB_USER
const DB_ADMIN_PASSWORD = process.env.MYSQL_ROOT_PASSWORD || process.env.DB_PASSWORD
// 源数据库（用于克隆到测试库），默认从测试库名去掉 _test 后缀推导
const SOURCE_DB = process.env.SOURCE_DB || (DB_CONFIG.database.toLowerCase().endsWith('_test')
  ? DB_CONFIG.database.slice(0, -5)
  : null)
// 是否使用迁移方式初始化（默认优先克隆源库）
const E2E_USE_MIGRATIONS = (process.env.E2E_USE_MIGRATIONS || 'false').toLowerCase() === 'true'

const children = []

function waitForPort(port, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    // Vite / Node 在 Windows 上可能监听 IPv6(::1) 或 IPv4(127.0.0.1)，都尝试
    const hosts = ['127.0.0.1', '::1']
    let hostIndex = 0

    const tryConnect = () => {
      const host = hosts[hostIndex]
      const socket = connect(port, host, () => {
        socket.end()
        resolve()
      })
      socket.on('error', () => {
        hostIndex = (hostIndex + 1) % hosts.length
        if (hostIndex === 0) {
          // 两个地址都试过一次
          if (Date.now() - start > timeout) {
            return reject(new Error(`端口 ${port} 在 ${timeout}ms 内未就绪`))
          }
        }
        setTimeout(tryConnect, 500)
      })
    }
    tryConnect()
  })
}

function exec(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`[e2e-server] 执行: ${cmd} ${args.join(' ')} (cwd: ${cwd})`)
    const proc = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env }
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`命令退出码 ${code}`))
    })
    proc.on('error', reject)
  })
}

async function ensureDatabase() {
  // 使用管理账号（root 或环境变量指定）先确保测试数据库存在
  const adminPool = await mysql.createPool({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_ADMIN_USER,
    password: DB_ADMIN_PASSWORD,
    multipleStatements: true,
    connectionLimit: 2
  })
  try {
    // 安全策略：仅当数据库名以 _test 结尾时才自动清理，避免误删生产/开发库
    const isTestDatabase = DB_CONFIG.database.toLowerCase().endsWith('_test')
    if (E2E_CLEAN_DB && isTestDatabase) {
      await adminPool.query(`DROP DATABASE IF EXISTS \`${DB_CONFIG.database}\``)
      console.log(`[e2e-server] 已清理旧测试数据库 ${DB_CONFIG.database}`)
    }
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log(`[e2e-server] 数据库 ${DB_CONFIG.database} 已就绪`)
  } finally {
    await adminPool.end()
  }
}

async function runMigrations() {
  // 在后端目录执行，以便 resolve 到后端 node_modules 中的 mysql2
  await exec('node', ['../database/migrations/run_migrations.js'], backendRoot)
}

async function runSeedSql(filePath) {
  const sql = readFileSync(filePath, 'utf8')
  // 移除 USE 语句，避免强制切换到固定数据库名
  const cleaned = sql.replace(/^USE\s+`?[^`;\s]+`?\s*;?\s*$/gim, '')
  if (!cleaned.trim()) return

  const pool = await mysql.createPool(DB_CONFIG)
  try {
    await pool.query(cleaned)
    console.log(`[e2e-server] 已导入 ${filePath}`)
  } finally {
    await pool.end()
  }
}

async function cloneDatabase() {
  if (!SOURCE_DB) {
    throw new Error('未配置 SOURCE_DB，无法克隆测试库。请设置 SOURCE_DB 或使用 E2E_USE_MIGRATIONS=true')
  }
  console.log(`[e2e-server] 从源库 ${SOURCE_DB} 克隆到 ${DB_CONFIG.database} ...`)

  const args = [
    '-h', DB_CONFIG.host,
    '-P', String(DB_CONFIG.port),
    '-u', DB_ADMIN_USER,
    `-p${DB_ADMIN_PASSWORD}`,
    SOURCE_DB
  ]

  await new Promise((resolve, reject) => {
    const dump = spawn('mysqldump', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const restore = spawn('mysql', [
      '-h', DB_CONFIG.host,
      '-P', String(DB_CONFIG.port),
      '-u', DB_ADMIN_USER,
      `-p${DB_ADMIN_PASSWORD}`,
      DB_CONFIG.database
    ], { stdio: ['pipe', 'inherit', 'inherit'] })

    dump.stdout.pipe(restore.stdin)

    let dumpErr = ''
    dump.stderr.on('data', (chunk) => { dumpErr += chunk })

    let finished = 0
    const checkFinish = (err) => {
      if (err) return reject(err)
      finished++
      if (finished === 2) {
        if (dumpErr && dumpErr.includes('error')) {
          return reject(new Error(`mysqldump 失败: ${dumpErr}`))
        }
        console.log(`[e2e-server] 克隆完成`)
        resolve()
      }
    }

    dump.on('close', (code) => {
      if (code !== 0) checkFinish(new Error(`mysqldump 退出码 ${code}: ${dumpErr}`))
      else checkFinish()
    })
    restore.on('close', (code) => {
      if (code !== 0) checkFinish(new Error(`mysql 导入退出码 ${code}`))
      else checkFinish()
    })
  })
}

async function initPermissions() {
  await exec('node', ['scripts/init_role_permissions.js'], backendRoot)
}

function startBackend() {
  console.log('[e2e-server] 启动后端服务...')
  const proc = spawn('npm', ['start'], {
    cwd: backendRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  })
  children.push(proc)
  return proc
}

function startFrontend() {
  console.log('[e2e-server] 启动前端 dev server...')
  const proc = spawn('npx', ['vite'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  })
  children.push(proc)
  return proc
}

function killChildren() {
  children.forEach((proc) => {
    try {
      if (!proc.killed) proc.kill('SIGTERM')
    } catch { /* ignore */ }
  })
}

process.on('SIGTERM', () => {
  console.log('[e2e-server] 收到 SIGTERM，正在终止子进程...')
  killChildren()
  setTimeout(() => process.exit(0), 1000)
})

process.on('SIGINT', () => {
  console.log('[e2e-server] 收到 SIGINT，正在终止子进程...')
  killChildren()
  setTimeout(() => process.exit(0), 1000)
})

async function main() {
  console.log(`[e2e-server] 目标数据库: ${DB_CONFIG.database}@${DB_CONFIG.host}:${DB_CONFIG.port}`)

  if (SKIP_DB_SETUP) {
    console.log('[e2e-server] SKIP_DB_SETUP=true，跳过数据库初始化（CI 已提前准备）')
  } else {
    await ensureDatabase()

    if (E2E_USE_MIGRATIONS) {
      console.log('[e2e-server] 使用迁移方式初始化测试库')
      await runMigrations()
    } else if (SOURCE_DB) {
      console.log(`[e2e-server] 使用克隆方式初始化测试库（源库: ${SOURCE_DB}）`)
      await cloneDatabase()
      console.log('[e2e-server] 克隆完成，正在运行迁移以应用缺失的 schema 变更...')
      await runMigrations()
    } else {
      throw new Error('未配置 SOURCE_DB 且 E2E_USE_MIGRATIONS=false，无法初始化测试库')
    }

    await runSeedSql(resolve(databaseRoot, 'seeds/seed_test_data.sql'))
    await initPermissions()
  }

  startBackend()
  await waitForPort(5000)
  console.log('[e2e-server] 后端服务已就绪 (http://localhost:5000)')

  startFrontend()
  await waitForPort(5173)
  console.log('[e2e-server] 前端 dev server 已就绪 (http://localhost:5173)')

  console.log('[e2e-server] E2E 测试环境就绪')
}

main().catch((err) => {
  console.error('[e2e-server] 启动失败:', err.message)
  killChildren()
  process.exit(1)
})

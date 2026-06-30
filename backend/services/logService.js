/**
 * 日志管理服务层
 * 处理 sys_log / sys_operation_log 双表并存清理等运维操作
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TARGET_TABLES = ['sys_log', 'sys_operation_log'];
const BACKEND_DIR = path.resolve(__dirname, '..');
// 清理工具自身文件不应视为业务代码引用
const EXCLUDED_FILES = new Set(['logService.js', 'cleanup_dual_logs.js']);

/**
 * 查询两表的使用情况（行数、最新记录时间）
 * @param {object} pool
 * @returns {object} { sys_log: { rows, latest }, sys_operation_log: { rows, latest } }
 */
async function queryTableUsage(pool) {
  const result = {};

  for (const table of TARGET_TABLES) {
    try {
      const [[rowCount]] = await pool.query(
        `SELECT COUNT(*) as cnt FROM \`${table}\``
      );
      const [[latestRow]] = await pool.query(
        `SELECT MAX(create_time) as latest FROM \`${table}\``
      );
      result[table] = {
        rows: parseInt(rowCount.cnt) || 0,
        latest: latestRow.latest || null
      };
    } catch (error) {
      // 表不存在时视为 0 行
      if (error.code === 'ER_NO_SUCH_TABLE') {
        result[table] = { rows: 0, latest: null, missing: true };
      } else {
        result[table] = { rows: 0, latest: null, error: error.message };
      }
    }
  }

  return result;
}

/**
 * 扫描代码中两表的引用次数
 * 优先使用 rg，不可用时降级为 Node.js 遍历扫描
 * @returns {object} { sys_log: { files, lines }, sys_operation_log: { files, lines } }
 */
function scanCodeReferences() {
  const result = {};

  try {
    for (const table of TARGET_TABLES) {
      const stdout = execSync(
        `rg "${table}" "${BACKEND_DIR}" --count`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      const lines = stdout.split('\n').filter(Boolean).filter(line => {
        const lastColon = line.lastIndexOf(':');
        const filePath = lastColon > -1 ? line.slice(0, lastColon) : line;
        return !EXCLUDED_FILES.has(path.basename(filePath));
      });
      const files = lines.length;
      const totalLines = lines.reduce((sum, line) => {
        const match = line.match(/:(\d+)$/);
        return sum + (match ? parseInt(match[1]) : 0);
      }, 0);
      result[table] = { files, lines: totalLines };
    }
  } catch {
    // rg 不可用（如 Windows 未安装），降级为 Node.js 扫描
    return scanCodeReferencesFallback();
  }

  return result;
}

/**
 * Node.js 遍历扫描 fallback
 */
function scanCodeReferencesFallback() {
  const result = {};

  for (const table of TARGET_TABLES) {
    result[table] = { files: 0, lines: 0 };
  }

  const codeExts = new Set(['.js', '.ts', '.sql', '.json', '.md']);

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'logs') continue;
        walk(fullPath);
      } else if (codeExts.has(path.extname(entry.name)) && !EXCLUDED_FILES.has(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const table of TARGET_TABLES) {
          const matches = content.match(new RegExp(table, 'g'));
          if (matches) {
            result[table].lines += matches.length;
            result[table].files += 1;
          }
        }
      }
    }
  }

  walk(BACKEND_DIR);
  return result;
}

/**
 * 清理双表并存问题
 * @param {object} pool
 * @param {object} usage - queryTableUsage 结果
 * @returns {object} { dropped, skipped, message }
 */
async function cleanupDualLogs(pool, usage) {
  const opUsage = usage.sys_operation_log || { rows: 0 };
  const logUsage = usage.sys_log || { rows: 0 };

  // 先扫描代码引用
  const refs = scanCodeReferences();

  // 情况1：sys_operation_log 为空且无代码引用，安全删除
  if (opUsage.rows === 0 && refs.sys_operation_log.files === 0) {
    await pool.query('DROP TABLE IF EXISTS `sys_operation_log`');
    return {
      dropped: true,
      skipped: false,
      message: '已删除空表 sys_operation_log',
      refs
    };
  }

  // 情况2：两表都有数据，提示人工合并
  if (opUsage.rows > 0 && logUsage.rows > 0) {
    return {
      dropped: false,
      skipped: true,
      message: `sys_log(${logUsage.rows} 行) 和 sys_operation_log(${opUsage.rows} 行) 均有数据，建议人工合并后再删除废弃表`,
      refs,
      usage
    };
  }

  // 情况3：sys_operation_log 有数据但有代码引用（理论上不应出现）
  if (opUsage.rows > 0) {
    return {
      dropped: false,
      skipped: true,
      message: `sys_operation_log 仍有 ${opUsage.rows} 行数据，暂不删除`,
      refs,
      usage
    };
  }

  // 情况4：sys_operation_log 为空但有代码引用（理论上不应出现，因无引用）
  return {
    dropped: false,
    skipped: true,
    message: 'sys_operation_log 为空，但代码中仍有引用，请检查后再删除',
    refs
  };
}

module.exports = {
  queryTableUsage,
  scanCodeReferences,
  cleanupDualLogs
};

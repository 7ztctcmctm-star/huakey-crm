/**
 * 备份路由服务层
 * 从 routes/backup.js 提取的业务逻辑，供路由层复用
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const backupDir = process.env.BACKUP_DIR || '/app/data/backups';

// 确保备份目录存在
try {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
} catch (e) {
  console.warn('无法创建备份目录 (可能是只读环境):', e.message);
}

/**
 * 创建备份
 * @param {object} pool
 * @param {number} userId - 操作人ID
 * @returns {{ id: number, file_name: string }}
 */
async function createBackup(pool, userId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `huakey_crm_full_${timestamp}.sql`;
  const filePath = path.join(backupDir, fileName);

  const [insertResult] = await pool.query(
    'INSERT INTO sys_backup_record (backup_type, file_name, file_path, status, create_by) VALUES (?, ?, ?, ?, ?)',
    ['full', fileName, filePath, 'running', userId]
  );
  const backupId = insertResult.insertId;

  const dbUser = process.env.DB_USER || 'crm_user';
  const dbPass = process.env.DB_PASSWORD;
  if (!dbPass) {
    const err = new Error('数据库密码未配置');
    err.code = 500;
    throw err;
  }
  const dbName = process.env.DB_NAME || 'huakey_crm';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '3306';

  const writeStream = fs.createWriteStream(filePath);
  execFile(
    'mysqldump',
    ['-u', dbUser, `-p${dbPass}`, '-h', dbHost, '-P', dbPort, '--single-transaction', '--routines', '--triggers', dbName],
    { maxBuffer: 100 * 1024 * 1024 },
    async (error, stdout) => {
      try {
        if (error) {
          await pool.query(
            'UPDATE sys_backup_record SET status = ?, error_msg = ? WHERE id = ?',
            ['failed', error.message, backupId]
          );
          return;
        }
        writeStream.write(stdout);
        writeStream.end();
        const fileSize = fs.statSync(filePath).size;
        await pool.query(
          'UPDATE sys_backup_record SET status = ?, file_size = ? WHERE id = ?',
          ['success', fileSize, backupId]
        );
      } catch (err) {
        console.error('[备份] 更新备份记录失败:', err);
      }
    }
  );

  return { id: backupId, file_name: fileName };
}

/**
 * 获取备份列表
 * @param {object} pool
 * @param {object} params - { page, pageSize }
 * @returns {{ list: Array, total: number }}
 */
async function listBackups(pool, params = {}) {
  const { page = 1, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;

  const [countResult] = await pool.query('SELECT COUNT(*) as total FROM sys_backup_record');
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT b.*, u.real_name as create_by_name
     FROM sys_backup_record b
     LEFT JOIN sys_user u ON b.create_by = u.id
     ORDER BY b.create_time DESC
     LIMIT ? OFFSET ?`,
    [parseInt(pageSize), parseInt(offset)]
  );

  return { list: rows, total };
}

/**
 * 生成备份恢复确认码
 * @param {number|string} id
 * @returns {string}
 */
function getConfirmCode(id) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(`backup-restore-${id}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * 恢复备份
 * @param {object} pool
 * @param {number|string} id
 * @param {string} confirmCode
 */
async function restoreBackup(pool, id, confirmCode) {
  const expectedCode = getConfirmCode(id);
  if (!confirmCode || confirmCode !== expectedCode) {
    const err = new Error('确认码不正确，恢复操作已拒绝');
    err.code = 400;
    throw err;
  }

  const [records] = await pool.query('SELECT * FROM sys_backup_record WHERE id = ? AND status = ?', [id, 'success']);
  if (records.length === 0) {
    const err = new Error('备份记录不存在或备份未完成');
    err.code = 404;
    throw err;
  }

  const backup = records[0];
  if (!fs.existsSync(backup.file_path)) {
    const err = new Error('备份文件不存在');
    err.code = 404;
    throw err;
  }

  const dbUser = process.env.DB_USER || 'crm_user';
  const dbPass = process.env.DB_PASSWORD;
  if (!dbPass) {
    const err = new Error('数据库密码未配置');
    err.code = 500;
    throw err;
  }
  const dbName = process.env.DB_NAME || 'huakey_crm';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '3306';

  const sqlContent = fs.readFileSync(backup.file_path, 'utf8');

  execFile(
    'mysql',
    ['-u', dbUser, `-p${dbPass}`, '-h', dbHost, '-P', dbPort, dbName],
    { maxBuffer: 100 * 1024 * 1024 },
    async (error) => {
      try {
        if (error) {
          await pool.query(
            'UPDATE sys_backup_record SET restore_status = ?, restore_error = ? WHERE id = ?',
            ['failed', error.message, id]
          );
          console.error('[备份] 恢复备份失败:', error.message);
        } else {
          await pool.query(
            'UPDATE sys_backup_record SET restore_status = ? WHERE id = ?',
            ['success', id]
          );
        }
      } catch (err) {
        console.error('[备份] 更新恢复记录失败:', err);
      }
    }
  ).stdin.end(sqlContent);
}

/**
 * 删除备份
 * @param {object} pool
 * @param {number|string} id
 */
async function deleteBackup(pool, id) {
  const [records] = await pool.query('SELECT * FROM sys_backup_record WHERE id = ?', [id]);
  if (records.length === 0) {
    const err = new Error('备份记录不存在');
    err.code = 404;
    throw err;
  }

  const backup = records[0];
  if (fs.existsSync(backup.file_path)) {
    fs.unlinkSync(backup.file_path);
  }

  await pool.query('DELETE FROM sys_backup_record WHERE id = ?', [id]);
}

module.exports = {
  createBackup,
  listBackups,
  getConfirmCode,
  restoreBackup,
  deleteBackup
};

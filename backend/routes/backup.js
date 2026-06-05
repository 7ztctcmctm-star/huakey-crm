const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const requireAdmin = (req, res, next) => {
  if (!req.user.manageAll && req.user.roleId !== 1) {
    return res.status(403).json({ code: 403, message: '无权限操作', data: null });
  }
  next();
};

const backupDir = path.join(__dirname, '../backups');

// 确保备份目录存在（Vercel 只读文件系统上静默跳过）
try {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
} catch(e) {
  console.warn('无法创建备份目录 (可能是只读环境):', e.message);
}

// 创建备份
router.post('/create', authenticateToken, checkPermission('backup:create'), requireAdmin, async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `huakey_crm_full_${timestamp}.sql`;
  const filePath = path.join(backupDir, fileName);

  // 记录备份开始
  const [insertResult] = await pool.query(
    'INSERT INTO sys_backup_record (backup_type, file_name, file_path, status, create_by) VALUES (?, ?, ?, ?, ?)',
    ['full', fileName, filePath, 'running', req.user.userId]
  );
  const backupId = insertResult.insertId;

  const dbUser = process.env.DB_USER || 'crm_user';
  const dbPass = process.env.DB_PASSWORD || 'Huakey@2024';
  const dbName = process.env.DB_NAME || 'huakey_crm';

  const command = `mysqldump -u ${dbUser} -p${dbPass} ${dbName} --single-transaction --routines --triggers > "${filePath}"`;

  exec(command, async (error) => {
    try {
      if (error) {
        await pool.query(
          'UPDATE sys_backup_record SET status = ?, error_msg = ? WHERE id = ?',
          ['failed', error.message, backupId]
        );
        return;
      }

      const fileSize = fs.statSync(filePath).size;
      await pool.query(
        'UPDATE sys_backup_record SET status = ?, file_size = ? WHERE id = ?',
        ['success', fileSize, backupId]
      );
    } catch (error) {
      console.error('[备份] 更新备份记录失败:', error);
    }
  });

  // 立即返回，备份在后台执行
  res.json({
    code: 200,
    message: '备份任务已创建，正在后台执行',
    data: { id: backupId, file_name: fileName }
  });
});

// 获取备份列表
router.post('/list', authenticateToken, checkPermission('backup:create'), async (req, res) => {
  const { page = 1, pageSize = 20 } = req.body;
  const offset = (page - 1) * pageSize;

  try {
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

    res.json({
      code: 200,
      message: '查询成功',
      data: { list: rows, total }
    });
  } catch (error) {
    console.error('[备份] 查询备份列表失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 恢复备份
router.post('/restore', authenticateToken, checkPermission('backup:restore'), requireAdmin, async (req, res) => {
  const { id } = req.body;

  try {
    const [records] = await pool.query('SELECT * FROM sys_backup_record WHERE id = ? AND status = ?', [id, 'success']);
    if (records.length === 0) {
      return res.status(404).json({ code: 404, message: '备份记录不存在或备份未完成', data: null });
    }

    const backup = records[0];
    if (!fs.existsSync(backup.file_path)) {
      return res.status(404).json({ code: 404, message: '备份文件不存在', data: null });
    }

    const dbUser = process.env.DB_USER || 'crm_user';
    const dbPass = process.env.DB_PASSWORD || 'Huakey@2024';
    const dbName = process.env.DB_NAME || 'huakey_crm';

    const command = `mysql -u ${dbUser} -p${dbPass} ${dbName} < "${backup.file_path}"`;

    exec(command, (error) => {
      if (error) {
        console.error('[备份] 恢复备份失败:', error);
      }
    });

    res.json({ code: 200, message: '恢复任务已执行', data: null });
  } catch (error) {
    console.error('[备份] 恢复备份失败:', error);
    res.status(500).json({ code: 500, message: '恢复失败', data: null });
  }
});

// 删除备份文件
router.post('/delete', authenticateToken, checkPermission('backup:create'), requireAdmin, async (req, res) => {
  const { id } = req.body;

  try {
    const [records] = await pool.query('SELECT * FROM sys_backup_record WHERE id = ?', [id]);
    if (records.length === 0) {
      return res.status(404).json({ code: 404, message: '备份记录不存在', data: null });
    }

    const backup = records[0];
    if (fs.existsSync(backup.file_path)) {
      fs.unlinkSync(backup.file_path);
    }

    await pool.query('DELETE FROM sys_backup_record WHERE id = ?', [id]);
    res.json({ code: 200, message: '备份已删除', data: null });
  } catch (error) {
    console.error('[备份] 删除备份失败:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;

/**
 * 数据库定时备份脚本
 * 用法: node backend/scripts/backup.js
 * 可配合 crontab 定时执行: 0 2 * * * cd /path/to/backend && node scripts/backup.js
 */
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 数据库配置
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'crm_user';
const DB_PASS = process.env.DB_PASSWORD || 'Huakey@2024';
const DB_NAME = process.env.DB_NAME || 'huakey_crm';

// 备份目录
const backupDir = path.join(__dirname, '../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 清理过期备份（保留最近7天）
const RETENTION_DAYS = 7;

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `huakey_crm_auto_${timestamp}.sql`;
  const filePath = path.join(backupDir, fileName);

  const command = `mysqldump -u ${DB_USER} -p${DB_PASS} -h ${DB_HOST} -P ${DB_PORT} ${DB_NAME} --single-transaction --routines --triggers > "${filePath}"`;

  console.log(`[备份] 开始创建备份: ${fileName}`);

  return new Promise((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        console.error('[备份] 备份失败:', error.message);
        reject(error);
        return;
      }

      const fileSize = fs.statSync(filePath).size;
      console.log(`[备份] 备份成功: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      resolve({ fileName, filePath, fileSize });
    });
  });
}

function cleanOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('huakey_crm_') && f.endsWith('.sql'));

  let cleaned = 0;
  for (const file of files) {
    const filePath = path.join(backupDir, file);
    const stat = fs.statSync(filePath);
    if (stat.mtime.getTime() < cutoff) {
      fs.unlinkSync(filePath);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[备份] 已清理 ${cleaned} 个过期备份`);
  }
}

async function main() {
  try {
    await createBackup();
    cleanOldBackups();
    console.log('[备份] 定时备份完成');
  } catch (error) {
    console.error('[备份] 定时备份失败:', error.message);
    process.exit(1);
  }
}

main();

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'huakey_crm',
  backupDir: process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'),
  keepDays: parseInt(process.env.BACKUP_KEEP_DAYS) || 30,
  compress: process.env.COMPRESS_BACKUP === 'true'
};

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function ensureBackupDir() {
  if (!fs.existsSync(CONFIG.backupDir)) {
    fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    log(`创建备份目录: ${CONFIG.backupDir}`);
  }
}

function getBackupFilename() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `${CONFIG.database}_${dateStr}_${timeStr}`;
}

async function backupDatabase() {
  const filename = getBackupFilename();
  const sqlFile = path.join(CONFIG.backupDir, `${filename}.sql`);
  const zipFile = path.join(CONFIG.backupDir, `${filename}.zip`);

  const env = {
    ...process.env,
    MYSQL_PWD: CONFIG.password
  };

  const mysqldumpArgs = [
    '-h', CONFIG.host,
    '-P', CONFIG.port.toString(),
    '-u', CONFIG.user,
    `--single-transaction`,
    `--quick`,
    `--lock-tables=false`,
    `--routines`,
    `--triggers`,
    `--events`,
    CONFIG.database
  ];

  log(`开始备份数据库: ${CONFIG.database}`);

  return new Promise((resolve, reject) => {
    const dumpProcess = spawn('mysqldump', mysqldumpArgs, {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const writeStream = fs.createWriteStream(sqlFile);
    let stderr = '';

    dumpProcess.stdout.pipe(writeStream);
    dumpProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    dumpProcess.on('close', async (code) => {
      writeStream.end();

      if (code !== 0) {
        log(`备份失败: ${stderr}`, 'ERROR');
        fs.unlink(sqlFile, () => {});
        return reject(new Error(`mysqldump exited with code ${code}`));
      }

      try {
        const stats = fs.statSync(sqlFile);
        log(`SQL文件创建成功: ${sqlFile} (${formatBytes(stats.size)})`);

        if (CONFIG.compress) {
          await compressFile(sqlFile, zipFile);
          fs.unlink(sqlFile, () => {});
          const zipStats = fs.statSync(zipFile);
          log(`压缩文件创建成功: ${zipFile} (${formatBytes(zipStats.size)})`);
          await cleanupOldBackups('.zip');
        } else {
          await cleanupOldBackups('.sql');
        }

        resolve({ sqlFile, zipFile: CONFIG.compress ? zipFile : null });
      } catch (err) {
        reject(err);
      }
    });

    dumpProcess.on('error', (err) => {
      writeStream.end();
      log(`启动mysqldump失败: ${err.message}`, 'ERROR');
      reject(err);
    });
  });
}

async function compressFile(inputFile, outputFile) {
  const { createGzip } = require('zlib');
  const { pipeline } = require('stream');
  const { createReadStream, createWriteStream } = require('fs');
  const { promisify } = require('util');

  const pipelineAsync = promisify(pipeline);

  return new Promise((resolve, reject) => {
    const gzip = createGzip();
    const source = createReadStream(inputFile);
    const destination = createWriteStream(outputFile);

    pipelineAsync(source, gzip, destination)
      .then(resolve)
      .catch(reject);
  });
}

async function cleanupOldBackups(extension) {
  if (CONFIG.keepDays <= 0) return;

  log(`正在清理 ${CONFIG.keepDays} 天前的备份文件...`);

  const files = fs.readdirSync(CONFIG.backupDir)
    .filter(f => f.endsWith(extension) && f.startsWith(CONFIG.database))
    .map(f => ({
      name: f,
      path: path.join(CONFIG.backupDir, f),
      mtime: fs.statSync(path.join(CONFIG.backupDir, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.keepDays);

  let deletedCount = 0;
  for (const file of files) {
    if (file.mtime < cutoffDate) {
      fs.unlinkSync(file.path);
      log(`已删除过期备份: ${file.name}`);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    log(`已清理 ${deletedCount} 个过期备份文件`);
  }
}

async function listBackups() {
  const files = fs.readdirSync(CONFIG.backupDir)
    .filter(f => f.startsWith(CONFIG.database) && (f.endsWith('.sql') || f.endsWith('.zip')))
    .map(f => {
      const filepath = path.join(CONFIG.backupDir, f);
      const stats = fs.statSync(filepath);
      return {
        name: f,
        path: filepath,
        size: formatBytes(stats.size),
        mtime: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

  console.log('\n数据库备份文件列表:');
  console.log('=' .repeat(70));
  console.log('文件名'.padEnd(40) + '大小'.padStart(15) + '创建时间'.padEnd(20));
  console.log('-'.repeat(70));

  for (const file of files) {
    const time = new Date(file.mtime).toLocaleString('zh-CN');
    console.log(file.name.padEnd(40) + file.size.padStart(15) + time.padEnd(20));
  }

  console.log('=' .repeat(70));
  console.log(`共 ${files.length} 个备份文件\n`);
}

async function main() {
  console.log('\n==========================================');
  console.log('  华科CRM数据库备份工具');
  console.log('==========================================\n');

  try {
    await ensureBackupDir();

    const args = process.argv.slice(2);
    if (args.includes('--list')) {
      await listBackups();
      return;
    }

    await backupDatabase();

    console.log('\n==========================================');
    console.log('  备份完成！');
    console.log('==========================================\n');

  } catch (error) {
    log(`备份失败: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { backupDatabase, listBackups, cleanupOldBackups };
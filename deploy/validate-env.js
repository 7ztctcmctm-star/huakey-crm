/**
 * 生产部署前环境变量安全校验脚本
 *
 * 使用方式：
 *   1) 直接读取 .env 文件校验：node deploy/validate-env.js
 *   2) 校验当前环境变量：node deploy/validate-env.js --no-env-file
 *
 * 校验不通过时以非 0 退出码结束，便于 CI/CD 或部署脚本拦截。
 */

const fs = require('fs');
const path = require('path');

const useEnvFile = !process.argv.includes('--no-env-file');

function loadEnv() {
  if (!useEnvFile) {
    return process.env;
  }

  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`FATAL: 未找到 .env 文件: ${envPath}`);
    console.error('请复制 .env.example 为 .env 并填写真实值，或使用 --no-env-file 校验当前环境变量');
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.substring(0, idx).trim();
    const value = trimmed.substring(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function validateEnv(env) {
  const errors = [];
  const warnings = [];

  function fatal(message) {
    errors.push(`FATAL: ${message}`);
  }

  function warn(message) {
    warnings.push(`WARN: ${message}`);
  }

  function get(key) {
    return env[key] || '';
  }

  // 1. 运行环境
  if (get('NODE_ENV') !== 'production') {
    fatal('NODE_ENV 必须为 production');
  }

  // 2. CORS 来源
  const corsOrigin = get('CORS_ORIGIN');
  if (!corsOrigin) {
    fatal('CORS_ORIGIN 必须设置为真实生产域名');
  } else if (corsOrigin.includes('localhost') || corsOrigin.includes('127.0.0.1')) {
    fatal('CORS_ORIGIN 不能设置为 localhost 或 127.0.0.1');
  } else if (corsOrigin === '__YOUR_PRODUCTION_DOMAIN__' || corsOrigin === '*') {
    fatal('CORS_ORIGIN 必须使用真实生产域名，不能为占位符或 *');
  }

  // 3. 验证码
  if (get('SKIP_CAPTCHA') === 'true') {
    fatal('生产环境禁止设置 SKIP_CAPTCHA=true');
  }

  // 4. Swagger
  if (get('ENABLE_SWAGGER') === 'true') {
    fatal('生产环境禁止设置 ENABLE_SWAGGER=true');
  }

  // 5. Redis（验证码、权限缓存、限流依赖 Redis）
  if (get('REDIS_ENABLED') !== 'true') {
    fatal('生产环境 REDIS_ENABLED 必须设置为 true');
  }

  // 6. JWT Secret
  const jwtSecret = get('JWT_SECRET');
  if (!jwtSecret) {
    fatal('JWT_SECRET 必须设置');
  } else if (!/^[a-f0-9]{128}$/i.test(jwtSecret)) {
    fatal('JWT_SECRET 必须是 64 字节随机十六进制字符串（128 字符）');
  }

  // 7. 数据库密码
  const dbPassword = get('DB_PASSWORD');
  if (!dbPassword || dbPassword === '__CHANGE_ME__') {
    fatal('DB_PASSWORD 必须设置为强密码，不能为占位符');
  }

  const mysqlRootPassword = get('MYSQL_ROOT_PASSWORD');
  if (!mysqlRootPassword || mysqlRootPassword === '__CHANGE_ME__') {
    fatal('MYSQL_ROOT_PASSWORD 必须设置为强密码，不能为占位符');
  }

  // 8. Webhook（可选配置）
  const webhookUrl = get('WECHAT_WEBHOOK_URL');
  if (webhookUrl) {
    // 仅当配置了 Webhook 时才校验，允许为空表示不启用企业微信告警
    if (webhookUrl.includes('__YOUR_WEBHOOK_URL__') || webhookUrl.includes('example.com')) {
      fatal('WECHAT_WEBHOOK_URL 若配置则不能使用占位符');
    }
  }

  // 9. 端口
  const port = parseInt(get('PORT') || '5000', 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    fatal('PORT 必须是有效端口号');
  }

  // 10. 弱密码检查（基础）
  const weakPatterns = ['123456', 'password', 'admin', 'huakey', 'qwerty', 'abc123'];
  const passwordsToCheck = [
    { name: 'DB_PASSWORD', value: dbPassword },
    { name: 'MYSQL_ROOT_PASSWORD', value: mysqlRootPassword }
  ];
  for (const { name, value } of passwordsToCheck) {
    if (!value) continue;
    const lower = value.toLowerCase();
    if (value.length < 12) {
      warn(`${name} 建议长度 ≥ 12 位`);
    }
    for (const pattern of weakPatterns) {
      if (lower.includes(pattern)) {
        warn(`${name} 包含常见弱密码模式: ${pattern}`);
      }
    }
  }

  return { errors, warnings };
}

function runValidation() {
  const env = loadEnv();
  const { errors, warnings } = validateEnv(env);

  console.log('========================================');
  console.log('Huakey CRM 生产环境部署校验');
  console.log('========================================');

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ 所有校验项通过，可以部署');
    process.exit(0);
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  警告（建议修复）：');
    for (const w of warnings) {
      console.log(`  ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log('\n❌ 错误（必须修复后才能部署）：');
    for (const e of errors) {
      console.log(`  ${e}`);
    }
    process.exit(1);
  }

  console.log('\n✅ 必填项通过，但存在警告');
  process.exit(0);
}

// 直接运行时执行校验；被引用时导出函数供测试
if (require.main === module) {
  runValidation();
}

module.exports = { loadEnv, validateEnv, runValidation };

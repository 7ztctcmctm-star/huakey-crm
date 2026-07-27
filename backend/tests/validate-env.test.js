/**
 * 生产环境部署校验脚本单元测试
 */

const { validateEnv } = require('../../deploy/validate-env');

function makeValidEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://crm.huakey.com',
    SKIP_CAPTCHA: 'false',
    ENABLE_SWAGGER: 'false',
    REDIS_ENABLED: 'true',
    JWT_SECRET: 'a'.repeat(128),
    DB_PASSWORD: 'StrongP@ssw0rd!2026',
    MYSQL_ROOT_PASSWORD: 'RootP@ssw0rd!2026',
    WECHAT_WEBHOOK_URL: '',
    PORT: '5000',
    ...overrides
  };
}

describe('validateEnv 生产环境校验', () => {
  it('全部合法配置应通过', () => {
    const { errors, warnings } = validateEnv(makeValidEnv());
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('NODE_ENV 非 production 应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ NODE_ENV: 'development' }));
    expect(errors).toContainEqual(expect.stringContaining('NODE_ENV'));
  });

  it('CORS_ORIGIN 为 localhost 应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ CORS_ORIGIN: 'http://localhost:5173' }));
    expect(errors).toContainEqual(expect.stringContaining('CORS_ORIGIN'));
  });

  it('CORS_ORIGIN 为 * 应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ CORS_ORIGIN: '*' }));
    expect(errors).toContainEqual(expect.stringContaining('CORS_ORIGIN'));
  });

  it('CORS_ORIGIN 为占位符应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ CORS_ORIGIN: '__YOUR_PRODUCTION_DOMAIN__' }));
    expect(errors).toContainEqual(expect.stringContaining('CORS_ORIGIN'));
  });

  it('SKIP_CAPTCHA=true 应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ SKIP_CAPTCHA: 'true' }));
    expect(errors).toContainEqual(expect.stringContaining('SKIP_CAPTCHA'));
  });

  it('ENABLE_SWAGGER=true 应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ ENABLE_SWAGGER: 'true' }));
    expect(errors).toContainEqual(expect.stringContaining('ENABLE_SWAGGER'));
  });

  it('REDIS_ENABLED=false 应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ REDIS_ENABLED: 'false' }));
    expect(errors).toContainEqual(expect.stringContaining('REDIS_ENABLED'));
  });

  it('JWT_SECRET 为空应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ JWT_SECRET: '' }));
    expect(errors).toContainEqual(expect.stringContaining('JWT_SECRET'));
  });

  it('JWT_SECRET 长度不足应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ JWT_SECRET: 'a'.repeat(64) }));
    expect(errors).toContainEqual(expect.stringContaining('JWT_SECRET'));
  });

  it('DB_PASSWORD 为占位符应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ DB_PASSWORD: '__CHANGE_ME__' }));
    expect(errors).toContainEqual(expect.stringContaining('DB_PASSWORD'));
  });

  it('MYSQL_ROOT_PASSWORD 为空应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ MYSQL_ROOT_PASSWORD: '' }));
    expect(errors).toContainEqual(expect.stringContaining('MYSQL_ROOT_PASSWORD'));
  });

  it('WECHAT_WEBHOOK_URL 为占位符应报错', () => {
    const { errors } = validateEnv(makeValidEnv({ WECHAT_WEBHOOK_URL: '__YOUR_WEBHOOK_URL__' }));
    expect(errors).toContainEqual(expect.stringContaining('WECHAT_WEBHOOK_URL'));
  });

  it('弱密码应产生警告', () => {
    const { warnings } = validateEnv(makeValidEnv({
      DB_PASSWORD: '123456',
      MYSQL_ROOT_PASSWORD: 'admin'
    }));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.includes('123456'))).toBe(true);
    expect(warnings.some(w => w.includes('admin'))).toBe(true);
  });

  it('短密码应产生警告', () => {
    const { warnings } = validateEnv(makeValidEnv({
      DB_PASSWORD: 'Short1!',
      MYSQL_ROOT_PASSWORD: 'Short2!'
    }));
    expect(warnings.some(w => w.includes('≥ 12 位'))).toBe(true);
  });
});

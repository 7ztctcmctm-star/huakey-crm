/**
 * drill-alerts.js 单元测试
 */

const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  parseArgs,
  validateEnvForLive,
  runErrorAlertDrill,
  runSlowQueryDrill
} = require('../scripts/drill-alerts');

// 模拟 slowQuery 和 database，避免真实数据库连接
jest.mock('../config/slowQuery', () => ({}), { virtual: true });

jest.mock('../config/database', () => {
  const fn = jest.fn();
  fn.query = jest.fn();
  return fn;
}, { virtual: true });

// 模拟 alert.js
jest.mock('../utils/alert', () => ({
  record500Error: jest.fn()
}));

// 模拟 notification.js（dry-run 下会被替换）
jest.mock('../utils/notification', () => ({
  sendMarkdown: jest.fn(),
  sendEmailAlert: jest.fn()
}));

const { record500Error } = require('../utils/alert');
const mockQuery = require('../config/database');

describe('drill-alerts.js', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockQuery.query.mockReset();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('parseArgs', () => {
    it('默认返回 dry-run 模式', () => {
      const args = parseArgs([]);
      expect(args.live).toBe(false);
      expect(args.skipSlow).toBe(false);
      expect(args.skipError).toBe(false);
      expect(args.help).toBe(false);
    });

    it('解析 --live', () => {
      const args = parseArgs(['--live']);
      expect(args.live).toBe(true);
    });

    it('解析 --skip-slow 和 --skip-error', () => {
      const args = parseArgs(['--skip-slow', '--skip-error']);
      expect(args.skipSlow).toBe(true);
      expect(args.skipError).toBe(true);
    });

    it('解析 --help', () => {
      const args = parseArgs(['--help']);
      expect(args.help).toBe(true);
    });
  });

  describe('validateEnvForLive', () => {
    it('合法配置返回 null', () => {
      const result = validateEnvForLive({
        ALERT_ENABLED: 'true',
        WECHAT_WEBHOOK_URL: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx'
      });
      expect(result).toBeNull();
    });

    it('ALERT_ENABLED 不为 true 返回错误', () => {
      const result = validateEnvForLive({
        ALERT_ENABLED: 'false',
        WECHAT_WEBHOOK_URL: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx'
      });
      expect(result).toContain('ALERT_ENABLED');
    });

    it('WECHAT_WEBHOOK_URL 为空返回错误', () => {
      const result = validateEnvForLive({
        ALERT_ENABLED: 'true',
        WECHAT_WEBHOOK_URL: ''
      });
      expect(result).toContain('WECHAT_WEBHOOK_URL');
    });
  });

  describe('loadEnv', () => {
    const envPath = path.resolve(__dirname, '..', '..', '.env');
    let envExists = false;
    let originalContent = '';

    beforeAll(() => {
      envExists = fs.existsSync(envPath);
      if (envExists) {
        originalContent = fs.readFileSync(envPath, 'utf-8');
      }
    });

    afterAll(() => {
      if (envExists) {
        fs.writeFileSync(envPath, originalContent, 'utf-8');
      }
    });

    it('从 .env 加载变量（不覆盖已存在变量）', () => {
      fs.writeFileSync(envPath, 'DRILL_TEST_KEY=loaded_value\n', 'utf-8');
      process.env.DRILL_TEST_KEY = 'existing_value';
      loadEnv();
      expect(process.env.DRILL_TEST_KEY).toBe('existing_value');
      delete process.env.DRILL_TEST_KEY;
    });

    it('.env 不存在时不抛出异常', () => {
      expect(() => loadEnv()).not.toThrow();
    });
  });

  describe('runErrorAlertDrill', () => {
    it('调用 11 次 record500Error', async () => {
      await runErrorAlertDrill();
      expect(record500Error).toHaveBeenCalledTimes(11);
    });
  });

  describe('runSlowQueryDrill', () => {
    it('数据库连接成功时执行 SELECT SLEEP(2)', async () => {
      mockQuery.query
        .mockResolvedValueOnce([[{ 1: 1 }]]) // SELECT 1
        .mockResolvedValueOnce([[{ 0: 0 }]]); // SELECT SLEEP(2)

      await runSlowQueryDrill();

      expect(mockQuery.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockQuery.query).toHaveBeenCalledWith('SELECT SLEEP(2)');
    });

    it('数据库连接失败时抛出友好错误', async () => {
      mockQuery.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(runSlowQueryDrill()).rejects.toThrow('数据库连接失败');
    });
  });
});

/**
 * alert 单元测试
 */

process.env.ALERT_ENABLED = 'true';

jest.mock('../../utils/notification', () => ({
  sendMarkdown: jest.fn().mockResolvedValue(undefined),
  sendEmailAlert: jest.fn().mockResolvedValue(undefined)
}));

function loadAlert() {
  jest.resetModules();
  return require('../../utils/alert');
}

describe('alert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('record500Error', () => {
    it('未达到阈值时不应触发告警', () => {
      const { record500Error } = loadAlert();
      for (let i = 0; i < 9; i++) {
        record500Error();
      }
      const notification = require('../../utils/notification');
      expect(notification.sendMarkdown).not.toHaveBeenCalled();
    });

    it('达到 10 次时应触发告警', () => {
      const { record500Error } = loadAlert();
      for (let i = 0; i < 10; i++) {
        record500Error();
      }
      const notification = require('../../utils/notification');
      expect(notification.sendMarkdown).toHaveBeenCalledTimes(1);
      const markdown = notification.sendMarkdown.mock.calls[0][0];
      expect(markdown).toContain('critical');
      expect(markdown).toContain('10 次');
    });

    it('阈值触发后应避免重复告警', () => {
      const { record500Error } = loadAlert();
      for (let i = 0; i < 15; i++) {
        record500Error();
      }
      const notification = require('../../utils/notification');
      expect(notification.sendMarkdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('alertError', () => {
    it('应发送企业微信和邮件告警', async () => {
      const { alertError } = loadAlert();
      await alertError({ level: 'error', source: 'DB', message: 'connection lost', traceId: 't1' });

      const notification = require('../../utils/notification');
      expect(notification.sendMarkdown).toHaveBeenCalled();
      expect(notification.sendEmailAlert).toHaveBeenCalled();

      const markdown = notification.sendMarkdown.mock.calls[0][0];
      expect(markdown).toContain('DB');
      expect(markdown).toContain('t1');
      expect(markdown).toContain('connection lost');
    });

    it('critical 级别应使用警告颜色和严重标记', async () => {
      const { alertError } = loadAlert();
      await alertError({ level: 'critical', source: 'Cron', message: 'fail' });

      const notification = require('../../utils/notification');
      const markdown = notification.sendMarkdown.mock.calls[0][0];
      expect(markdown).toContain('🚨');
      expect(markdown).toContain('warning');
    });

    it('同一错误 5 分钟内应防抖', async () => {
      const { alertError } = loadAlert();
      const ctx = { level: 'error', source: 'Test', message: 'same' };
      await alertError(ctx);
      await alertError(ctx);
      await alertError(ctx);

      const notification = require('../../utils/notification');
      expect(notification.sendMarkdown).toHaveBeenCalledTimes(1);
      expect(notification.sendEmailAlert).toHaveBeenCalledTimes(1);
    });

    it('不同来源的错误应分别发送', async () => {
      const { alertError } = loadAlert();
      await alertError({ level: 'error', source: 'A', message: 'x' });
      await alertError({ level: 'error', source: 'B', message: 'x' });

      const notification = require('../../utils/notification');
      expect(notification.sendMarkdown).toHaveBeenCalledTimes(2);
    });

    it('企业微信发送失败应静默处理', async () => {
      const { alertError } = loadAlert();
      const notification = require('../../utils/notification');
      notification.sendMarkdown.mockRejectedValueOnce(new Error('wechat fail'));

      await alertError({ level: 'error', source: 'X', message: 'm' });

      expect(notification.sendEmailAlert).toHaveBeenCalled();
    });

    it('邮件发送失败应静默处理', async () => {
      const { alertError } = loadAlert();
      const notification = require('../../utils/notification');
      notification.sendEmailAlert.mockRejectedValueOnce(new Error('email fail'));

      await alertError({ level: 'error', source: 'Y', message: 'm' });

      expect(notification.sendMarkdown).toHaveBeenCalled();
    });

    it('无 message 时应使用默认文本', async () => {
      const { alertError } = loadAlert();
      await alertError({ level: 'error', source: 'X' });

      const notification = require('../../utils/notification');
      const markdown = notification.sendMarkdown.mock.calls[0][0];
      expect(markdown).toContain('未知错误');
    });
  });
});

/**
 * notification 单元测试
 * 覆盖企业微信 webhook、邮件告警、各类提醒消息组装
 */

// mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

// mock https.request
jest.mock('https', () => ({
  request: jest.fn()
}));

// mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn()
}));

function loadNotification(envOverrides = {}) {
  jest.resetModules();
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return require('../../utils/notification');
}

function createMockReq(response) {
  const req = {
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event, handler) => {
      if (event === 'error') {
        req.errorHandler = handler;
      }
    }),
    getPayload() {
      return JSON.parse(req.write.mock.calls[0][0]);
    }
  };

  // resetModules 后必须重新获取 https mock 引用
  const https = require('https');
  https.request.mockImplementation((options, callback) => {
    process.nextTick(() => callback(response));
    return req;
  });

  return req;
}

describe('notification', () => {
  const baseEnv = {
    WECHAT_WEBHOOK_URL: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendText', () => {
    it('应发送文本消息并返回结果', async () => {
      const { sendText } = loadNotification(baseEnv);
      const res = {
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"errcode":0,"errmsg":"ok"}');
          if (event === 'end') handler();
        })
      };
      const req = createMockReq(res);

      const result = await sendText('hello', ['user1']);
      expect(result.errcode).toBe(0);
      const https = require('https');
      const call = https.request.mock.calls[0];
      expect(call[0].method).toBe('POST');
      expect(call[0].hostname).toBe('qyapi.weixin.qq.com');
      const payload = req.getPayload();
      expect(payload.msgtype).toBe('text');
      expect(payload.text.mentioned_list).toEqual(['user1']);
    });
  });

  describe('sendMarkdown', () => {
    it('应发送 markdown 消息', async () => {
      const { sendMarkdown } = loadNotification(baseEnv);
      const res = {
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"errcode":0}');
          if (event === 'end') handler();
        })
      };
      const req = createMockReq(res);

      const result = await sendMarkdown('## title');
      expect(result.errcode).toBe(0);
      const payload = req.getPayload();
      expect(payload.msgtype).toBe('markdown');
    });

    it('webhook 返回非 0 时应 reject', async () => {
      const { sendMarkdown } = loadNotification(baseEnv);
      const res = {
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"errcode":1,"errmsg":"invalid"}');
          if (event === 'end') handler();
        })
      };
      createMockReq(res);

      await expect(sendMarkdown('x')).rejects.toThrow('invalid');
    });

    it('响应非 JSON 时应 reject', async () => {
      const { sendMarkdown } = loadNotification(baseEnv);
      const res = {
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('not-json');
          if (event === 'end') handler();
        })
      };
      createMockReq(res);

      await expect(sendMarkdown('x')).rejects.toThrow(SyntaxError);
    });

    it('请求失败时应 reject', async () => {
      const { sendMarkdown } = loadNotification(baseEnv);
      const req = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            process.nextTick(() => handler(new Error('network')));
          }
        })
      };
      const https = require('https');
      https.request.mockReturnValue(req);

      await expect(sendMarkdown('x')).rejects.toThrow('network');
    });
  });

  describe('sendEmailAlert', () => {
    it('未配置 SMTP 时应直接返回', async () => {
      const { sendEmailAlert } = loadNotification({
        WECHAT_WEBHOOK_URL: baseEnv.WECHAT_WEBHOOK_URL
      });

      const result = await sendEmailAlert({ source: 'x', message: 'm' });
      expect(result).toBeUndefined();
      const nodemailer = require('nodemailer');
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('配置完整时应发送邮件', async () => {
      const { sendEmailAlert } = loadNotification({
        WECHAT_WEBHOOK_URL: baseEnv.WECHAT_WEBHOOK_URL,
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'from@example.com',
        SMTP_PASS: 'pass',
        ALERT_EMAIL_TO: 'to@example.com'
      });

      const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue({ sendMail });

      await sendEmailAlert({ level: 'critical', source: 'DB', message: 'fail', traceId: 't1' });

      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalled();
      const mailOptions = sendMail.mock.calls[0][0];
      expect(mailOptions.to).toBe('to@example.com');
      expect(mailOptions.subject).toContain('[严重]');
      expect(mailOptions.text).toContain('t1');
    });

    it('邮件发送失败时应静默捕获', async () => {
      const { sendEmailAlert } = loadNotification({
        WECHAT_WEBHOOK_URL: baseEnv.WECHAT_WEBHOOK_URL,
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'from@example.com',
        SMTP_PASS: 'pass',
        ALERT_EMAIL_TO: 'to@example.com'
      });

      const sendMail = jest.fn().mockRejectedValue(new Error('smtp error'));
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue({ sendMail });

      const logger = require('../../config/logger');
      await sendEmailAlert({ source: 'x', message: 'm' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('sendFollowupReminder', () => {
    function mockMarkdownResponse() {
      return {
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"errcode":0}');
          if (event === 'end') handler();
        })
      };
    }

    it('overdue 类型应生成提醒', async () => {
      const { sendFollowupReminder } = loadNotification(baseEnv);
      const req = createMockReq(mockMarkdownResponse());

      await sendFollowupReminder({ type: 'overdue', customerName: 'A', ownerName: 'O', overdueDays: 3 });
      const payload = req.getPayload();
      expect(payload.msgtype).toBe('markdown');
      expect(payload.markdown.content).toContain('逾期跟进提醒');
      expect(payload.markdown.content).toContain('@O');
    });

    it('today 类型应生成提醒', async () => {
      const { sendFollowupReminder } = loadNotification(baseEnv);
      const req = createMockReq(mockMarkdownResponse());

      await sendFollowupReminder({ type: 'today', customerName: 'A', ownerName: 'O' });
      const payload = req.getPayload();
      expect(payload.markdown.content).toContain('今日待跟进');
    });

    it('upcoming 类型应生成提醒', async () => {
      const { sendFollowupReminder } = loadNotification(baseEnv);
      const req = createMockReq(mockMarkdownResponse());

      await sendFollowupReminder({ type: 'upcoming', customerName: 'A', ownerName: 'O', nextTime: '10:00' });
      const payload = req.getPayload();
      expect(payload.markdown.content).toContain('明日待跟进');
    });

    it('未知类型应直接返回', async () => {
      const { sendFollowupReminder } = loadNotification(baseEnv);
      const result = await sendFollowupReminder({ type: 'unknown', customerName: 'A', ownerName: 'O' });
      expect(result).toBeUndefined();
      const https = require('https');
      expect(https.request).not.toHaveBeenCalled();
    });
  });

  describe('sendPaymentOverdue', () => {
    it('应发送回款逾期提醒', async () => {
      const { sendPaymentOverdue } = loadNotification(baseEnv);
      const res = {
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"errcode":0}');
          if (event === 'end') handler();
        })
      };
      const req = createMockReq(res);

      await sendPaymentOverdue({ contractNo: 'C001', customerName: 'A', amount: 10000, overdueDays: 5, ownerName: 'O' });
      const payload = req.getPayload();
      expect(payload.markdown.content).toContain('回款逾期提醒');
      expect(payload.markdown.content).toContain('10,000');
    });
  });

  describe('sendOpportunityReminder', () => {
    it('应发送商机提醒', async () => {
      const { sendOpportunityReminder } = loadNotification(baseEnv);
      const res = {
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"errcode":0}');
          if (event === 'end') handler();
        })
      };
      const req = createMockReq(res);

      await sendOpportunityReminder({ oppName: 'Opp', customerName: 'A', stage: '谈判', expectedAmount: 50000, ownerName: 'O' });
      const payload = req.getPayload();
      expect(payload.markdown.content).toContain('商机提醒');
      expect(payload.markdown.content).toContain('50,000');
    });
  });
});

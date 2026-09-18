/**
 * webhookDispatcher 单元测试（#16）
 *
 * 覆盖：
 * 1. 无订阅者 → 不发送
 * 2. 订阅匹配 → POST 到正确 URL + 记日志 + 计数
 * 3. 未订阅该事件 → 不发送
 * 4. SSRF：内网 URL 被拒绝（不 fetch，记 failed 日志）
 * 5. fetch 失败 → 记 failed + fail_count++，且 dispatch 不抛异常
 * 6. pool.query 抛错 → dispatch 仍不抛（fail-safe）
 * 7. parseEvents 容错（非法 JSON / 数组 / 字符串）
 * 8. HTTP 500 → 记 failed 但仍计入 dispatched（返回值语义）
 */

const mockPool = { query: jest.fn() };

jest.mock('../config/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

// apiPlatformService 通过 require('./apiPlatformService') 被调用，这里 mock 掉
jest.mock('../services/apiPlatformService', () => ({
  insertWebhookLog: jest.fn().mockResolvedValue(undefined),
  updateWebhookTrigger: jest.fn().mockResolvedValue(undefined)
}));

const apiPlatformService = require('../services/apiPlatformService');
const dispatcher = require('../services/webhookDispatcher');

describe('webhookDispatcher（#16 业务事件派发）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('parseEvents 容错', () => {
    it('数组原样返回', () => {
      expect(dispatcher.parseEvents(['a', 'b'])).toEqual(['a', 'b']);
    });
    it('JSON 数组文本解析', () => {
      expect(dispatcher.parseEvents('["customer.created"]')).toEqual(['customer.created']);
    });
    it('非法 JSON → 空数组', () => {
      expect(dispatcher.parseEvents('{bad json')).toEqual([]);
    });
    it('空值 → 空数组', () => {
      expect(dispatcher.parseEvents(null)).toEqual([]);
      expect(dispatcher.parseEvents('')).toEqual([]);
    });
  });

  describe('isUrlAllowed（SSRF 防护）', () => {
    it('公网 https 允许', () => {
      expect(dispatcher.isUrlAllowed('https://example.com/hook').ok).toBe(true);
    });
    it('localhost / 127.0.0.1 拒绝', () => {
      expect(dispatcher.isUrlAllowed('http://localhost/h').ok).toBe(false);
      expect(dispatcher.isUrlAllowed('http://127.0.0.1/h').ok).toBe(false);
    });
    it('内网段 10./172.16./192.168. 拒绝', () => {
      expect(dispatcher.isUrlAllowed('http://10.0.0.5/h').ok).toBe(false);
      expect(dispatcher.isUrlAllowed('http://172.16.1.1/h').ok).toBe(false);
      expect(dispatcher.isUrlAllowed('http://192.168.1.1/h').ok).toBe(false);
    });
    it('非 http/https 协议拒绝', () => {
      expect(dispatcher.isUrlAllowed('ftp://example.com/h').ok).toBe(false);
    });
    it('非法 URL 拒绝', () => {
      expect(dispatcher.isUrlAllowed('not a url').ok).toBe(false);
      expect(dispatcher.isUrlAllowed('').ok).toBe(false);
    });
  });

  describe('dispatch', () => {
    it('无订阅者时返回 0 且不 fetch', async () => {
      mockPool.query.mockResolvedValueOnce([[]]);
      const r = await dispatcher.dispatch(mockPool, 'customer.created', { id: 1 });
      expect(r.dispatched).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('命中订阅者 → POST 正确 URL/头/体 + 记日志 + 计数', async () => {
      mockPool.query.mockResolvedValueOnce([[
        { id: 9, name: 'WH', url: 'https://hooks.example.com/x', events: '["customer.created"]', secret: 's3cr3t' }
      ]]);
      global.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' });

      const r = await dispatcher.dispatch(mockPool, 'customer.created', { customer_id: 7 });

      expect(r.dispatched).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toBe('https://hooks.example.com/x');
      expect(opts.method).toBe('POST');
      expect(opts.headers['X-Webhook-Secret']).toBe('s3cr3t');
      expect(opts.headers['X-Webhook-Event']).toBe('customer.created');
      const body = JSON.parse(opts.body);
      expect(body.event).toBe('customer.created');
      expect(body.data.customer_id).toBe(7);
      expect(apiPlatformService.insertWebhookLog).toHaveBeenCalledWith(mockPool, expect.objectContaining({
        webhook_id: 9, event_type: 'customer.created', status: 'success', response_status: 200
      }));
      expect(apiPlatformService.updateWebhookTrigger).toHaveBeenCalledWith(mockPool, 9, true);
    });

    it('未订阅该事件 → 不发送', async () => {
      mockPool.query.mockResolvedValueOnce([[
        { id: 9, name: 'WH', url: 'https://hooks.example.com/x', events: '["contract.signed"]', secret: 's' }
      ]]);
      const r = await dispatcher.dispatch(mockPool, 'customer.created', {});
      expect(r.dispatched).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('内网 URL 被拒绝：不 fetch，记 failed 日志', async () => {
      mockPool.query.mockResolvedValueOnce([[
        { id: 5, name: 'SSRF', url: 'http://127.0.0.1/hook', events: '["payment.received"]', secret: '' }
      ]]);
      const r = await dispatcher.dispatch(mockPool, 'payment.received', {});
      expect(global.fetch).not.toHaveBeenCalled();
      expect(r.dispatched).toBe(0);
      expect(apiPlatformService.insertWebhookLog).toHaveBeenCalledWith(mockPool, expect.objectContaining({
        webhook_id: 5, event_type: 'payment.received', status: 'failed'
      }));
    });

    it('fetch 抛错 → 记 failed + fail_count++，dispatch 不抛', async () => {
      mockPool.query.mockResolvedValueOnce([[
        { id: 3, name: 'WH', url: 'https://hooks.example.com/y', events: '["contract.signed"]', secret: '' }
      ]]);
      global.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const r = await dispatcher.dispatch(mockPool, 'contract.signed', {});
      // dispatched 语义：HTTP 2xx 投递成功的条数。fetch 抛错 → 不计入
      expect(r.dispatched).toBe(0);
      expect(apiPlatformService.insertWebhookLog).toHaveBeenCalledWith(mockPool, expect.objectContaining({
        webhook_id: 3, status: 'failed'
      }));
      expect(apiPlatformService.updateWebhookTrigger).toHaveBeenCalledWith(mockPool, 3, false);
    });

    it('HTTP 500（fetch 不抛）→ 记 failed 日志 + fail_count++，不计入 dispatched', async () => {
      mockPool.query.mockResolvedValueOnce([[
        { id: 6, name: 'WH', url: 'https://hooks.example.com/err', events: '["contract.signed"]', secret: '' }
      ]]);
      global.fetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Error' });

      const r = await dispatcher.dispatch(mockPool, 'contract.signed', {});
      expect(r.dispatched).toBe(0); // 对端 5xx → 不算投递成功
      expect(apiPlatformService.insertWebhookLog).toHaveBeenCalledWith(mockPool, expect.objectContaining({
        webhook_id: 6, status: 'failed', response_status: 500
      }));
      expect(apiPlatformService.updateWebhookTrigger).toHaveBeenCalledWith(mockPool, 6, false);
    });

    it('AbortError → status=timeout', async () => {
      mockPool.query.mockResolvedValueOnce([[
        { id: 4, name: 'WH', url: 'https://hooks.example.com/z', events: '["payment.received"]', secret: '' }
      ]]);
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      global.fetch.mockRejectedValueOnce(abortErr);

      await dispatcher.dispatch(mockPool, 'payment.received', {});
      expect(apiPlatformService.insertWebhookLog).toHaveBeenCalledWith(mockPool, expect.objectContaining({
        webhook_id: 4, status: 'timeout'
      }));
    });

    it('fail-safe：pool.query 抛错时 dispatch 仍不抛（返回 error 字段）', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB down'));
      const r = await dispatcher.dispatch(mockPool, 'customer.created', {});
      expect(r.dispatched).toBe(0);
      expect(r.error).toBe('DB down');
    });

    it('多个订阅者：一个失败不影响另一个', async () => {
      mockPool.query.mockResolvedValueOnce([[
        { id: 1, name: 'A', url: 'https://a.example.com/h', events: '["customer.created"]', secret: '' },
        { id: 2, name: 'B', url: 'https://b.example.com/h', events: '["customer.created"]', secret: '' }
      ]]);
      global.fetch
        .mockRejectedValueOnce(new Error('A down'))
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' });

      const r = await dispatcher.dispatch(mockPool, 'customer.created', {});
      expect(r.dispatched).toBe(1); // A 网络错误不计入，B 2xx 计入
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(apiPlatformService.updateWebhookTrigger).toHaveBeenCalledWith(mockPool, 2, true);
      expect(apiPlatformService.updateWebhookTrigger).toHaveBeenCalledWith(mockPool, 1, false);
    });
  });
});

/**
 * notificationService 单元测试
 */

const notificationService = require('../../services/notificationService');

jest.mock('../../utils/sseManager', () => ({
  send: jest.fn()
}));

function createMockPool() {
  return { query: jest.fn() };
}

describe('notificationService', () => {
  describe('listNotifications', () => {
    it('应返回列表、总数和未读数', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([[{ id: 1, title: 't', link_url: null, business_type: 'quote', business_id: 1 }]])
        .mockResolvedValueOnce([[{ count: 5 }]]);

      const result = await notificationService.listNotifications(pool, 1, { page: 1, pageSize: 10 });
      expect(result.list).toHaveLength(1);
      expect(result.list[0].link_url).toBe('/quote');
      expect(result.total).toBe(2);
      expect(result.unread_count).toBe(5);
    });

    it('unread_only 为 true 时应追加过滤', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ count: 0 }]]);

      await notificationService.listNotifications(pool, 1, { unread_only: true });
      expect(pool.query.mock.calls[0][0]).toContain('is_read = 0');
    });

    it('page/pageSize 为字符串时应正确解析', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ count: 0 }]]);

      await notificationService.listNotifications(pool, 1, { page: '2', pageSize: '5' });
      expect(pool.query.mock.calls[1][1]).toEqual([1, 5, 5]);
    });

    it('pageSize 非法时应回退到 20', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ count: 0 }]]);

      await notificationService.listNotifications(pool, 1, { pageSize: 'abc' });
      expect(pool.query.mock.calls[1][1]).toEqual([1, 20, 0]);
    });
  });

  describe('buildLink', () => {
    it('customer 类型应返回详情链接', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, link_url: null, business_type: 'customer', business_id: 99 }]])
        .mockResolvedValueOnce([[{ count: 1 }]]);

      const result = await notificationService.listNotifications(pool, 1);
      expect(result.list[0].link_url).toBe('/customer/detail/99');
    });

    it('未知类型应返回 null', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, link_url: null, business_type: 'unknown', business_id: 1 }]])
        .mockResolvedValueOnce([[{ count: 1 }]]);

      const result = await notificationService.listNotifications(pool, 1);
      expect(result.list[0].link_url).toBeNull();
    });
  });

  describe('markAsRead', () => {
    it('应返回 affectedRows', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await notificationService.markAsRead(pool, 1, 2);
      expect(result.affectedRows).toBe(1);
      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE crm_notification SET is_read = 1 WHERE id = ? AND to_user_id = ?',
        [1, 2]
      );
    });
  });

  describe('markAllAsRead', () => {
    it('应更新全部未读', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ affectedRows: 3 }]);

      const result = await notificationService.markAllAsRead(pool, 1);
      expect(result.affectedRows).toBe(3);
    });
  });

  describe('getUnreadCount', () => {
    it('应返回未读数', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ count: 7 }]]);

      const result = await notificationService.getUnreadCount(pool, 1);
      expect(result.count).toBe(7);
    });
  });

  describe('createNotification', () => {
    it('应插入并推送 SSE', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ insertId: 100 }]);

      const result = await notificationService.createNotification(pool, {
        user_id: 1,
        type: 'test',
        title: 'title',
        content: 'content'
      });

      expect(result.id).toBe(100);
      const sseManager = require('../../utils/sseManager');
      expect(sseManager.send).toHaveBeenCalledWith(1, expect.objectContaining({ type: 'notification' }));
    });

    it('link_url 为空时应存 null', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([{ insertId: 101 }]);

      await notificationService.createNotification(pool, {
        user_id: 1,
        type: 'test',
        title: 'title',
        content: 'content',
        link_url: ''
      });

      expect(pool.query.mock.calls[0][1][4]).toBeNull();
    });
  });
});

/**
 * SseManager 单元测试
 */

const sseManager = require('../../utils/sseManager');

function createMockRes() {
  return {
    write: jest.fn()
  };
}

describe('SseManager', () => {
  beforeEach(() => {
    sseManager.connections.clear();
  });

  describe('add', () => {
    it('应为新用户创建连接集合', () => {
      const res = createMockRes();
      sseManager.add(1, res);
      expect(sseManager.connections.has(1)).toBe(true);
      expect(sseManager.connections.get(1).has(res)).toBe(true);
    });

    it('应为同一用户添加多个连接', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      sseManager.add(1, res1);
      sseManager.add(1, res2);
      expect(sseManager.connections.get(1).size).toBe(2);
    });
  });

  describe('remove', () => {
    it('不存在的用户应静默返回', () => {
      sseManager.remove(999, createMockRes());
      expect(sseManager.connections.has(999)).toBe(false);
    });

    it('删除后集合为空应清理用户', () => {
      const res = createMockRes();
      sseManager.add(1, res);
      sseManager.remove(1, res);
      expect(sseManager.connections.has(1)).toBe(false);
    });

    it('删除后集合不为空应保留用户', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      sseManager.add(1, res1);
      sseManager.add(1, res2);
      sseManager.remove(1, res1);
      expect(sseManager.connections.has(1)).toBe(true);
      expect(sseManager.connections.get(1).size).toBe(1);
    });
  });

  describe('send', () => {
    it('不存在的用户应直接返回', () => {
      sseManager.send(999, { msg: 'x' });
      expect(sseManager.connections.has(999)).toBe(false);
    });

    it('应向用户所有连接发送数据', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      sseManager.add(1, res1);
      sseManager.add(1, res2);

      sseManager.send(1, { type: 'notify' });

      expect(res1.write).toHaveBeenCalled();
      expect(res2.write).toHaveBeenCalled();
      const data = res1.write.mock.calls[0][0];
      expect(data).toContain('data:');
      expect(data).toContain('"type":"notify"');
    });

    it('写入失败时应移除该连接', () => {
      const res1 = createMockRes();
      res1.write.mockImplementation(() => { throw new Error('broken'); });
      const res2 = createMockRes();
      sseManager.add(1, res1);
      sseManager.add(1, res2);

      sseManager.send(1, { msg: 'x' });

      expect(sseManager.connections.get(1).has(res1)).toBe(false);
      expect(sseManager.connections.get(1).has(res2)).toBe(true);
    });
  });

  describe('broadcast', () => {
    it('应向所有在线用户广播', () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      sseManager.add(1, res1);
      sseManager.add(2, res2);

      sseManager.broadcast({ msg: 'all' });

      expect(res1.write).toHaveBeenCalled();
      expect(res2.write).toHaveBeenCalled();
    });

    it('无连接时应静默返回', () => {
      sseManager.broadcast({ msg: 'all' });
      expect(sseManager.getOnlineCount()).toBe(0);
    });
  });

  describe('getOnlineCount', () => {
    it('应统计所有连接数', () => {
      sseManager.add(1, createMockRes());
      sseManager.add(1, createMockRes());
      sseManager.add(2, createMockRes());
      expect(sseManager.getOnlineCount()).toBe(3);
    });

    it('无连接时应返回 0', () => {
      expect(sseManager.getOnlineCount()).toBe(0);
    });
  });
});

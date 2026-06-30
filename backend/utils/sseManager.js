/**
 * SSE 连接管理器
 * 按 userId 分组管理多个客户端连接，支持单用户多端登录
 */

class SseManager {
  constructor() {
    /** @type {Map<number, Set<import('http').ServerResponse>>} */
    this.connections = new Map();
  }

  /**
   * 添加连接
   * @param {number} userId
   * @param {import('http').ServerResponse} res
   */
  add(userId, res) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId).add(res);
  }

  /**
   * 移除连接
   * @param {number} userId
   * @param {import('http').ServerResponse} res
   */
  remove(userId, res) {
    const set = this.connections.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) {
      this.connections.delete(userId);
    }
  }

  /**
   * 向指定用户推送消息
   * @param {number} userId
   * @param {object} payload
   */
  send(userId, payload) {
    const set = this.connections.get(userId);
    if (!set) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    set.forEach((res) => {
      try {
        res.write(data);
      } catch (e) {
        this.remove(userId, res);
      }
    });
  }

  /**
   * 广播给所有在线用户
   * @param {object} payload
   */
  broadcast(payload) {
    for (const userId of this.connections.keys()) {
      this.send(userId, payload);
    }
  }

  /**
   * 获取在线用户数
   */
  getOnlineCount() {
    let count = 0;
    for (const set of this.connections.values()) {
      count += set.size;
    }
    return count;
  }
}

module.exports = new SseManager();

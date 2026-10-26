/**
 * [P2-02] 提醒生成：不同类型不再互相挤占，通知不静默跳过
 *
 * 修复前唯一键 (customer_id, reminder_date) 使同一客户同一天的 overdue / today
 * 只能存一条；插入失败后通知代码不执行 → 企业微信/SSE 静默跳过。
 * 迁移 128 把唯一键改为 (customer_id, reminder_type, reminder_date)。
 *
 * 本测试锁定脚本行为：
 *   · 同一客户同一天先生成 overdue、再生成 today 时，两条都插入且两次通知都发送；
 *   · 今日提醒落库后，清理昨日遗留的 upcoming 预览（避免同时出现在「今日/明日」）；
 *   · 同类型同日重复插入（脚本重跑）仍是幂等跳过，不重复通知。
 */

jest.mock('../../utils/notification', () => ({
  sendFollowupReminder: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../utils/sseManager', () => ({ send: jest.fn() }));
jest.mock('../../utils/config', () => ({
  isFollowupReminderEnabled: jest.fn().mockResolvedValue(true)
}));

const notification = require('../../utils/notification');
const sseManager = require('../../utils/sseManager');
const { generateReminders } = require('../../scripts/generate_reminders');
const { dateKey } = require('../../utils/dateCode');

const TODAY = dateKey();

function createPool({ todayDuplicate = false } = {}) {
  const state = { inserts: [], updates: [] };

  const query = jest.fn(async (sqlText, params = []) => {
    const sql = String(sqlText);

    if (sql.includes('FROM sys_config')) return [[]];

    if (sql.includes('FROM crm_customer c')) {
      return [[{ customer_id: 1, owner_id: 10, company_name: '甲公司', overdue_days: 20 }]];
    }

    if (sql.includes('FROM sys_user u WHERE u.id = ?')) {
      return [[{ id: 10, manager_id: 9, real_name: '张三' }]];
    }

    if (sql.startsWith('INSERT INTO crm_follow_up_reminder')) {
      if (todayDuplicate && sql.includes("'today'")) {
        throw new Error("Duplicate entry '1-today-2026-10-26' for key 'uk_customer_type_date'");
      }
      state.inserts.push({ sql, params });
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('UPDATE crm_follow_up_reminder SET is_dismissed = 1')) {
      state.updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('FROM crm_follow_up f')) {
      if (params[0] === TODAY) {
        return [[{ id: 5, customer_id: 1, owner_id: 10, company_name: '甲公司', owner_name: '张三' }]];
      }
      return [[]]; // 明日无计划，避免与本用例断言交叉
    }

    throw new Error(`未预期的 SQL: ${sql.slice(0, 80)}`);
  });

  return { query, state };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('[P2-02] generateReminders', () => {
  it('同一客户同一天 overdue 与 today 都写入，且两次通知都发送', async () => {
    const pool = createPool();

    const result = await generateReminders(pool);

    expect(result).toEqual({ overdue: 1, today: 1, upcoming: 0 });

    const overdueInsert = pool.state.inserts.find((i) => i.sql.includes("'overdue'"));
    const todayInsert = pool.state.inserts.find((i) => i.sql.includes("'today'"));
    expect(overdueInsert.params).toEqual([1, 10, 9, TODAY]);
    expect(todayInsert.params).toEqual([1, 10, TODAY]);

    expect(notification.sendFollowupReminder).toHaveBeenCalledTimes(2);
    expect(notification.sendFollowupReminder).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'overdue', customerName: '甲公司' })
    );
    expect(notification.sendFollowupReminder).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'today', customerName: '甲公司' })
    );
    expect(sseManager.send).toHaveBeenCalledTimes(2);

    // 今日提醒落库后清理昨日遗留的 upcoming 预览（reminder_date=今日）
    expect(pool.state.updates).toHaveLength(1);
    expect(pool.state.updates[0].params).toEqual([1, TODAY]);
  });

  it('同类型同日重复（脚本重跑）仍幂等跳过，不重复通知', async () => {
    const pool = createPool({ todayDuplicate: true });

    const result = await generateReminders(pool);

    expect(result).toEqual({ overdue: 1, today: 0, upcoming: 0 });
    expect(notification.sendFollowupReminder).toHaveBeenCalledTimes(1);
    expect(notification.sendFollowupReminder).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'overdue' })
    );
    expect(notification.sendFollowupReminder).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'today' })
    );
  });
});

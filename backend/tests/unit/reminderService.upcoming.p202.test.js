/**
 * [P2-02] 提醒中心不再展示已到期的「明日待跟进」预览
 *
 * upcoming 行在计划日的前一天生成（reminder_date=次日）。到了 reminder_date
 * 当天，它已被「today」提醒取代；若历史行未清理，会让同一客户同时出现在
 * 「今日」「明日」两个页签。本测试锁定 SQL 过滤条件。
 */

const reminderService = require('../../services/reminderService');

describe('[P2-02] reminderService.getMyReminders', () => {
  it('主查询排除 reminder_date <= CURDATE() 的 upcoming 行', async () => {
    const pool = { query: jest.fn().mockResolvedValue([[]]) };

    await reminderService.getMyReminders(pool, 7, 3, { overdueDays: 30, isBoss: false });

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain(
      "NOT (r.reminder_type = 'upcoming' AND r.reminder_date <= CURDATE())"
    );
  });
});

/**
 * P1-08：邮件跨用户 IDOR 收口。
 *
 * 审计结论：getEmailDetail / markAsRead / toggleStar / linkCustomer 只按邮件 id 操作，
 * 任何持有 email 码的用户都能读写他人账号下的邮件。修复后全部追加账号归属子查询。
 */

const emailService = require('../../services/emailService');

function createPool() {
  return { query: jest.fn() };
}

describe('emailService 账号归属隔离（P1-08）', () => {
  it('getEmailDetail：WHERE 带 account 归属且参数为 [id, userId]', async () => {
    const pool = createPool();
    pool.query.mockResolvedValueOnce([[null], []]);
    await emailService.getEmailDetail(pool, 3, 7);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('SELECT id FROM crm_email_account WHERE user_id = ?');
    expect(params).toEqual([3, 7]);
  });

  it('markAsRead：0 行时报记录不存在（不静默成功）', async () => {
    const pool = createPool();
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(emailService.markAsRead(pool, 3, 7)).rejects.toMatchObject({ code: 404006 });
    expect(pool.query.mock.calls[0][0]).toContain('account_id IN (SELECT id FROM crm_email_account WHERE user_id = ? AND deleted_at IS NULL)');
  });

  it('markAsRead：本人邮件更新成功', async () => {
    const pool = createPool();
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(emailService.markAsRead(pool, 3, 7)).resolves.toBeUndefined();
  });

  it('toggleStar：SELECT 与 UPDATE 都限定账号归属', async () => {
    const pool = createPool();
    pool.query
      .mockResolvedValueOnce([[{ is_starred: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const r = await emailService.toggleStar(pool, 3, 7);
    expect(r).toEqual({ is_starred: 1 });
    expect(pool.query.mock.calls[0][0]).toContain('account_id IN (SELECT id FROM crm_email_account WHERE user_id = ? AND deleted_at IS NULL)');
    expect(pool.query.mock.calls[0][1]).toEqual([3, 7]);
    expect(pool.query.mock.calls[1][0]).toContain('account_id IN (SELECT id FROM crm_email_account WHERE user_id = ? AND deleted_at IS NULL)');
    expect(pool.query.mock.calls[1][1]).toEqual([1, 3, 7]);
  });

  it('toggleStar：他人邮件查不到 → 404', async () => {
    const pool = createPool();
    pool.query.mockResolvedValueOnce([[]]);
    await expect(emailService.toggleStar(pool, 3, 7)).rejects.toMatchObject({ code: 404006 });
  });

  it('linkCustomer：他人邮件更新 0 行 → 404', async () => {
    const pool = createPool();
    pool.query
      .mockResolvedValueOnce([[{ id: 9 }]]) // 客户存在
      .mockResolvedValueOnce([{ affectedRows: 0 }]); // 邮件不在本人账号下
    await expect(emailService.linkCustomer(pool, 3, 9, 7)).rejects.toMatchObject({ code: 404006 });
  });

  it('linkCustomer：本人邮件关联成功', async () => {
    const pool = createPool();
    pool.query
      .mockResolvedValueOnce([[{ id: 9 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(emailService.linkCustomer(pool, 3, 9, 7)).resolves.toBeUndefined();
  });
});

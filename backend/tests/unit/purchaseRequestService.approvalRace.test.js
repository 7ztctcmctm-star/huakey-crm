/**
 * P1-06：采购申请审批/撤销的并发安全。
 *
 * 审计结论：approveRequest / rejectRequest / cancelRequest 原实现「先 SELECT 校验 → 再 UPDATE」，
 * 两个审批人同时操作时后手会覆盖前手的审批结果（重复审批 / 结果被改写）。
 * 修复要求：UPDATE 必须带 `AND status = 'pending'` 条件，affectedRows=0 时返回 409。
 */

const purchaseRequestService = require('../../services/purchaseRequestService');

function createPool() {
  return { query: jest.fn() };
}

const ADMIN = { userId: 1, manageAll: true };

describe('purchaseRequestService 审批并发（P1-06）', () => {
  describe('approveRequest', () => {
    it('条件更新必须带 status=\'pending\'，成功返回 true', async () => {
      const pool = createPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const r = await purchaseRequestService.approveRequest(pool, 7, ADMIN);
      expect(r).toBe(true);
      const update = pool.query.mock.calls[1];
      expect(String(update[0])).toMatch(/WHERE id = \? AND status = 'pending'/);
      expect(update[1]).toEqual([1, 7]);
    });

    it('并发下后手更新 0 行时必须报 409，不得静默成功', async () => {
      const pool = createPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 'pending' }]]) // 后手读到的仍是 pending
        .mockResolvedValueOnce([{ affectedRows: 0 }]);    // 但前手已更新

      await expect(purchaseRequestService.approveRequest(pool, 7, ADMIN))
        .rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('rejectRequest', () => {
    it('条件更新必须带 status=\'pending\'，成功返回 true', async () => {
      const pool = createPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const r = await purchaseRequestService.rejectRequest(pool, 8, ADMIN, '不符合预算');
      expect(r).toBe(true);
      const update = pool.query.mock.calls[1];
      expect(String(update[0])).toMatch(/WHERE id = \? AND status = 'pending'/);
      expect(update[1]).toEqual(['不符合预算', 1, 8]);
    });

    it('并发下更新 0 行时报 409（不覆盖他人的“通过”结果）', async () => {
      const pool = createPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);

      await expect(purchaseRequestService.rejectRequest(pool, 8, ADMIN, 'r'))
        .rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('cancelRequest', () => {
    it('条件更新同时约束申请人 + 可撤销状态', async () => {
      const pool = createPool();
      pool.query
        .mockResolvedValueOnce([[{ applicant_id: 5, status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const r = await purchaseRequestService.cancelRequest(pool, 9, { userId: 5 }, '不买了');
      expect(r).toBe(true);
      const update = pool.query.mock.calls[1];
      expect(String(update[0])).toContain("applicant_id = ? AND status IN ('draft', 'pending')");
      expect(update[1]).toEqual(['不买了', 9, 5]);
    });

    it('审批与撤销并发时后手报 409', async () => {
      const pool = createPool();
      pool.query
        .mockResolvedValueOnce([[{ applicant_id: 5, status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);

      await expect(purchaseRequestService.cancelRequest(pool, 9, { userId: 5 }))
        .rejects.toMatchObject({ statusCode: 409 });
    });

    it('非本人撤销仍返回 403', async () => {
      const pool = createPool();
      pool.query.mockResolvedValueOnce([[{ applicant_id: 5, status: 'pending' }]]);

      await expect(purchaseRequestService.cancelRequest(pool, 9, { userId: 6 }))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });
});

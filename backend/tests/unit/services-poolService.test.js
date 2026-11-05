/**
 * poolService 单元测试（认领/释放状态同步，NI-3 漂移修复）
 */

const poolService = require('../../services/poolService');
const ROLES = require('../../config/roles');

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

function createMockConn() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
    query: jest.fn()
  };
}

describe('poolService', () => {
  describe('claimCustomer 状态同步', () => {
    it('认领线索池客户应同步 status 与 business_status（防 NI-3 漂移）', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);
      // 【B2】两层结构：pool.query = 事务外快判（不占连接）；conn.query = SELECT(FOR UPDATE) → UPDATE → INSERT pool_log
      pool.query.mockResolvedValueOnce([[{ id: 10, owner_id: null, company_name: 'A公司' }]]);
      conn.query.mockResolvedValueOnce([[{ id: 10, company_name: 'A公司', owner_id: null, status: 'lead', pool_type: 'private', protect_until: null }]]);
      conn.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await poolService.claimCustomer(pool, 10, 5, { roleId: ROLES.SALES, manageAll: false });
      expect(result.company_name).toBe('A公司');

      const updateCall = conn.query.mock.calls.find(c => c[0].includes('UPDATE crm_customer'));
      expect(updateCall).toBeTruthy();
      // status 与 business_status 必须同为 following，否则认领后卡在线索池
      expect(updateCall[0]).toContain('status = ?');
      expect(updateCall[0]).toContain('business_status = ?');
      expect(updateCall[1]).toContain('following');
      expect(updateCall[1].filter(p => p === 'following')).toHaveLength(2);
      // P0-1：认领必须是原子更新，条件里必须带 owner_id IS NULL
      expect(updateCall[0]).toContain('owner_id IS NULL');
    });

    it('认领公海客户（非 lead）也应同步两字段', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);
      pool.query.mockResolvedValueOnce([[{ id: 11, owner_id: null, company_name: 'B公司' }]]);
      conn.query.mockResolvedValueOnce([[{ id: 11, company_name: 'B公司', owner_id: null, status: 'quoted', pool_type: 'public', protect_until: null }]]);
      conn.query.mockResolvedValue([{ affectedRows: 1 }]);

      await poolService.claimCustomer(pool, 11, 5, { roleId: ROLES.SALES, manageAll: false });

      const updateCall = conn.query.mock.calls.find(c => c[0].includes('UPDATE crm_customer'));
      expect(updateCall[1].filter(p => p === 'following')).toHaveLength(2);
      // P0-1：原子守卫
      expect(updateCall[0]).toContain('owner_id IS NULL');
    });
  });

  describe('batchClaimCustomers 状态同步', () => {
    it('批量认领应逐条同步 status 与 business_status', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);

      let selectCount = 0;
      conn.query.mockImplementation((sql) => {
        if (sql.includes('SELECT id, pool_status')) {
          selectCount += 1;
          // 公海客户（保护期已过）
          return Promise.resolve([[{ id: selectCount, pool_status: 'sea', pool_type: 'public', protect_until: null, owner_id: null, company_name: `C${selectCount}公司` }]]);
        }
        return Promise.resolve([{ affectedRows: 1 }]);
      });

      const result = await poolService.batchClaimCustomers(pool, [1, 2], 5, { roleId: ROLES.SALES, manageAll: false });
      expect(result.claimed).toBe(2);
      expect(result.skipped).toHaveLength(0);

      const updateCalls = conn.query.mock.calls.filter(c => c[0].includes('UPDATE crm_customer'));
      expect(updateCalls).toHaveLength(2);
      updateCalls.forEach(call => {
        expect(call[0]).toContain('status = ?');
        expect(call[0]).toContain('business_status = ?');
        expect(call[1].filter(p => p === 'following')).toHaveLength(2);
      });
    });
  });

  describe('releaseCustomer 状态同步（P1-03）', () => {
    it('释放到公海应同时写 status=sea 与 business_status=following', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);
      // 【B2】释放原本完全没有事务边界；现与单条认领同构：SELECT(FOR UPDATE) → UPDATE → INSERT pool_log
      conn.query.mockResolvedValueOnce([[{ id: 20, owner_id: 5, company_name: 'D公司' }]]);
      conn.query.mockResolvedValue([{ affectedRows: 1 }]);

      await poolService.releaseCustomer(pool, 20, 5, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);

      const selectCall = conn.query.mock.calls.find(c => String(c[0]).includes('SELECT id, owner_id'));
      expect(selectCall[0]).toContain('FOR UPDATE');

      const updateCall = conn.query.mock.calls.find(c => c[0].includes('UPDATE crm_customer'));
      expect(updateCall[0]).toContain('status = ?');
      expect(updateCall[0]).toContain('business_status = ?');
      // [P1-03] status='sea' 与 business_status='following' 必须同一句写入，
      // 否则释放后的客户仍被报表按原阶段统计
      expect(updateCall[1]).toContain('sea');
      expect(updateCall[1]).toContain('following');
      expect(updateCall[1]).toContain(20);
    });

    it('[P1-03] 线索客户不得释放到公海（否则被静默转成正式客户）', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[
        { id: 21, owner_id: 5, company_name: '线索公司', business_status: 'lead' }
      ]]);

      await expect(
        poolService.releaseCustomer(pool, 21, 5, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' })
      ).rejects.toMatchObject({ code: 400005 });

      expect(conn.query.mock.calls.some(c => String(c[0]).includes('UPDATE crm_customer'))).toBe(false);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('【B2】释放写入 pool_log 失败应整体回滚，不留「归属已改但日志缺失」', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);
      conn.query
        .mockResolvedValueOnce([[{ id: 20, owner_id: 5, company_name: 'D公司' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockRejectedValueOnce(new Error('pool_log 写入失败'));

      await expect(
        poolService.releaseCustomer(pool, 20, 5, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' })
      ).rejects.toThrow('pool_log 写入失败');

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('[P0-05] 销售不得释放他人客户（self 范围）', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[{ id: 20, owner_id: 9, company_name: '他人客户' }]]);

      await expect(
        poolService.releaseCustomer(pool, 20, 5, { type: 'self', userId: 5, ownerColumn: 'owner_id', module: 'customer' })
      ).rejects.toMatchObject({ code: 403001 });

      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.query.mock.calls.some(c => String(c[0]).includes('UPDATE crm_customer'))).toBe(false);
    });

    it('[P0-05] 缺少数据权限上下文时 fail-closed', async () => {
      const pool = createMockPool();
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[{ id: 20, owner_id: 5, company_name: 'D公司' }]]);

      await expect(poolService.releaseCustomer(pool, 20, 5))
        .rejects.toMatchObject({ code: 403001 });
      expect(conn.rollback).toHaveBeenCalled();
    });
  });
});

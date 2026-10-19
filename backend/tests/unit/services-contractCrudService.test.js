/**
 * contractCrudService 单元测试
 */

const contractCrudService = require('../../services/contractCrudService');
const contractService = require('../../services/contractService');
const ROLES = require('../../config/roles');
const AppError = require('../../errors/AppError');

jest.mock('../../services/contractService', () => ({
  getContract: jest.fn()
}));

jest.mock('../../utils/pagination', () => ({
  paginatedQuery: jest.fn(async (pool, opts) => ({ list: [], total: 0, page: opts.page || 1, pageSize: opts.pageSize || 10 }))
}));

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

describe('contractCrudService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listContracts', () => {
    it('应使用默认参数调用 paginatedQuery', async () => {
      const pool = createMockPool();
      const { paginatedQuery } = require('../../utils/pagination');

      await contractCrudService.listContracts(pool, {});
      expect(paginatedQuery).toHaveBeenCalled();
      const opts = paginatedQuery.mock.calls[0][1];
      expect(opts.params).toEqual([]);
    });

    it('应追加 keyword/status/customer_id/approval_status/payment_status 条件', async () => {
      const pool = createMockPool();
      const { paginatedQuery } = require('../../utils/pagination');

      await contractCrudService.listContracts(pool, {
        keyword: 'K', status: 1, customer_id: 2, approval_status: 1, payment_status: 'overdue'
      }, { clause: 'c.create_by = ?', params: [1] });

      const opts = paginatedQuery.mock.calls[0][1];
      expect(opts.params).toEqual([1, '%K%', '%K%', 1, 2, 1]);
      expect(opts.countQuery).toContain("EXISTS (SELECT 1 FROM crm_payment_plan pp WHERE pp.contract_id = c.id AND pp.status = 'overdue')");
    });

    it('未知 payment_status 不应追加状态条件', async () => {
      const pool = createMockPool();
      const { paginatedQuery } = require('../../utils/pagination');

      await contractCrudService.listContracts(pool, { payment_status: 'unknown' });
      const opts = paginatedQuery.mock.calls[0][1];
      expect(opts.countQuery).not.toContain("AND pp.status = 'overdue'");
    });
  });

  describe('getContractDetail', () => {
    it('无权限时应直接调用 contractService', async () => {
      const pool = createMockPool();
      contractService.getContract.mockResolvedValue({ id: 1 });

      const result = await contractCrudService.getContractDetail(pool, 1);
      expect(result.id).toBe(1);
    });

    it('有权限但无记录时应返回 null', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      const result = await contractCrudService.getContractDetail(pool, 1, { clause: 'c.create_by = ?', params: [1] });
      expect(result).toBeNull();
    });

    it('有权限且有记录时应返回详情', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1 }]]);
      contractService.getContract.mockResolvedValue({ id: 1 });

      const result = await contractCrudService.getContractDetail(pool, 1, { clause: 'c.create_by = ?', params: [1] });
      expect(result.id).toBe(1);
    });
  });

  describe('createContractNotification', () => {
    it('应插入通知', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ company_name: 'A' }]])
        .mockResolvedValueOnce([[{ real_name: 'U' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await contractCrudService.createContractNotification(pool, 1, 'C001', 1000, 2, 3);
      expect(pool.query).toHaveBeenCalledTimes(3);
    });

    it('失败时不抛错', async () => {
      const pool = createMockPool();
      pool.query.mockRejectedValueOnce(new Error('db'));

      await expect(contractCrudService.createContractNotification(pool, 1, 'C001', 1000, 2, 3)).resolves.toBeUndefined();
    });
  });

  describe('updateContract', () => {
    it('应更新合同和回款计划', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ amount: 100 }]]);
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])                    // UPDATE 合同
        .mockResolvedValueOnce([{ affectedRows: 1 }])                    // DELETE 计划 10
        .mockResolvedValueOnce([[{ id: 2, plan_date: '2026-05-01' }]])   // SELECT 现存计划（判重用）
        .mockResolvedValueOnce([{ affectedRows: 1 }])                    // UPDATE 计划 1
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                   // INSERT 新计划
      pool.getConnection.mockResolvedValue(conn);

      const oldData = await contractCrudService.updateContract(pool, {
        id: 1,
        customer_id: 2,
        opportunity_id: 3,
        amount: 200,
        sign_date: '2026-01-01',
        delivery_date: '2026-02-01',
        payment_terms: '分期',
        status: 1,
        remark: '',
        delete_plan_ids: [10],
        plans: [{ id: 1, plan_date: '2026-03-01', plan_amount: 100, remark: 'r' }, { plan_date: '2026-04-01', plan_amount: 100 }]
      });

      expect(oldData.amount).toBe(100);
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('新增计划与保留计划撞日期时应抛 400 并指出具体日期（迁移 123 uk_plan_contract_date）', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ amount: 100 }]]);
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])                     // UPDATE 合同
        .mockResolvedValueOnce([[{ id: 2, plan_date: '2026-05-01' }]]);   // 库里保留着 05-01
      pool.getConnection.mockResolvedValue(conn);

      await expect(
        contractCrudService.updateContract(pool, {
          id: 1, customer_id: 2, amount: 200, sign_date: '', delivery_date: '', payment_terms: '', status: 1, remark: '',
          plans: [{ plan_date: '2026-05-01', plan_amount: 100 }]
        })
      ).rejects.toMatchObject({ code: 400005, message: expect.stringContaining('2026-05-01') });

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('本次提交内两条计划同日期时应抛 400', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ amount: 100 }]]);
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE 合同
        .mockResolvedValueOnce([[]]);                  // 库里无计划
      pool.getConnection.mockResolvedValue(conn);

      await expect(
        contractCrudService.updateContract(pool, {
          id: 1, customer_id: 2, amount: 200, sign_date: '', delivery_date: '', payment_terms: '', status: 1, remark: '',
          plans: [{ plan_date: '2026-08-01', plan_amount: 100 }, { plan_date: '2026-08-01', plan_amount: 200 }]
        })
      ).rejects.toMatchObject({ code: 400005, message: expect.stringContaining('2026-08-01') });

      expect(conn.rollback).toHaveBeenCalled();
    });

    it('改期到已删除计划的日期应放行（删除后日期可复用）', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ amount: 100 }]]);
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE 合同
        .mockResolvedValueOnce([{ affectedRows: 1 }])  // DELETE 计划 10
        .mockResolvedValueOnce([[]])                   // 删除后库里无计划
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT 复用该日期
      pool.getConnection.mockResolvedValue(conn);

      const oldData = await contractCrudService.updateContract(pool, {
        id: 1, customer_id: 2, amount: 200, sign_date: '', delivery_date: '', payment_terms: '', status: 1, remark: '',
        delete_plan_ids: [10],
        plans: [{ plan_date: '2026-09-01', plan_amount: 100 }]
      });

      expect(oldData.amount).toBe(100);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('旧数据不存在时应抛 CONTRACT_NOT_FOUND（数据权限修复：越权/不存在不可更新）', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);

      await expect(contractCrudService.updateContract(pool, { id: 1, customer_id: 2, amount: 200, sign_date: '', delivery_date: '', payment_terms: '', status: 1, remark: '' })).rejects.toThrow('合同不存在');
    });

    it('异常时应回滚', async () => {
      const pool = createMockPool();
      pool.query.mockRejectedValueOnce(new Error('db'));
      const conn = createMockConn();
      pool.getConnection.mockResolvedValue(conn);

      await expect(contractCrudService.updateContract(pool, { id: 1, customer_id: 2, amount: 200, sign_date: '', delivery_date: '', payment_terms: '', status: 1, remark: '' })).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('deleteContract', () => {
    it('manageAll 用户可删除', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 1, create_by: 2 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await contractCrudService.deleteContract(pool, 1, { manageAll: true, roleId: ROLES.SALES, userId: 3 });
      expect(result.message).toBe('删除合同成功');
    });

    it('创建者可删除自己合同', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 1, create_by: 3 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await contractCrudService.deleteContract(pool, 1, { manageAll: false, roleId: ROLES.SALES, userId: 3 });
    });

    it('MANAGER 可删除', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 1, create_by: 2 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await contractCrudService.deleteContract(pool, 1, { manageAll: false, roleId: ROLES.MANAGER, userId: 3 });
    });

    it('不存在时应抛 CONTRACT_NOT_FOUND', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      await expect(contractCrudService.deleteContract(pool, 1, {})).rejects.toThrow(AppError);
    });

    it('已完成合同不能删除', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ status: 3, create_by: 1 }]]);

      await expect(contractCrudService.deleteContract(pool, 1, { userId: 1 })).rejects.toThrow('已完成的合同不能删除');
    });

    it('无权限时应抛 PERMISSION_DENIED', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ status: 1, create_by: 1 }]]);

      await expect(contractCrudService.deleteContract(pool, 1, { manageAll: false, roleId: ROLES.SALES, userId: 2 })).rejects.toThrow('无权删除该合同');
    });
  });

  describe('searchContracts', () => {
    it('keyword 为空时应返回空数组', async () => {
      const pool = createMockPool();
      const result = await contractCrudService.searchContracts(pool, '');
      expect(result).toEqual([]);
    });

    it('应返回搜索结果', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, contract_no: 'C001' }]]);

      const result = await contractCrudService.searchContracts(pool, 'C');
      expect(result).toHaveLength(1);
    });
  });

  describe('getOpportunityList', () => {
    it('无权限时应查询全部', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Opp' }]]);

      const result = await contractCrudService.getOpportunityList(pool);
      expect(result).toHaveLength(1);
      expect(pool.query.mock.calls[0][1]).toEqual([]);
    });

    it('有权限时应使用权限子句', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Opp' }]]);

      await contractCrudService.getOpportunityList(pool, { clause: 'o.owner_id = ?', params: [1] });
      expect(pool.query.mock.calls[0][1]).toEqual([1]);
    });
  });
});

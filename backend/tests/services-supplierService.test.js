/**
 * supplierService 单元测试
 */

const supplierService = require('../services/supplierService');

function createMockPool() {
  return { query: jest.fn(), getConnection: jest.fn() };
}

function createMockConnection() {
  return { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
}

describe('supplierService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSupplier', () => {
    it('应返回供应商详情含联系人/资质/评分/关联客户', async () => {
      const pool = createMockPool();
      const mockSupplier = { id: 1, name: '测试供应商' };
      pool.query
        .mockResolvedValueOnce([[mockSupplier]])
        .mockResolvedValueOnce([[]]) // contacts
        .mockResolvedValueOnce([[]]) // qualifications
        .mockResolvedValueOnce([[]]) // ratings
        .mockResolvedValueOnce([[]]); // relatedCustomers

      const result = await supplierService.getSupplier(pool, 1, { clause: '1=1', params: [] });
      expect(result).toBeDefined();
      expect(result.name).toBe('测试供应商');
      expect(result.contacts).toEqual([]);
      expect(result.qualifications).toEqual([]);
    });

    it('不存在的供应商应返回 null', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      const result = await supplierService.getSupplier(pool, 999, { clause: '1=1', params: [] });
      expect(result).toBeNull();
    });
  });

  describe('createSupplier', () => {
    it('应创建供应商并返回 ID + supplier_no', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query
        .mockResolvedValueOnce([[{ cnt: 0 }]])   // generateSupplierNo
        .mockResolvedValueOnce([{ insertId: 42 }]) // INSERT
        .mockResolvedValueOnce([{ insertId: 1 }]); // contact INSERT

      const result = await supplierService.createSupplier(pool, {
        name: '新供应商',
        contacts: [{ name: '张三', phone: '13800138000' }]
      }, 1);

      expect(result).toHaveProperty('id', 42);
      expect(result).toHaveProperty('supplier_no');
      expect(conn.commit).toHaveBeenCalled();
    });

    it('createSupplier 事务内抛出异常应回滚', async () => {
      const pool = createMockPool();
      const conn = createMockConnection();
      pool.getConnection.mockResolvedValue(conn);
      conn.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(supplierService.createSupplier(pool, { name: '失败' }, 1)).rejects.toThrow('DB error');
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('getSupplierOptions', () => {
    it('应返回供应商下拉选项', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, name: '供应商A' }, { id: 2, name: '供应商B' }]]);

      const result = await supplierService.getSupplierOptions(pool);
      expect(result).toHaveLength(2);
      expect(pool.query.mock.calls[0][0]).toContain('SELECT id, name');
    });
  });

  describe('getRanking', () => {
    it('应返回供应商排名', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[{ id: 1, name: 'A', total_score: 4.5 }]]);

      const result = await supplierService.getRanking(pool, 10);
      expect(result).toHaveLength(1);
    });
  });
});

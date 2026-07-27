/**
 * importService 单元测试
 */

const importService = require('../../services/importService');
const AppError = require('../../errors/AppError');

jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: { sheet_to_json: jest.fn() }
}));

jest.mock('../../utils/dataCleaner', () => ({
  cleanCustomerData: jest.fn((data) => data),
  filterExistingDuplicates: jest.fn(async (records) => ({ newRecords: records, skippedCount: 0 }))
}));

jest.mock('../../utils/validator', () => {
  return jest.fn().mockImplementation(function (rules) {
    this.rules = rules;
    this.validate = jest.fn(() => ({ valid: true, errors: [] }));
    this.validateBatch = jest.fn((items) => ({ validRecords: items, invalidRecords: [] }));
  });
});

jest.mock('../../middleware/logger', () => ({
  createRouteLogger: jest.fn(() => jest.fn())
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

describe('importService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockXlsx(rows) {
    const XLSX = require('xlsx');
    XLSX.read.mockReturnValue({ Sheets: { Sheet1: {} }, SheetNames: ['Sheet1'] });
    XLSX.utils.sheet_to_json.mockReturnValue(rows);
  }

  describe('parseRowsFromBuffer', () => {
    it('应解析 Excel 行', () => {
      mockXlsx([{ '公司名称': 'A', '电话': '138' }]);
      const result = importService.parseRowsFromBuffer(Buffer.from('x'));
      expect(result).toHaveLength(1);
      expect(result[0].company_name).toBe('A');
      expect(result[0].phone).toBe('138');
    });

    it('未知列应拼入 remark', () => {
      mockXlsx([{ '公司名称': 'A', '未知列': 'x' }]);
      const result = importService.parseRowsFromBuffer(Buffer.from('x'));
      expect(result[0].remark).toContain('未知列');
    });
  });

  describe('importPreview', () => {
    it('空文件应抛错', async () => {
      mockXlsx([]);
      await expect(importService.importPreview(createMockPool(), Buffer.from('x'))).rejects.toThrow(AppError);
    });

    it('应返回映射字段和预览', async () => {
      mockXlsx([{ '公司名称': 'A' }]);
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      const result = await importService.importPreview(pool, Buffer.from('x'));
      expect(result.total).toBe(1);
      expect(result.mapped_fields).toHaveLength(1);
      expect(result.preview).toHaveLength(1);
    });

    it('应识别未映射字段', async () => {
      mockXlsx([{ '公司名称': 'A', '自定义': 'x' }]);
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);

      const result = await importService.importPreview(pool, Buffer.from('x'));
      expect(result.unmapped_fields).toContain('自定义');
    });
  });

  describe('batchImport', () => {
    it('空数据应抛错', async () => {
      await expect(importService.batchImport(createMockPool(), [], 1)).rejects.toThrow('导入数据为空');
    });

    it('应成功导入并插入联系人', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      conn.query
        .mockResolvedValueOnce([{ insertId: 10 }])
        .mockResolvedValueOnce([{ insertId: 100 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await importService.batchImport(pool, [{ company_name: 'A', contact_name: 'B', phone: '138', status: '潜客' }], 1);
      expect(result.success).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('应映射中文状态', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([{ insertId: 10 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await importService.batchImport(pool, [{ company_name: 'A', status: '已签约' }], 1);
      expect(result.success).toBe(1);
      const insertParams = conn.query.mock.calls[0][1];
      expect(insertParams[5]).toBe('signed');
    });

    it('数字状态应回退到 following', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([{ insertId: 10 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await importService.batchImport(pool, [{ company_name: 'A', status: '123' }], 1);
      const insertParams = conn.query.mock.calls[0][1];
      expect(insertParams[5]).toBe('following');
      expect(result.success).toBe(1);
    });

    it('无联系人时不插入联系人', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([{ insertId: 10 }]);
      pool.getConnection.mockResolvedValue(conn);

      await importService.batchImport(pool, [{ company_name: 'A' }], 1);
      expect(conn.query).toHaveBeenCalledTimes(1);
    });

    it('插入异常应记录但不影响其他', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      conn.query.mockRejectedValueOnce(new Error('dup'));
      pool.getConnection.mockResolvedValue(conn);

      const result = await importService.batchImport(pool, [{ company_name: 'A', _row: 2 }], 1);
      expect(result.success).toBe(0);
      expect(result.fail).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('commit 异常应回滚并抛出', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([{ insertId: 10 }]);
      conn.commit.mockRejectedValueOnce(new Error('db'));
      pool.getConnection.mockResolvedValue(conn);

      await expect(importService.batchImport(pool, [{ company_name: 'A' }], 1)).rejects.toThrow('db');
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  describe('importCustomers', () => {
    it('应调用 batchImport', async () => {
      mockXlsx([{ '公司名称': 'A' }]);
      const pool = createMockPool();
      pool.query.mockResolvedValueOnce([[]]);
      const conn = createMockConn();
      conn.query.mockResolvedValueOnce([{ insertId: 10 }]);
      pool.getConnection.mockResolvedValue(conn);

      const result = await importService.importCustomers(pool, Buffer.from('x'), 1);
      expect(result.success).toBe(1);
    });
  });
});

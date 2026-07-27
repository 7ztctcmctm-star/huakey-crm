/**
 * DataCleaner 单元测试
 */
const DataCleaner = require('../../utils/dataCleaner');

describe('DataCleaner', () => {
  describe('cleanString', () => {
    it('应去除首尾空格并合并连续空格', () => {
      expect(DataCleaner.cleanString('  a  b   c  ')).toBe('a b c');
    });

    it('null/undefined 应原样返回，0 应转为字符串', () => {
      expect(DataCleaner.cleanString(null)).toBe(null);
      expect(DataCleaner.cleanString(undefined)).toBe(undefined);
      expect(DataCleaner.cleanString(0)).toBe('0');
    });
  });

  describe('cleanPhone', () => {
    it('应只保留数字和+号', () => {
      expect(DataCleaner.cleanPhone('+86 138-0013-8000')).toBe('8613800138000');
    });

    it('清洗为空时应返回原值', () => {
      expect(DataCleaner.cleanPhone('abc')).toBe('abc');
    });

    it('空值应原样返回', () => {
      expect(DataCleaner.cleanPhone(null)).toBe(null);
    });
  });

  describe('cleanEmail', () => {
    it('应 trim 并转小写', () => {
      expect(DataCleaner.cleanEmail('  Admin@Example.COM  ')).toBe('admin@example.com');
    });

    it('空值应原样返回', () => {
      expect(DataCleaner.cleanEmail(null)).toBe(null);
    });
  });

  describe('cleanCustomerData', () => {
    it('应清洗所有字段', () => {
      const result = DataCleaner.cleanCustomerData([
        {
          company_name: '  A 公司  ',
          contact_name: '  张三  ',
          phone: '138-0013-8000',
          email: 'A@B.COM',
          address: '  北京  朝阳  ',
          industry: 'IT',
          source: '展会',
          remark: '  备注  '
        }
      ]);
      expect(result[0].company_name).toBe('A 公司');
      expect(result[0].phone).toBe('13800138000');
      expect(result[0].email).toBe('a@b.com');
      expect(result[0].remark).toBe('备注');
    });
  });

  describe('detectDuplicates', () => {
    it('应检测重复记录', () => {
      const dups = DataCleaner.detectDuplicates(
        [{ a: 'x' }, { a: 'X ' }, { a: 'y' }],
        ['a']
      );
      expect(dups).toHaveLength(1);
      expect(dups[0].duplicateOf).toBe(0);
    });

    it('全空 key 不应算重复', () => {
      const dups = DataCleaner.detectDuplicates(
        [{ a: '', b: '  ' }, { a: '', b: '' }],
        ['a', 'b']
      );
      expect(dups).toHaveLength(0);
    });
  });

  describe('filterExistingDuplicates', () => {
    it('空数据应返回空数组', async () => {
      const result = await DataCleaner.filterExistingDuplicates([], {}, 't', []);
      expect(result.newRecords).toEqual([]);
      expect(result.skippedCount).toBe(0);
    });

    it('无有效匹配条件时应全部返回', async () => {
      const pool = { query: jest.fn() };
      const data = [{ a: '' }];
      const result = await DataCleaner.filterExistingDuplicates(
        data, pool, 't', [{ column: 'a' }]
      );
      expect(result.newRecords).toEqual(data);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('应过滤数据库已存在记录', async () => {
      const pool = {
        query: jest.fn().mockResolvedValue([[
          { company_name: 'A公司' }
        ]])
      };
      const data = [
        { company_name: 'A公司' },
        { company_name: 'B公司' }
      ];
      const result = await DataCleaner.filterExistingDuplicates(
        data, pool, 'crm_customer', [{ column: 'company_name' }]
      );
      expect(result.newRecords).toHaveLength(1);
      expect(result.newRecords[0].company_name).toBe('B公司');
      expect(result.skippedCount).toBe(1);
    });
  });
});

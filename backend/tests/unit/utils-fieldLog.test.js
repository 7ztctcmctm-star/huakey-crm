/**
 * fieldLog 单元测试
 */
const { computeFieldChanges, logFieldChanges, FIELD_LABEL_MAP } = require('../../utils/fieldLog');

const mockLogAction = jest.fn().mockResolvedValue(undefined);
const mockGetIpAddress = jest.fn().mockReturnValue('127.0.0.1');
const mockExtractUserInfo = jest.fn().mockReturnValue({ userId: 1, userName: 'admin' });

jest.mock('../../middleware/logger', () => ({
  logAction: (...args) => mockLogAction(...args),
  getIpAddress: (req) => mockGetIpAddress(req),
  extractUserInfo: (req) => mockExtractUserInfo(req)
}));

describe('fieldLog', () => {
  describe('computeFieldChanges', () => {
    it('无变化时应返回 null', () => {
      const result = computeFieldChanges(
        { name: 'A', amount: 100 },
        { amount: 100 },
        ['name', 'amount']
      );
      expect(result.changedFields).toBeNull();
      expect(result.oldValue).toBeNull();
      expect(result.newValue).toBeNull();
    });

    it('应记录字段变更', () => {
      const result = computeFieldChanges(
        { name: 'A', amount: 100 },
        { name: 'B', amount: 200 },
        ['name', 'amount']
      );
      expect(result.changedFields).toHaveLength(2);
      expect(result.changedFields[0].label).toBe(FIELD_LABEL_MAP.name);
      expect(result.oldValue).toEqual({ name: 'A', amount: 100 });
      expect(result.newValue).toEqual({ name: 'B', amount: 200 });
    });

    it('未包含在 allowedFields 中的字段应忽略', () => {
      const result = computeFieldChanges(
        { name: 'A', remark: 'x' },
        { remark: 'y' },
        ['name']
      );
      expect(result.changedFields).toBeNull();
    });

    it('null 与空字符串应视为相同', () => {
      const result = computeFieldChanges(
        { name: null },
        { name: '' },
        ['name']
      );
      expect(result.changedFields).toBeNull();
    });
  });

  describe('logFieldChanges', () => {
    it('无变更时不应调用 logAction', async () => {
      const req = { method: 'POST', originalUrl: '/test', body: {} };
      await logFieldChanges(req, {
        module: '测试',
        action: '编辑',
        oldData: { name: 'A' },
        newData: { name: 'A' },
        allowedFields: ['name']
      });
      expect(mockLogAction).not.toHaveBeenCalled();
    });

    it('有变更时应调用 logAction', async () => {
      const req = { method: 'POST', originalUrl: '/test', body: { name: 'B' } };
      await logFieldChanges(req, {
        module: '测试',
        action: '编辑',
        oldData: { name: 'A' },
        newData: { name: 'B' },
        allowedFields: ['name'],
        description: '自定义描述'
      });
      expect(mockLogAction).toHaveBeenCalledTimes(1);
      const call = mockLogAction.mock.calls[0][0];
      expect(call.module).toBe('测试');
      expect(call.action).toBe('编辑');
      expect(call.description).toBe('自定义描述');
      expect(call.userId).toBe(1);
    });
  });
});

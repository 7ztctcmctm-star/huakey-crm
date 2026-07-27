/**
 * 操作日志中间件脱敏单元测试
 */

const mockPool = {
  query: jest.fn().mockResolvedValue([{ insertId: 1 }])
};

jest.mock('../config/database', () => mockPool);
jest.mock('../config/logger', () => ({
  error: jest.fn(),
  http: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

const { logAction } = require('../middleware/logger');

describe('logAction 脱敏', () => {
  beforeEach(() => { mockPool.query.mockClear(); });

  it('应对 params 中的敏感字段脱敏', async () => {
    await logAction({
      module: '测试',
      action: '测试',
      params: {
        username: 'admin',
        password: 'Secret123',
        phone: '13800138000',
        email: 'admin@example.com',
        bank_account: '6222021234567890123',
        tax_id: '91110000123456789X'
      },
      status: 1
    });

    const insertedParams = JSON.parse(mockPool.query.mock.calls[0][1][4]);
    expect(insertedParams.password).toBe('******');
    expect(insertedParams.phone).toBe('138****8000');
    expect(insertedParams.email).toBe('a***n@example.com');
    expect(insertedParams.bank_account).toBe('***************0123');
    expect(insertedParams.tax_id).toBe('911************89X');
    expect(insertedParams.username).toBe('admin');
  });

  it('应对 changedFields 中的 old/new 值按字段名脱敏', async () => {
    await logAction({
      module: '测试',
      action: '测试',
      changedFields: [
        { field: 'phone', label: '电话', old: '13800138000', new: '13900139000' },
        { field: 'password', label: '密码', old: 'OldPass1', new: 'NewPass1' },
        { field: 'company_name', label: '公司名称', old: 'A公司', new: 'B公司' }
      ],
      status: 1
    });

    const insertedFields = JSON.parse(mockPool.query.mock.calls[0][1][11]);
    expect(insertedFields[0].old).toBe('138****8000');
    expect(insertedFields[0].new).toBe('139****9000');
    expect(insertedFields[1].old).toBe('******');
    expect(insertedFields[1].new).toBe('******');
    expect(insertedFields[2].old).toBe('A公司');
    expect(insertedFields[2].new).toBe('B公司');
  });

  it('应对 oldValue/newValue 中的敏感字段脱敏', async () => {
    await logAction({
      module: '测试',
      action: '测试',
      oldValue: {
        phone: '13800138000',
        email: 'old@example.com',
        bank_account: '6222021234567890123',
        company_name: '旧公司'
      },
      newValue: {
        phone: '13900139000',
        email: 'new@example.com',
        bank_account: '6222029876543210987',
        company_name: '新公司'
      },
      status: 1
    });

    const oldValue = JSON.parse(mockPool.query.mock.calls[0][1][12]);
    const newValue = JSON.parse(mockPool.query.mock.calls[0][1][13]);

    expect(oldValue.phone).toBe('138****8000');
    expect(oldValue.email).toBe('o***d@example.com');
    expect(oldValue.bank_account).toBe('***************0123');
    expect(oldValue.company_name).toBe('旧公司');

    expect(newValue.phone).toBe('139****9000');
    expect(newValue.email).toBe('n***w@example.com');
    expect(newValue.bank_account).toBe('***************0987');
    expect(newValue.company_name).toBe('新公司');
  });

  it('应对嵌套对象中的敏感字段递归脱敏', async () => {
    await logAction({
      module: '测试',
      action: '测试',
      params: {
        user: {
          phone: '13800138000',
          password: 'Secret123',
          profile: { email: 'nested@example.com' }
        }
      },
      status: 1
    });

    const insertedParams = JSON.parse(mockPool.query.mock.calls[0][1][4]);
    expect(insertedParams.user.phone).toBe('138****8000');
    expect(insertedParams.user.password).toBe('******');
    expect(insertedParams.user.profile.email).toBe('n***d@example.com');
  });
});

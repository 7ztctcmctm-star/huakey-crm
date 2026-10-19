/**
 * errorHandler 的 DB 错误映射（迁移 123 后外键错误必须不再走 500）
 *
 * 背景：迁移 123 补齐 6 条外键后，写入不存在的父行会抛 ER_NO_REFERENCED_ROW_2(1452)、
 * 删除被引用的父行会抛 ER_ROW_IS_REFERENCED_2(1451)。若不做映射，二者都会落到兜底分支
 * → 500 + 告警，把客户端参数问题误报成服务端故障。
 */

jest.mock('../../config/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }));
jest.mock('../../utils/alert', () => ({ alertError: jest.fn(), record500Error: jest.fn() }));

const { globalErrorHandler } = require('../../middleware/errorHandler');
const { alertError, record500Error } = require('../../utils/alert');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

const req = {
  originalUrl: '/api/invoice/add',
  method: 'POST',
  ip: '127.0.0.1',
  user: { userId: 1 },
  traceId: 'trace-1'
};

describe('errorHandler DB 错误映射', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['ER_DUP_ENTRY', 409, '数据重复'],
    ['ER_NO_REFERENCED_ROW', 400, '关联数据不存在'],
    ['ER_NO_REFERENCED_ROW_2', 400, '关联数据不存在'],
    ['ER_ROW_IS_REFERENCED', 400, '已被其他记录引用'],
    ['ER_ROW_IS_REFERENCED_2', 400, '已被其他记录引用']
  ])('%s 应映射为 %i 且不触发 5xx 告警', (code, httpStatus, msgPart) => {
    const res = mockRes();
    const err = Object.assign(new Error('db constraint'), { code });

    globalErrorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(httpStatus);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 400005,
      message: expect.stringContaining(msgPart)
    }));
    // 4xx 属于客户端问题，不应计入 500 计数 / 告警
    expect(record500Error).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();
  });

  it('未知错误仍应 500 并告警（映射不能误吞真实故障）', () => {
    const res = mockRes();
    const err = Object.assign(new Error('boom'), { code: 'ER_SOMETHING_ELSE' });

    globalErrorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(record500Error).toHaveBeenCalled();
    expect(alertError).toHaveBeenCalled();
  });
});

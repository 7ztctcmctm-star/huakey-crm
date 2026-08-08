/**
 * 合同取消工作流测试 (Phase 5.4)
 * 验证 cancelContract: status→4 + cancel_action 联动 Opportunity
 * 4 用例: customer_cancelled→6 / reopen_negotiation→4 / keep_won→不动 / 无action拒绝
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_cancel_flow';

// Mock opportunityService
const mockAdvanceStage = jest.fn();
jest.mock('../../services/opportunityService', () => ({
  advanceStage: (...args) => mockAdvanceStage(...args)
}));

// Mock contractService.cancelContract
const mockCancelContract = jest.fn();
jest.mock('../../services/contractService', () => ({
  createContract: jest.fn(),
  cancelContract: (...args) => mockCancelContract(...args)
}));
jest.mock('../../services/contractCrudService', () => ({
  createContractNotification: jest.fn().mockResolvedValue(undefined)
}));

const mockPool = { query: jest.fn() };
jest.mock('../../config/database', () => mockPool);
jest.mock('../../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const app = express();
app.use(express.json());
const contractRoutes = require('../../routes/contract');
app.use('/api/v1/contract', contractRoutes);

const generateToken = () => jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

describe('合同取消工作流', () => {
  const token = generateToken();

  beforeEach(() => {
    mockAdvanceStage.mockReset();
    mockCancelContract.mockReset();
    mockPool.query.mockReset();
  });

  const baseCancel = { id: 500, cancel_reason: '客户需求变更' };

  // Case1: customer_cancelled → opportunity stage 6
  it('Case1: 客户取消 → 商机推进 stage 6', async () => {
    mockCancelContract.mockResolvedValue({ id: 500, contract_no: 'CON-001', status: 4, cancel_reason: '客户需求变更', cancel_action: 'customer_cancelled', opportunity_id: 100 });
    mockAdvanceStage.mockResolvedValue({ oldStage: 5, newStage: 6, stageName: '失败' });

    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseCancel, cancel_action: 'customer_cancelled' });

    expect(res.status).toBe(200);
    expect(mockCancelContract).toHaveBeenCalledTimes(1);
    expect(mockAdvanceStage).toHaveBeenCalledTimes(1);
    const call = mockAdvanceStage.mock.calls[0];
    expect(call[1]).toBe(100);  // opportunity_id
    expect(call[2]).toBe(6);    // stage 6
  });

  // Case2: reopen_negotiation → opportunity stage 4
  it('Case2: 重新谈判 → 商机推进 stage 4', async () => {
    mockCancelContract.mockResolvedValue({ id: 500, contract_no: 'CON-001', status: 4, cancel_reason: '条款需调整', cancel_action: 'reopen_negotiation', opportunity_id: 100 });
    mockAdvanceStage.mockResolvedValue({ oldStage: 5, newStage: 4, stageName: '谈判' });

    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseCancel, cancel_reason: '条款需调整', cancel_action: 'reopen_negotiation' });

    expect(res.status).toBe(200);
    expect(mockAdvanceStage).toHaveBeenCalledTimes(1);
    const call = mockAdvanceStage.mock.calls[0];
    expect(call[2]).toBe(4);  // stage 4
  });

  // Case3: keep_won → opportunity 不动
  it('Case3: keep_won → 商机不动', async () => {
    mockCancelContract.mockResolvedValue({ id: 500, contract_no: 'CON-001', status: 4, cancel_reason: '保留成交', cancel_action: 'keep_won', opportunity_id: 100 });

    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseCancel, cancel_action: 'keep_won' });

    expect(res.status).toBe(200);
    expect(mockCancelContract).toHaveBeenCalledTimes(1);
    expect(mockAdvanceStage).not.toHaveBeenCalled();
  });

  // Case4: 无 cancel_reason → 拒绝(400)
  it('Case4: 缺少 cancel_reason → 400', async () => {
    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 500, cancel_action: 'customer_cancelled' });

    expect(res.status).toBe(400);  // Joi 校验失败
    expect(mockCancelContract).not.toHaveBeenCalled();
  });
});

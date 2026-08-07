/**
 * 合同取消工作流测试 (Phase 5.4)
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_cancel_v4';

// 用 jest.requireActual + jest.spyOn 方式, 确保 mock 生效
const opportunityService = jest.requireActual('../../services/opportunityService');
const contractService = jest.requireActual('../../services/contractService');

jest.mock('../../services/opportunityService', () => ({
  ...jest.requireActual('../../services/opportunityService'),
  advanceStage: jest.fn()
}));
jest.mock('../../services/contractService', () => ({
  ...jest.requireActual('../../services/contractService'),
  cancelContract: jest.fn()
}));
jest.mock('../../services/contractCrudService', () => ({
  createContractNotification: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

// 在 mock 后 require 被 mock 的模块
const oppMock = require('../../services/opportunityService');
const contractMock = require('../../services/contractService');

const app = express();
app.use(express.json());
app.use('/api/v1/contract', require('../../routes/contract'));

const generateToken = () => jwt.sign(
  { userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

describe('合同取消工作流', () => {
  const token = generateToken();

  beforeEach(() => {
    oppMock.advanceStage.mockReset();
    contractMock.cancelContract.mockReset();
  });

  it('Case1: 客户取消 → 商机推进 stage 6', async () => {
    contractMock.cancelContract.mockResolvedValue({ id: 500, contract_no: 'CON-001', status: 4, cancel_reason: 'x', cancel_action: 'customer_cancelled', opportunity_id: 100 });
    oppMock.advanceStage.mockResolvedValue({ oldStage: 5, newStage: 6 });

    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 500, cancel_reason: 'x', cancel_action: 'customer_cancelled' });

    expect(res.status).toBe(200);
    expect(oppMock.advanceStage).toHaveBeenCalledTimes(1);
    expect(oppMock.advanceStage.mock.calls[0][1]).toBe(100);
    expect(oppMock.advanceStage.mock.calls[0][2]).toBe(6);
  });

  it('Case2: 重新谈判 → 商机推进 stage 4', async () => {
    contractMock.cancelContract.mockResolvedValue({ id: 500, contract_no: 'CON-001', status: 4, cancel_reason: 'x', cancel_action: 'reopen_negotiation', opportunity_id: 100 });
    oppMock.advanceStage.mockResolvedValue({ oldStage: 5, newStage: 4 });

    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 500, cancel_reason: 'x', cancel_action: 'reopen_negotiation' });

    expect(res.status).toBe(200);
    expect(oppMock.advanceStage).toHaveBeenCalledTimes(1);
    expect(oppMock.advanceStage.mock.calls[0][2]).toBe(4);
  });

  it('Case3: keep_won → 商机不动', async () => {
    contractMock.cancelContract.mockResolvedValue({ id: 500, contract_no: 'CON-001', status: 4, cancel_reason: 'x', cancel_action: 'keep_won', opportunity_id: 100 });

    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 500, cancel_reason: 'x', cancel_action: 'keep_won' });

    expect(res.status).toBe(200);
    expect(oppMock.advanceStage).not.toHaveBeenCalled();
  });

  it('Case4: 缺少 cancel_reason → 400', async () => {
    const res = await request(app)
      .post('/api/v1/contract/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 500, cancel_action: 'customer_cancelled' });

    expect(res.status).toBe(400);
  });
});

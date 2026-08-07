/**
 * 合同创建 - 商机自动推进测试
 * 验证 P1: 合同创建成功后自动推进商机到 stage 5(成交)
 * 3 用例: 带opp推进 / 无opp不动 / 已成交幂等
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_opp_advance';

// Mock opportunityService - 验证 advanceStage 调用
const mockAdvanceStage = jest.fn();
jest.mock('../../services/opportunityService', () => ({
  advanceStage: (...args) => mockAdvanceStage(...args)
}));
const mockCreateContract = jest.fn().mockResolvedValue({ id: 500, contract_no: 'CON-TEST-001' });
jest.mock('../../services/contractService', () => ({
  createContract: (...args) => mockCreateContract(...args)
}));
// mock contractCrudService.createContractNotification
jest.mock('../../services/contractCrudService', () => ({
  createContractNotification: jest.fn().mockResolvedValue(undefined)
}));

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockImplementation(() => Promise.resolve({
    query: jest.fn(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  }))
};
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

describe('合同创建 - 商机自动推进', () => {
  const token = generateToken();

  beforeEach(() => {
    mockAdvanceStage.mockReset();
    mockPool.query.mockReset();
  });

  // Case 1: 带 opportunity_id, 应推进到 stage 5
  it('Case1: 带 opportunity_id 创建合同 → 推进商机到 stage 5', async () => {
    mockAdvanceStage.mockResolvedValue({ oldStage: 3, newStage: 5, stageName: '成交' });

    const res = await request(app)
      .post('/api/v1/contract/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_id: 1, opportunity_id: 100, amount: 1000, sign_date: '2026-08-20' });

    expect(res.status).toBe(200);
    expect(mockAdvanceStage).toHaveBeenCalledTimes(1);
    // 验证调用参数: advanceStage(pool, 100, 5, 1, {changeReason})
    const call = mockAdvanceStage.mock.calls[0];
    expect(call[1]).toBe(100);  // opportunity_id
    expect(call[2]).toBe(5);    // stage 5
  });

  // Case 2: 无 opportunity_id, 不推进
  it('Case2: 无 opportunity_id 创建合同 → 不影响商机', async () => {
    mockCreateContract.mockResolvedValueOnce({ id: 501, contract_no: 'CON-TEST-002' });

    const res = await request(app)
      .post('/api/v1/contract/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_id: 1, amount: 1000, sign_date: '2026-08-20' });

    expect(res.status).toBe(200);
    expect(mockAdvanceStage).not.toHaveBeenCalled();
  });

  // Case 3: 商机已成交(stage 5), advanceStage throw, 合同仍成功(幂等)
  it('Case3: 商机已成交 → 不重复推进, 合同成功', async () => {
    mockAdvanceStage.mockRejectedValue(new Error('商机已成交，不可再推进'));
    mockCreateContract.mockResolvedValueOnce({ id: 502, contract_no: 'CON-TEST-003' });

    const res = await request(app)
      .post('/api/v1/contract/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_id: 1, opportunity_id: 100, amount: 1000, sign_date: '2026-08-20' });

    expect(res.status).toBe(200);  // 合同保留
    expect(mockAdvanceStage).toHaveBeenCalledTimes(1);  // 尝试推进
    // 推进失败不阻塞合同(方案B)
    expect(res.body.code).toBe(200);
  });
});

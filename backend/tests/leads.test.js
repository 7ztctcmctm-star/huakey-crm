const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({
    release: jest.fn(),
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn()
  })
};

jest.mock('../config/database', () => mockPool);

jest.mock('../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1',
  createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['leads']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const { appErrorHandler, globalErrorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());

const leadsRoutes = require('../routes/customer/leads');
app.use('/api/v1/customer/leads', leadsRoutes);
app.use(appErrorHandler);
app.use(globalErrorHandler);

const generateToken = () => {
  return jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('线索管理模块', () => {
  const token = generateToken();

  beforeEach(() => {
    mockPool.query.mockReset();
  });

  function mockAuth() {
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]);
  }

  it('所有线索接口均应返回 410 Gone（模块已废弃）', async () => {
    mockAuth();
    const listRes = await request(app)
      .post('/api/v1/customer/leads/list')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 1, pageSize: 10 });
    expect(listRes.status).toBe(410);
    expect(listRes.body.code).toBe(410);
    expect(listRes.body.message).toContain('废弃');

    mockAuth();
    const claimRes = await request(app)
      .post('/api/v1/customer/leads/claim')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 1 });
    expect(claimRes.status).toBe(410);

    mockAuth();
    const convertRes = await request(app)
      .post('/api/v1/customer/leads/convert')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 1 });
    expect(convertRes.status).toBe(410);
  });
});

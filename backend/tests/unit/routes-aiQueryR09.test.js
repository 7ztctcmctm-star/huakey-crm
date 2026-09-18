/**
 * R-09 验收：/ai/query 自然语言 → SQL → 执行 → 结果
 *
 * 覆盖：
 *  - Ollama(qwen2.5:3b) 默认 provider 下的 Text-to-SQL（implicit via chatCompletion mock）
 *  - 维度白名单：仅 商机(crm_opportunity) / 客户只读(crm_customer) / 合同(crm_contract)
 *  - SELECT-only：非 SELECT / 多语句 / 危险关键字 一律降级并拒绝执行
 *  - 失败优雅降级：SQL 执行失败时返回提示而非崩溃
 *  - 数据范围服务端强制：非全局账号触及敏感业务表被拒
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_r09_unit_tests';

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
};

const mockReadOnlyPool = {
  query: jest.fn()
};

jest.mock('../../config/database', () => ({
  query: mockPool.query.bind(mockPool),
  getConnection: mockPool.getConnection.bind(mockPool),
  readOnlyPool: mockReadOnlyPool,
  isReadOnlyPoolAvailable: true
}));

jest.mock('../../middleware/logger', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  getIpAddress: () => '127.0.0.1'
}));

jest.mock('../../utils/llmClient', () => ({
  chatCompletion: jest.fn(),
  getProviderStatus: jest.fn().mockResolvedValue({ online: true, provider: 'ollama', model: 'qwen2.5:3b' })
}));

jest.mock('../../services/permissionService', () => ({
  getUserPermissions: jest.fn().mockResolvedValue(['ai']),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([])
}));

const app = express();
app.use(express.json());
app.use('/api/v1/ai', require('../../routes/ai'));

const { chatCompletion } = require('../../utils/llmClient');

const adminToken = () =>
  jwt.sign({ userId: 1, username: 'admin', roleId: 1, roleCode: 'super_admin', manageAll: true }, process.env.JWT_SECRET, { expiresIn: '1h' });

const salesToken = () =>
  jwt.sign({ userId: 2, username: 'sales1', roleId: 2, roleCode: 'sales', manageAll: false }, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('R-09 /ai/query', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue([[]]); // auth/permission 内部查询默认放行
    mockReadOnlyPool.query.mockReset();
    chatCompletion.mockReset();
  });

  describe('维度白名单（商机 / 客户只读 / 合同）', () => {
    it('允许 crm_customer 并返回 sql+rows+chartSuggestion', async () => {
      chatCompletion
        .mockResolvedValueOnce('SELECT COUNT(*) AS cnt FROM crm_customer WHERE status != 0')
        .mockResolvedValueOnce('共有 100 个活跃客户');
      mockReadOnlyPool.query.mockResolvedValueOnce([[{ cnt: 100 }]]);

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '活跃客户总数' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toContain('crm_customer');
      expect(res.body.data.rows).toHaveLength(1);
      expect(res.body.data.chartSuggestion).toBeDefined();
      expect(res.body.data.chartSuggestion.type).toBe('table'); // 单一汇总值
    });

    it('允许 crm_opportunity（字符维度 → 饼图建议）', async () => {
      chatCompletion
        .mockResolvedValueOnce('SELECT business_status, COUNT(*) AS c FROM crm_opportunity GROUP BY business_status')
        .mockResolvedValueOnce('各业务状态商机分布');
      mockReadOnlyPool.query.mockResolvedValueOnce([
        [{ business_status: 'following', c: 3 }, { business_status: 'signed', c: 5 }]
      ]);

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '各业务状态商机数量' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toContain('crm_opportunity');
      expect(res.body.data.chartSuggestion.type).toBe('pie');
    });

    it('允许 crm_contract', async () => {
      chatCompletion
        .mockResolvedValueOnce('SELECT SUM(amount) AS total FROM crm_contract')
        .mockResolvedValueOnce('合同总金额 500 万');
      mockReadOnlyPool.query.mockResolvedValueOnce([[{ total: 5000000 }]]);

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '合同总金额' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toContain('crm_contract');
    });
  });

  describe('SELECT-only 强制（非 SELECT 一律降级并拒绝执行）', () => {
    it('生成 INSERT 时降级，不执行、不返回 sql', async () => {
      chatCompletion.mockResolvedValueOnce('INSERT INTO crm_customer (company_name) VALUES ("x")');

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '新增一个客户' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toBe('');
      expect(res.body.data.rows).toHaveLength(0);
      expect(res.body.data.answer).toBeTruthy();
      expect(mockReadOnlyPool.query).not.toHaveBeenCalled();
    });

    it('含危险关键字(UNION/INFORMATION_SCHEMA)时被拒绝', async () => {
      chatCompletion.mockResolvedValueOnce('SELECT * FROM crm_customer UNION SELECT username, password FROM sys_user');

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '泄露用户表' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toBe('');
      expect(res.body.data.answer).toContain('仅支持查询');
      expect(mockReadOnlyPool.query).not.toHaveBeenCalled();
    });

    it('多语句(分号)被拒绝', async () => {
      chatCompletion.mockResolvedValueOnce('SELECT * FROM crm_customer; SELECT * FROM crm_contract');

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '两个查询' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toBe('');
      expect(res.body.data.answer).toContain('多条语句');
      expect(mockReadOnlyPool.query).not.toHaveBeenCalled();
    });
  });

  describe('维度越界（白名单外）', () => {
    it('crm_supplier 被拒绝并给出原因', async () => {
      chatCompletion.mockResolvedValueOnce('SELECT * FROM crm_supplier');

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '供应商列表' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toBe('');
      expect(res.body.data.answer).toContain('crm_supplier');
      expect(mockReadOnlyPool.query).not.toHaveBeenCalled();
    });
  });

  describe('失败优雅降级', () => {
    it('SQL 执行失败时返回提示且不崩溃', async () => {
      chatCompletion
        .mockResolvedValueOnce('SELECT * FROM crm_customer')
        .mockResolvedValueOnce('查询完成');
      mockReadOnlyPool.query.mockRejectedValueOnce(new Error('Unknown column'));

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ question: '列出客户' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toBeTruthy(); // sql 仍回显
      expect(res.body.data.rows).toHaveLength(0);
      expect(res.body.data.answer).toBeTruthy();
    });
  });

  describe('数据范围服务端强制', () => {
    it('非全局账号查询 crm_customer 被拒（宁拒不泄）', async () => {
      chatCompletion.mockResolvedValueOnce('SELECT id, company_name FROM crm_customer');

      const res = await request(app)
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${salesToken()}`)
        .send({ question: '列出所有客户' });

      expect(res.status).toBe(200);
      expect(res.body.data.sql).toBe('');
      expect(res.body.data.answer).toContain('数据范围不支持');
      expect(mockReadOnlyPool.query).not.toHaveBeenCalled();
    });
  });
});

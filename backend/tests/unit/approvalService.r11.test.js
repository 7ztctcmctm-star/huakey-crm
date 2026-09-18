/**
 * R-11 审批模块补全单测
 * 覆盖：阈值→审批人矩阵解析、转交、状态机、只读客户关联、规则 CRUD
 * 使用 mock pool，无需真实数据库。
 */
const approvalService = require('../../services/approvalService');

function makePool() {
  const connection = {
    release: jest.fn(),
    query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined)
  };
  const pool = {
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(connection)
  };
  return { pool, connection };
}

describe('R-11 审批模块补全', () => {
  describe('resolveThresholdApprover（阈值→审批人矩阵）', () => {
    it('按金额命中区间，解析指定用户审批人', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[{ id: 1, business_type: 'contract', min_amount: '100.00', max_amount: '1000.00', approver_type: 'user', approver_ref: '42', priority: 0 }]]);
      const r = await approvalService.resolveThresholdApprover(pool, 'contract', '500.00');
      expect(r).toEqual({ approver_type: 'user', approver_id: 42 });
    });

    it('金额在区间左闭右开边界：等于 min 命中，等于 max 不命中', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[{ id: 1, business_type: 'contract', min_amount: '100.00', max_amount: '1000.00', approver_type: 'user', approver_ref: '7', priority: 0 }]]);
      const hit = await approvalService.resolveThresholdApprover(pool, 'contract', '100.00');
      expect(hit.approver_id).toBe(7);

      const { pool: pool2 } = makePool();
      pool2.query.mockResolvedValueOnce([[]]); // >= max 不命中（右开）
      const miss = await approvalService.resolveThresholdApprover(pool2, 'contract', '1000.00');
      expect(miss).toBeNull();
    });

    it('max_amount 为 NULL 表示无上限', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[{ id: 1, business_type: 'contract', min_amount: '5000.00', max_amount: null, approver_type: 'user', approver_ref: '9', priority: 0 }]]);
      const r = await approvalService.resolveThresholdApprover(pool, 'contract', '999999.00');
      expect(r.approver_id).toBe(9);
    });

    it('manager 类型返回动态解析标记（不硬编码 roleId）', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[{ id: 1, business_type: 'contract', min_amount: '0.00', max_amount: null, approver_type: 'manager', approver_ref: null, priority: 0 }]]);
      const r = await approvalService.resolveThresholdApprover(pool, 'contract', '100.00');
      expect(r).toEqual({ approver_type: 'manager', approver_id: null });
    });

    it('role 类型按 roleCode 解析（禁止硬编码 roleId）', async () => {
      const { pool } = makePool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, business_type: 'contract', min_amount: '0.00', max_amount: null, approver_type: 'role', approver_ref: 'sales_manager', priority: 0 }]])
        .mockResolvedValueOnce([[{ id: 5 }]]); // sys_user JOIN sys_role ON role_code
      const r = await approvalService.resolveThresholdApprover(pool, 'contract', '100.00');
      expect(r).toEqual({ approver_type: 'role', approver_id: 5 });
      // 校验拼接 SQL 使用 role_code 字段
      const roleSql = pool.query.mock.calls[1][0];
      expect(roleSql).toContain('r.role_code');
    });

    it('多条规则按 priority 取高优先级（模拟 DB 的 ORDER BY priority DESC LIMIT 1）', async () => {
      const { pool } = makePool();
      // 真实 DB 会按 priority DESC 排序后 LIMIT 1，故 mock 直接返回已排序结果
      pool.query.mockResolvedValueOnce([[
        { id: 2, min_amount: '0.00', max_amount: null, approver_type: 'user', approver_ref: '22', priority: 10 },
        { id: 1, min_amount: '0.00', max_amount: null, approver_type: 'user', approver_ref: '11', priority: 0 }
      ]]);
      const r = await approvalService.resolveThresholdApprover(pool, 'contract', '100.00');
      expect(r.approver_id).toBe(22);
    });

    it('无匹配规则返回 null（调用方回退工作流默认审批人）', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[]]);
      const r = await approvalService.resolveThresholdApprover(pool, 'discount', '999999999.00');
      expect(r).toBeNull();
    });
  });

  describe('transferApproval（转交）', () => {
    it('审批人本人可转交给存在且非自己的目标', async () => {
      const { pool, connection } = makePool();
      connection.query
        .mockResolvedValueOnce([[{ id: 3, business_type: 'contract', business_id: 1, step_id: 1, step_order: 1, approver_id: 1, status: 'pending' }]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([[{ id: 8 }]]) // 目标用户存在
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE approver_id
      const r = await approvalService.transferApproval(pool, 3, 8, '出差转交', 1, false);
      expect(r.approver_id).toBe(8);
      expect(connection.commit).toHaveBeenCalled();
    });

    it('非审批人且无 manageAll 无权转交 → PERMISSION_DENIED', async () => {
      const { pool, connection } = makePool();
      connection.query.mockResolvedValueOnce([[{ id: 3, business_type: 'contract', business_id: 1, step_id: 1, step_order: 1, approver_id: 99, status: 'pending' }]]);
      await expect(approvalService.transferApproval(pool, 3, 8, 'x', 1, false))
        .rejects.toMatchObject({ code: expect.any(Number) });
      expect(connection.rollback).toHaveBeenCalled();
    });

    it('目标审批人不存在 → 业务校验失败', async () => {
      const { pool, connection } = makePool();
      connection.query
        .mockResolvedValueOnce([[{ id: 3, business_type: 'contract', business_id: 1, step_id: 1, step_order: 1, approver_id: 1, status: 'pending' }]])
        .mockResolvedValueOnce([[]]); // 目标不存在
      await expect(approvalService.transferApproval(pool, 3, 999, 'x', 1, false))
        .rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('已处理的记录不可转交', async () => {
      const { pool, connection } = makePool();
      connection.query.mockResolvedValueOnce([[]]); // 无 pending 记录
      await expect(approvalService.transferApproval(pool, 3, 8, 'x', 1, false))
        .rejects.toMatchObject({ code: expect.any(Number) });
    });
  });

  describe('getApprovalDetailFull（只读客户关联）', () => {
    it('关联客户仅 SELECT，绝不 UPDATE/DELETE crm_customer', async () => {
      const { pool } = makePool();
      // 依次为：业务记录、申请人、getApprovalDetail 内部查询、客户只读 SELECT
      pool.query
        .mockResolvedValueOnce([[{ id: 1, create_by: 2, amount: '1200.00', discount: '15', customer_id: 5 }]])
        .mockResolvedValueOnce([[{ real_name: '张三' }]])   // 申请人
        .mockResolvedValueOnce([[]])                         // getApprovalDetail 历史
        .mockResolvedValueOnce([[{ id: 5, company_name: '某科技', level: 'A', source: 'web', contact_name: '李', phone: '138' }]]); // 只读客户
      const r = await approvalService.getApprovalDetailFull(pool, 'contract', 1);
      expect(r.applicant).toBe('张三');
      expect(r.amount).toBe('1200.00');
      expect(r.discount).toBe('15');
      expect(r.customer.company_name).toBe('某科技');
      // 所有 SQL 均不得包含对 crm_customer 的写操作
      const allSql = pool.query.mock.calls.map(c => String(c[0]).toLowerCase());
      allSql.forEach(sql => {
        expect(sql).not.toContain('update crm_customer');
        expect(sql).not.toContain('delete from crm_customer');
        expect(sql).not.toContain('insert into crm_customer');
      });
    });
  });

  describe('approveRecord（状态机：末步通过 → approval_status=2）', () => {
    it('末步审批通过，业务表审批状态置为 2', async () => {
      const { pool, connection } = makePool();
      connection.query
        .mockResolvedValueOnce([[{ id: 1, workflow_id: 1, business_type: 'contract', business_id: 1, step_id: 1, step_order: 1, approver_id: 1, status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])    // update record
        .mockResolvedValueOnce([[]])                     // 无下一步（末步）
        .mockResolvedValueOnce([{ affectedRows: 1 }]);   // update contract approval_status=2
      const r = await approvalService.approveRecord(pool, 1, 'ok', 1, false);
      expect(r.is_final).toBe(true);
      // 末步业务状态更新应为 2（通过）
      const bizUpdateSql = connection.query.mock.calls[3][0];
      expect(bizUpdateSql).toContain('approval_status = 2');
    });
  });

  describe('规则 CRUD（阈值矩阵写入）', () => {
    it('createApprovalRule 写入 roleCode/userId，manager 时 approver_ref 留空', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([{ insertId: 100 }]);
      const r = await approvalService.createApprovalRule(pool, { business_type: 'contract', min_amount: 0, max_amount: null, approver_type: 'manager' }, 1);
      expect(r.id).toBe(100);
      const inserted = pool.query.mock.calls[0][1];
      // 参数顺序: business_type, min_amount, max_amount, approver_type, approver_ref, priority, status, description, created_by
      expect(inserted[4]).toBeNull(); // manager 时 approver_ref 留空
    });

    it('listApprovalRules 按业务类型过滤', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[{ id: 1, business_type: 'contract' }]]);
      const rows = await approvalService.listApprovalRules(pool, 'contract');
      expect(rows).toHaveLength(1);
      expect(pool.query.mock.calls[0][0]).toContain('business_type = ?');
    });
  });

  describe('工作流步骤 role 类型审批人解析（修复「roleId 被当 userId」缺陷）', () => {
    it('role 步骤：按角色 id 关联解出在职用户 id（不是角色 id 本身）', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[{ id: 99 }]]); // 该角色下的用户
      const id = await approvalService.resolveRoleApproverId(pool, { approver_type: 'role', approver_id: 4 });
      expect(id).toBe(99);
      // SQL 必须按角色关联（sys_role.id），不得直接把角色 id 当用户 id
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('sys_role');
      expect(sql).toContain('u.role_id = r.id');
      expect(pool.query.mock.calls[0][1]).toEqual([4]); // 入参是角色 id
    });

    it('role 步骤：该角色无可用用户 → 业务校验失败（不静默错派）', async () => {
      const { pool } = makePool();
      pool.query.mockResolvedValueOnce([[]]);
      await expect(
        approvalService.resolveRoleApproverId(pool, { approver_type: 'role', approver_id: 4 })
      ).rejects.toThrow();
    });

    it('非 role 步骤：原样返回 approver_id（user 类型行为不变）', async () => {
      const { pool } = makePool();
      const id = await approvalService.resolveRoleApproverId(pool, { approver_type: 'user', approver_id: 42 });
      expect(id).toBe(42);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('approveRecord 推进到 role 类型下一步：写入记录的是解析出的用户 id', async () => {
      const { pool, connection } = makePool();
      connection.query
        .mockResolvedValueOnce([[{ id: 1, workflow_id: 1, business_type: 'contract', business_id: 1, step_id: 1, step_order: 1, approver_id: 1, status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])                                    // update 当前记录
        .mockResolvedValueOnce([[{ id: 2, workflow_id: 1, step_order: 2, step_name: '复审', approver_type: 'role', approver_id: 4 }]]) // 下一步=role 类型（4 是角色 id）
        .mockResolvedValueOnce([[{ id: 99 }]])                                           // 角色 → 用户 99
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                                   // insert 新记录
      const r = await approvalService.approveRecord(pool, 1, 'ok', 1, false);
      expect(r.is_final).toBe(false);
      const insertCall = connection.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO crm_approval_record'));
      expect(insertCall).toBeTruthy();
      // 最后一个参数是 approver_id，必须是解析后的用户 id 99，而不是角色 id 4
      expect(insertCall[1][insertCall[1].length - 1]).toBe(99);
    });
  });
});

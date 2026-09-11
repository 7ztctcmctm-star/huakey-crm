/**
 * convertLeadToCustomer · 归属规则回归测试
 *
 * 对应缺陷（2026-09-11 实测确认）：
 *   此前无论谁转化都**不写 owner_id**，却仍往 crm_assign_log 写
 *   `to_user_id = customer.owner_id || operatorId` —— 日志说「已分给操作人」而数据没分。
 *   且产出的客户为 owner_id=NULL + pool_status='private' + business_status='following'，
 *   既不属公海（认领要求 pool_status='sea'），也无法再走潜客池（已非 lead），
 *   成为「无主正式客户」死区。
 *
 * 产品决策（2026-09-11 委托人确认）：按角色区分
 *   · 本人转化（销售等普通角色，manageAll=false）→ 归操作人，pool_status='private'
 *   · 代转化（老板/管理员，manageAll=true）→ 留空待分配，pool_status='sea'（进公海）
 *
 * 注意：后端用 Jest，expect 只能接收一个参数（Vitest 才支持第二个消息参数）。
 */

const customerService = require('../services/customerService');

const OPERATOR_ID = 71;

const LEAD_CUSTOMER = {
  id: 11,
  company_name: 'Minister Hi-Tech Park Ltd.',
  customer_type: 'prospect',
  business_status: 'lead',
  owner_id: null
};

function makePool(customerRow = LEAD_CUSTOMER) {
  const conn = {
    release: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([{ affectedRows: 1 }])
  };
  const pool = {
    // 第一次 query 是取客户，返回 [[row]]
    query: jest.fn().mockResolvedValue([[customerRow]]),
    getConnection: jest.fn().mockResolvedValue(conn)
  };
  return { pool, conn };
}

/** 取匹配 SQL 的那次调用的参数数组；未调用返回 null */
function paramsOf(conn, pattern) {
  const call = conn.query.mock.calls.find((c) => pattern.test(c[0]));
  return call ? call[1] : null;
}

describe('convertLeadToCustomer · 归属规则（按角色区分）', () => {
  test('本人转化（manageAll=false）→ 归属操作人、私有，并写分配日志', async () => {
    const { pool, conn } = makePool();

    const result = await customerService.convertLeadToCustomer(
      pool, 11, OPERATOR_ID, { manageAll: false }
    );

    // 应执行 UPDATE，且参数体现「归操作人 + 私有」
    const updateParams = paramsOf(conn, /UPDATE crm_customer/);
    expect(updateParams).not.toBeNull();
    expect(updateParams).toContain(OPERATOR_ID); // owner_id = 操作人
    expect(updateParams).toContain('private');   // pool_status
    expect(updateParams).toContain('following'); // business_status

    // 本人转化应写分配日志
    expect(paramsOf(conn, /crm_assign_log/)).not.toBeNull();
    expect(conn.commit).toHaveBeenCalled();

    expect(result.owner_id).toBe(OPERATOR_ID);
    expect(result.pool_status).toBe('private');
  });

  test('代转化（manageAll=true）→ 留空待分配、进公海，且不写分配日志', async () => {
    const { pool, conn } = makePool();

    const result = await customerService.convertLeadToCustomer(
      pool, 11, OPERATOR_ID, { manageAll: true }
    );

    const updateParams = paramsOf(conn, /UPDATE crm_customer/);
    expect(updateParams).toContain(null);   // owner_id = NULL（留空待分配）
    expect(updateParams).toContain('sea');  // pool_status = sea（进公海）

    // 【锁定缺陷】未真正分配时不得写「已分给操作人」的日志
    expect(paramsOf(conn, /crm_assign_log/)).toBeNull();

    expect(result.owner_id).toBeNull();
    expect(result.pool_status).toBe('sea');
  });

  test('代转化结果满足公海认领的前置条件（不再是死区）', async () => {
    const { pool, conn } = makePool();

    const result = await customerService.convertLeadToCustomer(
      pool, 11, OPERATOR_ID, { manageAll: true }
    );

    const updateParams = paramsOf(conn, /UPDATE crm_customer/);
    // claimPoolCustomer 要求：pool_status='sea' 且 business_status !== 'lead'
    const claimable = result.pool_status === 'sea' && updateParams.includes('following');
    expect(claimable).toBe(true);
  });

  test('默认不传 options 时等同本人转化（向后兼容）', async () => {
    const { pool } = makePool();

    const result = await customerService.convertLeadToCustomer(pool, 11, OPERATOR_ID);

    expect(result.owner_id).toBe(OPERATOR_ID);
    expect(result.pool_status).toBe('private');
  });

  test('非 lead 客户应拒绝转化', async () => {
    const { pool } = makePool({ ...LEAD_CUSTOMER, business_status: 'following' });

    await expect(
      customerService.convertLeadToCustomer(pool, 11, OPERATOR_ID, { manageAll: false })
    ).rejects.toThrow('该客户不是线索，无法转化');
  });

  test('客户不存在应报错且不开启事务', async () => {
    const { pool, conn } = makePool();
    pool.query = jest.fn().mockResolvedValue([[]]);

    await expect(
      customerService.convertLeadToCustomer(pool, 999, OPERATOR_ID, { manageAll: false })
    ).rejects.toBeDefined();

    // 不应在客户不存在时开启事务
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  test('事务异常时应回滚且不提交', async () => {
    const { pool, conn } = makePool();
    conn.query = jest.fn().mockRejectedValue(new Error('模拟写库失败'));

    await expect(
      customerService.convertLeadToCustomer(pool, 11, OPERATOR_ID, { manageAll: false })
    ).rejects.toThrow('模拟写库失败');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

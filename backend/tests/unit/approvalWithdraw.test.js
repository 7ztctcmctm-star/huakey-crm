/**
 * C3 删除逻辑治理 —— approvalService.withdrawApproval 物理删改状态取消
 * 覆盖：撤回走 UPDATE status=canceled（不再是 DELETE FROM crm_approval_record）；
 *       撤回后同一业务的 pending 查询为空 ⇒「没有待撤回的审批记录」（审计行仍在，
 *       只是状态变为 canceled，getApprovalDetail 不过滤 status 仍可渲染）；
 *       业务单据 approval_status 回落 0；权限与类型校验不变。
 * 使用 mock pool/connection，无需真实数据库。
 */
const approvalService = require('../../services/approvalService');
const ErrorCodes = require('../../errors/codes');

function makePool(opts = {}) {
  const pendingRecords = opts.pendingRecords !== undefined
    ? opts.pendingRecords
    : [[{ id: 11, workflow_id: 1, business_type: 'quote', business_id: 3, step_id: 2, step_order: 1, approver_id: 99, status: 'pending' }]];
  const bizRow = opts.bizRow !== undefined ? opts.bizRow : [[{ create_by: 42 }]];

  const connQueries = [];
  const connection = {
    release: jest.fn(),
    query: jest.fn(async (sql, params) => {
      connQueries.push({ sql, params });
      return [{ affectedRows: 1 }];
    }),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined)
  };
  const pool = {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM crm_approval_record')) return pendingRecords;
      if (sql.includes('SELECT create_by')) return bizRow;
      throw new Error('unexpected pool SQL: ' + sql);
    }),
    getConnection: jest.fn().mockResolvedValue(connection)
  };
  return { pool, connection, connQueries };
}

describe('C3 withdrawApproval 状态取消（替代物理删）', () => {
  it('撤回执行 UPDATE status=canceled，绝不对 crm_approval_record 发 DELETE', async () => {
    const { pool, connQueries } = makePool();
    await approvalService.withdrawApproval(pool, 'quote', 3, 42);

    const recordSqls = connQueries.filter(q => q.sql.includes('crm_approval_record'));
    expect(recordSqls).toHaveLength(1);
    expect(recordSqls[0].sql).toContain('status = "canceled"');
    expect(recordSqls[0].sql).not.toContain('DELETE');
    // 仍带 pending 条件，不会误伤已处理记录
    expect(recordSqls[0].sql).toContain('status = "pending"');
    expect(recordSqls[0].params).toEqual(['quote', 3]);
  });

  it('业务单据 approval_status 同步回落 0', async () => {
    const { pool, connQueries } = makePool();
    await approvalService.withdrawApproval(pool, 'quote', 3, 42);
    const biz = connQueries.find(q => q.sql.includes('approval_status = 0'));
    expect(biz).toBeDefined();
    expect(biz.params).toEqual([3]);
  });

  it('撤回后重复撤回 → 「没有待撤回的审批记录」（证明 canceled 行保留在库、只是不再是 pending）', async () => {
    const first = makePool();
    await approvalService.withdrawApproval(first.pool, 'quote', 3, 42);

    // 第二次：同一业务的 pending 查询返回空（记录已变 canceled，未被物理删除）
    const second = makePool({ pendingRecords: [[]] });
    await expect(approvalService.withdrawApproval(second.pool, 'quote', 3, 42))
      .rejects.toMatchObject({ code: ErrorCodes.RECORD_NOT_FOUND.code, message: '没有待撤回的审批记录' });
    // 第二次没有任何写操作
    expect(second.connQueries).toHaveLength(0);
  });

  it('只能撤回自己提交的审批（create_by 不匹配 → 403）', async () => {
    const { pool } = makePool({ bizRow: [[{ create_by: 999 }]] });
    await expect(approvalService.withdrawApproval(pool, 'quote', 3, 42))
      .rejects.toMatchObject({ httpStatus: 403, message: '只能撤回自己提交的审批' });
  });

  it('不支持的业务类型 → 400 且不触库', async () => {
    const { pool } = makePool();
    await expect(approvalService.withdrawApproval(pool, 'invoice', 3, 42))
      .rejects.toMatchObject({ code: ErrorCodes.BUSINESS_VALIDATION.code });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('无 pending 记录 → RECORD_NOT_FOUND，不开事务', async () => {
    const { pool, connection } = makePool({ pendingRecords: [[]] });
    await expect(approvalService.withdrawApproval(pool, 'quote', 3, 42))
      .rejects.toMatchObject({ code: ErrorCodes.RECORD_NOT_FOUND.code });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });
});

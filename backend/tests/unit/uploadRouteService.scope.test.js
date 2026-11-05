/**
 * P1-08：附件跨用户 IDOR 收口。
 *
 * 审计结论：GET /upload/list 只挂 checkPermission('file')，service 仅按
 * business_type + business_id 查询；POST /upload/delete 直接按 id 删除（含磁盘文件）。
 * 修复：列表按所属业务回溯客户并套用数据范围；未知业务类型回退仅本人可见；
 *       删除允许 manageAll / 上传者本人 / 对所属客户有数据范围。
 */

const uploadService = require('../../services/uploadRouteService');

jest.mock('../../utils/supabaseStorage', () => ({
  getSupabaseStorage: jest.fn().mockResolvedValue(null)
}));

function poolMock() {
  return { query: jest.fn() };
}

const PERM = { clause: 'c.owner_id = ?', params: [7] };

describe('uploadRouteService.listAttachments 归属隔离（P1-08）', () => {
  it('follow_up 附件：JOIN 客户并套用数据范围', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[]]);
    await uploadService.listAttachments(pool, { business_type: 'follow_up', business_id: 5 }, PERM, { userId: 7 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('JOIN crm_follow_up f');
    expect(sql).toContain('JOIN crm_customer c');
    expect(sql).toContain('c.owner_id = ?');
    expect(params).toEqual(['follow_up', 5, 7]);
  });

  it('customer 附件：直接按 customer_id 套用数据范围', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[]]);
    await uploadService.listAttachments(pool, { business_type: 'customer', business_id: 9 }, PERM, { userId: 7 });
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain('JOIN crm_customer c ON c.id = a.business_id');
    expect(sql).toContain('c.owner_id = ?');
  });

  it('未知业务类型普通用户：回退 create_by = 本人', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[]]);
    await uploadService.listAttachments(pool, { business_type: 'mystery', business_id: 5 }, PERM, { userId: 7 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('a.create_by = ?');
    expect(sql).not.toContain('c.owner_id');
    expect(params).toEqual(['mystery', 5, 7]);
  });

  it('未知业务类型 manageAll：不限上传者', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[]]);
    await uploadService.listAttachments(pool, { business_type: 'mystery', business_id: 5 }, PERM,
      { userId: 1, manageAll: true });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('1=1');
    expect(params).toEqual(['mystery', 5]);
  });
});

describe('uploadRouteService.deleteAttachment 归属隔离（P1-08）', () => {
  const ATTACHMENT = {
    id: 3, business_type: 'follow_up', business_id: 5,
    file_name: 'a.pdf', file_path: '/uploads/attachments/missing-file.pdf', create_by: 9
  };

  it('非上传者且无客户数据范围 → 403', async () => {
    const pool = poolMock();
    pool.query
      .mockResolvedValueOnce([[ATTACHMENT]]) // 附件
      .mockResolvedValueOnce([[{ owner_id: 9 }]]); // 所属客户负责人
    await expect(
      uploadService.deleteAttachment(pool, 3, { userId: 7 }, async () => false)
    ).rejects.toMatchObject({ code: 403001 });
    expect(pool.query.mock.calls.some(c => /UPDATE crm_attachment SET deleted_at/.test(c[0]))).toBe(false);
  });

  it('上传者本人可直接删除', async () => {
    const pool = poolMock();
    pool.query
      .mockResolvedValueOnce([[ATTACHMENT]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await uploadService.deleteAttachment(pool, 3, { userId: 9 });
    expect(pool.query.mock.calls[1][0]).toContain('UPDATE crm_attachment SET deleted_at');
  });

  it('经理对客户有数据范围 → 允许删除他人上传的附件', async () => {
    const pool = poolMock();
    pool.query
      .mockResolvedValueOnce([[ATTACHMENT]])
      .mockResolvedValueOnce([[{ owner_id: 9 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await uploadService.deleteAttachment(pool, 3, { userId: 7 }, async () => true);
    expect(pool.query.mock.calls[2][0]).toContain('UPDATE crm_attachment SET deleted_at');
  });

  it('未知业务类型非上传者 → 403（fail-closed）', async () => {
    const pool = poolMock();
    pool.query.mockResolvedValueOnce([[{ ...ATTACHMENT, business_type: 'mystery' }]]);
    await expect(
      uploadService.deleteAttachment(pool, 3, { userId: 7 }, async () => true)
    ).rejects.toMatchObject({ code: 403001 });
  });

  it('manageAll 可删除任意附件', async () => {
    const pool = poolMock();
    pool.query
      .mockResolvedValueOnce([[ATTACHMENT]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await uploadService.deleteAttachment(pool, 3, { userId: 1, manageAll: true });
    expect(pool.query.mock.calls[1][0]).toContain('UPDATE crm_attachment SET deleted_at');
  });
});

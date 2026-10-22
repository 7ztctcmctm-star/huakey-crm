const XLSX = require('xlsx');

const mockPool = { query: jest.fn() };
jest.mock('../config/database', () => mockPool);
// buildDataPermissionWhere 在真链路会查部门表；此处钉死权限子句，聚焦导出逻辑本身
jest.mock('../middleware/permission', () => ({
  buildDataPermissionWhere: jest.fn().mockResolvedValue({ clause: 'c.owner_id = ?', params: [7] })
}));

const svc = require('../services/contractExportService');

function makeXlsxBuffer(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('contractExportService · 导出合同列表', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    const { buildDataPermissionWhere } = require('../middleware/permission');
    buildDataPermissionWhere.mockResolvedValue({ clause: 'c.owner_id = ?', params: [7] });
  });

  it('状态映射与金额列：1-待执行 2-执行中 3-已完成 4-已取消', async () => {
    mockPool.query.mockResolvedValue([[
      { contract_no: 'HT-1', customer_name: 'A公司', amount: '1000.50', paid_amount: '200', sign_date: '2026-01-01', delivery_date: null, status: 1, payment_terms: '月结', remark: null, create_by_name: '张三', create_time: '2026-01-02' },
      { contract_no: 'HT-2', customer_name: 'B公司', amount: '2000', paid_amount: '0', sign_date: '2026-02-01', delivery_date: '2026-03-01', status: 2, payment_terms: '', remark: 'r', create_by_name: null, create_time: '2026-02-02' },
      { contract_no: 'HT-3', customer_name: 'C公司', amount: '3000', paid_amount: '3000', sign_date: '2026-03-01', delivery_date: null, status: 3, payment_terms: '', remark: null, create_by_name: '李四', create_time: '2026-03-02' },
      { contract_no: 'HT-4', customer_name: 'D公司', amount: '4000', paid_amount: '0', sign_date: '2026-04-01', delivery_date: null, status: 4, payment_terms: '', remark: null, create_by_name: '王五', create_time: '2026-04-02' },
      { contract_no: 'HT-5', customer_name: 'E公司', amount: '5000', paid_amount: '0', sign_date: '2026-05-01', delivery_date: null, status: 9, payment_terms: '', remark: null, create_by_name: null, create_time: '2026-05-02' }
    ]]);

    const buffer = await svc.exportContracts(mockPool, {}, { type: 'self', userId: 7 }, []);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    // 权限子句必须拼进 SQL（dataPermission 是真过滤的唯一通道）
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('c.owner_id = ?');
    expect(mockPool.query.mock.calls[0][1]).toEqual([7]);

    // 读回 workbook 校验映射
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    expect(rows.map(r => r['状态'])).toEqual(['待执行', '执行中', '已完成', '已取消', '']);
    expect(rows[0]['合同金额']).toBe(1000.5);
    expect(rows[0]['已回款']).toBe(200);
    expect(rows[0]['客户名称']).toBe('A公司');
  });

  it('敏感字段剥离：restrictedFields 含 amount 时删除中英文表头', async () => {
    mockPool.query.mockResolvedValue([[
      { contract_no: 'HT-1', customer_name: 'A公司', amount: '1000', paid_amount: '200', sign_date: null, delivery_date: null, status: 1, payment_terms: '', remark: null, create_by_name: null, create_time: '2026-01-02' }
    ]]);

    const buffer = await svc.exportContracts(mockPool, {}, { type: 'all' }, ['amount']);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    expect(rows[0]['合同金额']).toBeUndefined();
    expect(rows[0]['合同编号']).toBe('HT-1'); // 非敏感列保留
  });

  it('keyword 与 status 过滤进入 SQL 参数', async () => {
    mockPool.query.mockResolvedValue([[]]);
    await svc.exportContracts(mockPool, { keyword: '华科', status: '2' }, { type: 'all' }, []);

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('c.contract_no LIKE ?');
    expect(sql).toContain('c.status = ?');
    expect(params).toEqual([7, '%华科%', '%华科%', '2']);
  });

  it('空结果集也返回合法 xlsx（仅表头）', async () => {
    mockPool.query.mockResolvedValue([[]]);
    const buffer = await svc.exportContracts(mockPool, {}, { type: 'all' }, []);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('合同列表');
  });
});

describe('contractExportService · 导出回款列表', () => {
  beforeEach(() => mockPool.query.mockReset());

  it('日期范围与 keyword 进入 WHERE', async () => {
    mockPool.query.mockResolvedValue([[]]);
    await svc.exportPayments(mockPool, { keyword: '华科', start_date: '2026-01-01', end_date: '2026-06-30' });

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('p.deleted_at IS NULL');
    expect(sql).toContain('p.pay_date >= ?');
    expect(sql).toContain('p.pay_date <= ?');
    expect(params).toEqual(['%华科%', '%华科%', '2026-01-01', '2026-06-30']);
  });

  it('无条件时仅软删过滤', async () => {
    mockPool.query.mockResolvedValue([[]]);
    await svc.exportPayments(mockPool, {});
    expect(mockPool.query.mock.calls[0][1]).toEqual([]);
  });
});

describe('contractExportService · 批量导入回款', () => {
  beforeEach(() => mockPool.query.mockReset());

  function makeConn(overrides = {}) {
    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (sql.startsWith('SELECT id FROM crm_contract')) return overrides.contracts || [[{ id: 11 }]];
        return [{ affectedRows: 1 }];
      })
    };
    return conn;
  }

  it('空文件报业务校验错误', async () => {
    await expect(svc.importPayments(mockPool, makeXlsxBuffer([])))
      .rejects.toThrow('文件内容为空');
  });

  it('超过 500 条拒绝导入', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ 合同编号: `HT-${i}`, 回款日期: '2026-01-01', 回款金额: 100 }));
    await expect(svc.importPayments(mockPool, makeXlsxBuffer(rows)))
      .rejects.toThrow('单次导入不超过500条');
  });

  it('正常导入：逐行插入回款并把合同从待执行推进到执行中', async () => {
    const conn = makeConn();
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    const result = await svc.importPayments(mockPool, makeXlsxBuffer([
      { 合同编号: 'HT-1', 回款日期: '2026-01-05', 回款金额: 100, 回款方式: '银行转账', 备注: '首付' },
      { 合同编号: 'HT-2', 回款日期: '2026-02-05', 回款金额: 200 }
    ]));

    expect(result).toMatchObject({ success: 2, failed: 0 });
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();

    const inserts = conn.query.mock.calls.filter(c => c[0].startsWith('INSERT INTO crm_payment'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1]).toEqual([11, '2026-01-05', 100, '银行转账', '首付']);
    expect(inserts[1][1]).toEqual([11, '2026-02-05', 200, '银行转账', null]);
    const updates = conn.query.mock.calls.filter(c => c[0].startsWith('UPDATE crm_contract'));
    expect(updates[0][1]).toEqual([11]);
    expect(updates[0][0]).toContain('status = 2');
  });

  it('缺必填字段 / 合同不存在：计入 errors 不影响成功行', async () => {
    const conn = makeConn();
    let contractLookup = 0;
    conn.query = jest.fn(async (sql) => {
      if (sql.startsWith('SELECT id FROM crm_contract')) {
        contractLookup += 1;
        return contractLookup === 1 ? [[{ id: 11 }]] : [[]]; // 第二行合同不存在
      }
      return [{ affectedRows: 1 }];
    });
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    const result = await svc.importPayments(mockPool, makeXlsxBuffer([
      { 合同编号: 'HT-1', 回款日期: '2026-01-05', 回款金额: 100 },
      { 合同编号: 'NO-SUCH', 回款日期: '2026-01-05', 回款金额: 100 },
      { 合同编号: 'HT-1', 回款日期: null, 回款金额: 100 }
    ]));

    expect(result.success).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.errors[0]).toContain('合同编号 NO-SUCH 不存在');
    expect(result.errors[1]).toContain('缺少必填字段');
    expect(conn.commit).toHaveBeenCalled(); // 部分失败仍提交成功行
  });

  it('Excel 日期序列号按北京时区归一化（不减 8 小时退一天）', async () => {
    const conn = makeConn();
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    // 2026-01-05 的 Excel 序列号（1899-12-30 起算）
    const serial = Math.floor((Date.UTC(2026, 0, 5) - Date.UTC(1899, 11, 30)) / 86400000);
    await svc.importPayments(mockPool, makeXlsxBuffer([
      { 合同编号: 'HT-1', 回款日期: serial, 回款金额: 100 }
    ]));

    const insert = conn.query.mock.calls.find(c => c[0].startsWith('INSERT INTO crm_payment'));
    expect(insert[1][1]).toBe('2026-01-05');
  });

  it('入库过程抛错：回滚并释放连接', async () => {
    const conn = makeConn();
    conn.query = jest.fn(async (sql) => {
      if (sql.startsWith('SELECT id FROM crm_contract')) return [[{ id: 11 }]];
      if (sql.startsWith('INSERT INTO crm_payment')) throw new Error('deadlock');
      return [{ affectedRows: 1 }];
    });
    mockPool.getConnection = jest.fn().mockResolvedValue(conn);

    await expect(svc.importPayments(mockPool, makeXlsxBuffer([
      { 合同编号: 'HT-1', 回款日期: '2026-01-05', 回款金额: 100 }
    ]))).rejects.toThrow('deadlock');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

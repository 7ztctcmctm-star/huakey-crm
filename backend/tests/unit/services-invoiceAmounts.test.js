/**
 * invoiceService 金额三元组服务端校验（P1-1）
 *
 * 金额 / 税率 / 税额全部来自客户端。前端若用浮点算税额（amount * rate / 100），
 * 尾数会写进 DECIMAL(15,2)，且三者自相矛盾事后无从追溯 —— 这类请求重发也不会自愈，
 * 所以是 422 而非 400。税率按百分数（13 表示 13%，与 crm_invoice.tax_rate 注释一致）。
 */

jest.mock('../../middleware/logger', () => ({ createRouteLogger: () => jest.fn().mockResolvedValue() }));
jest.mock('../../middleware/permission', () => ({ buildDataPermissionWhere: jest.fn() }));
jest.mock('../../utils/fieldLog', () => ({ logFieldChanges: jest.fn() }));

const invoiceService = require('../../services/invoiceService');
const ErrorCodes = require('../../errors/codes');

function createMockConn() {
  return {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  };
}

function makePool(conn) {
  return { getConnection: jest.fn().mockResolvedValue(conn) };
}

/** 取 INSERT / UPDATE 的绑定参数 */
function paramsOf(mockFn, keyword) {
  const call = mockFn.mock.calls.find((c) => String(c[0]).includes(keyword));
  return call ? call[1] : null;
}

describe('invoiceService.createInvoice 金额校验', () => {
  beforeEach(() => jest.clearAllMocks());

  it('给了税率、没给税额时由服务端精确补齐：1000 × 13% = 130', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([[]])               // SELECT invoice_no
      .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

    await invoiceService.createInvoice(
      makePool(conn),
      { contract_id: 1, customer_id: 1, type: 1, amount: 1000, tax_rate: 13 },
      1
    );

    // (invoice_no, contract_id, customer_id, type, amount, tax_rate, tax_amount, ...)
    const p = paramsOf(conn.query, 'INSERT INTO crm_invoice');
    expect(p[4]).toBe(1000);
    expect(p[5]).toBe(13);
    expect(p[6]).toBe(130);
  });

  it('税额一致时放行，并按服务端精确值落库', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 2 }]);

    await invoiceService.createInvoice(
      makePool(conn),
      { contract_id: 1, customer_id: 1, type: 1, amount: 1000, tax_rate: 13, tax_amount: 130 },
      1
    );

    expect(paramsOf(conn.query, 'INSERT INTO crm_invoice')[6]).toBe(130);
  });

  it('税额不一致时应抛 422（INVOICE_TAX_MISMATCH），且不落库', async () => {
    const conn = createMockConn();
    conn.query.mockResolvedValue([[]]);

    await expect(
      invoiceService.createInvoice(
        makePool(conn),
        { contract_id: 1, customer_id: 1, type: 1, amount: 1000, tax_rate: 13, tax_amount: 130.01 },
        1
      )
    ).rejects.toMatchObject({ code: ErrorCodes.INVOICE_TAX_MISMATCH.code, httpStatus: 422 });

    expect(conn.query).not.toHaveBeenCalled(); // 校验在开事务之前，未占连接
  });

  it('浮点边界：1336.70 × 15% 精确值 200.51，客户端传 200.50（浮点算出的值）应 422', async () => {
    // 缺陷前提：原生浮点算出的税额就是 200.50
    expect(Number((1336.70 * 15 / 100).toFixed(2))).toBe(200.5);

    const conn = createMockConn();
    conn.query.mockResolvedValue([[]]);

    // ① 传浮点值 → 拒绝
    await expect(
      invoiceService.createInvoice(
        makePool(conn),
        { contract_id: 1, customer_id: 1, type: 1, amount: 1336.70, tax_rate: 15, tax_amount: 200.50 },
        1
      )
    ).rejects.toMatchObject({ httpStatus: 422 });

    // ② 传精确值 → 放行，且落库 200.51
    const conn2 = createMockConn();
    conn2.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 3 }]);
    await invoiceService.createInvoice(
      makePool(conn2),
      { contract_id: 1, customer_id: 1, type: 1, amount: 1336.70, tax_rate: 15, tax_amount: 200.51 },
      1
    );
    expect(paramsOf(conn2.query, 'INSERT INTO crm_invoice')[6]).toBe(200.51);
  });

  it('没给税率时无校验基准，税额按客户端传入精确取整（缺失则 null）', async () => {
    const conn = createMockConn();
    conn.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 4 }]);

    await invoiceService.createInvoice(
      makePool(conn),
      { contract_id: 1, customer_id: 1, type: 1, amount: 1000 },
      1
    );
    expect(paramsOf(conn.query, 'INSERT INTO crm_invoice')[6]).toBeNull();

    const conn2 = createMockConn();
    conn2.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 5 }]);
    await invoiceService.createInvoice(
      makePool(conn2),
      { contract_id: 1, customer_id: 1, type: 1, amount: 1000, tax_amount: 12.34 },
      1
    );
    expect(paramsOf(conn2.query, 'INSERT INTO crm_invoice')[6]).toBe(12.34);
  });

  it('税率为 0 时税额必须为 0', async () => {
    const conn = createMockConn();
    conn.query.mockResolvedValue([[]]);

    await expect(
      invoiceService.createInvoice(
        makePool(conn),
        { contract_id: 1, customer_id: 1, type: 1, amount: 1000, tax_rate: 0, tax_amount: 10 },
        1
      )
    ).rejects.toMatchObject({ httpStatus: 422 });
  });
});

describe('invoiceService.updateInvoice 金额校验', () => {
  beforeEach(() => jest.clearAllMocks());

  const oldRow = { id: 1, invoice_no: 'INV-260619-001', amount: '1000.00', tax_rate: '13.00', tax_amount: '130.00' };

  it('编辑时同样校验：税额不一致应 422 且不下发 UPDATE', async () => {
    const pool = { query: jest.fn().mockResolvedValue([[oldRow]]) };

    await expect(
      invoiceService.updateInvoice(pool, { id: 1, contract_id: 1, customer_id: 1, type: 1, amount: 1000, tax_rate: 13, tax_amount: 131 }, {})
    ).rejects.toMatchObject({ httpStatus: 422 });

    expect(pool.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE crm_invoice'), expect.anything());
  });

  it('税额一致时按服务端精确值更新', async () => {
    const pool = { query: jest.fn() };
    pool.query
      .mockResolvedValueOnce([[oldRow]])          // SELECT 旧数据
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

    await invoiceService.updateInvoice(
      pool,
      { id: 1, contract_id: 1, customer_id: 1, type: 1, amount: 1336.70, tax_rate: 15, tax_amount: 200.51 },
      {}
    );

    // (contract_id, customer_id, type, amount, tax_rate, tax_amount, invoice_date, status, remark, id)
    const p = paramsOf(pool.query, 'UPDATE crm_invoice');
    expect(p[3]).toBe(1336.7);
    expect(p[4]).toBe(15);
    expect(p[5]).toBe(200.51);
  });
});

/**
 * 两轮安全修复的专项回归测试（C-001 / H-003 / H-004 / H-005 / M-008）
 *
 * 背景：2026-10-09 两轮安全加固引入了 5 项修复，但当时未配套任何单测。
 *       此前已发生过一次教训——新增校验后，因为既有测试的 mock 未同步，
 *       一次性打挂 8 个套件 19 个用例（见 docs/fix-verification-report-2026-10-09.md）。
 *       本文件的作用是把「安全修复」本身锁死，防止后续改动无声回退。
 *
 * 覆盖矩阵：
 *   C-001  customReportService  报表列别名 sanitizeLabel —— 防存储型 SQL 注入
 *   H-003  quoteController.add  跨客户创建报价 → 403
 *   H-004  quoteController.toContract  转他人报价为合同 → 403
 *   H-005  opportunityController.add 跨客户创建商机 → 403
 *   M-008  transferService.createTransfer  转移给非业务角色 → 拒绝
 *
 * 统一原则：**按 SQL 内容路由 mock，绝不按调用顺序**。
 *          顺序 mock 是上一轮 19 个用例失败的根因，新增查询就会整体错位。
 */

const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn()
};

jest.mock('../../config/database', () => mockPool);

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../utils/fieldLog', () => ({
  logFieldChanges: jest.fn().mockResolvedValue(undefined)
}));

// 权限校验的 clause 由中间件拼装，测试里不需要真实 SQL 语义
jest.mock('../../middleware/permission', () => ({
  buildDataPermissionWhere: jest.fn().mockResolvedValue({ clause: '1=1', params: [] }),
  stripRestrictedFields: jest.fn((d) => d)
}));

// ============ 业务 service mock ============
const mockCreateQuote = jest.fn();
const mockGetQuote = jest.fn();
const mockConvertToContract = jest.fn();
jest.mock('../../services/quoteService', () => ({
  createQuote: (...a) => mockCreateQuote(...a),
  getQuote: (...a) => mockGetQuote(...a),
  convertToContract: (...a) => mockConvertToContract(...a),
  listQuotes: jest.fn()
}));

const mockCreateOpportunity = jest.fn();
jest.mock('../../services/opportunityService', () => ({
  createOpportunity: (...a) => mockCreateOpportunity(...a),
  listOpportunities: jest.fn()
}));

const quoteController = require('../../controllers/quoteController');
const opportunityController = require('../../controllers/opportunityController');
const { buildDataPermissionWhere } = require('../../middleware/permission');

/**
 * 伪造 req / res / next。
 * res.status(...).json(...) 需返回 res 以支持链式调用。
 */
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}

beforeEach(() => {
  mockPool.query.mockReset();
  mockCreateQuote.mockReset();
  mockGetQuote.mockReset();
  mockConvertToContract.mockReset();
  mockCreateOpportunity.mockReset();
  buildDataPermissionWhere.mockResolvedValue({ clause: '1=1', params: [] });
});

// ============================================================================
// C-001 · 报表列别名防注入
// ============================================================================
describe('C-001 · customReportService 列别名防存储型 SQL 注入', () => {
  const customReportService = require('../../services/customReportService');

  /** 捕获 runReport 实际下发的 dataSql */
  function captureDataSql(columnsConfig) {
    const captured = {};
    const pool = {
      query: jest.fn()
        // 1: 读报表配置（注意 mysql2 形态：const [configs] = await query()）
        .mockResolvedValueOnce([[{
          data_source: 'customer',
          columns_config: JSON.stringify(columnsConfig),
          filter_config: JSON.stringify([])
        }]])
        // 2: count（const [[{ total }]] = await query()）
        .mockImplementationOnce(async (sql) => { captured.countSql = sql; return [[{ total: 0 }]]; })
        // 3: data（const [rows] = await query()）
        .mockImplementationOnce(async (sql) => { captured.dataSql = sql; return [[]]; })
    };
    return { pool, captured };
  }

  it('恶意 label 含反引号+UNION 时应被替换为兜底别名，不得逃逸出反引号', async () => {
    const evil = 'x` , (SELECT password FROM sys_user) AS `y';
    const { pool, captured } = captureDataSql([{ field: 'company_name', label: evil }]);

    await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 });

    expect(captured.dataSql).toBeDefined();
    // 生成的标识符段必须是被清洗后的单一别名，不能出现裸反引号闭合
    expect(captured.dataSql).not.toContain('(SELECT password FROM sys_user)');
    expect(captured.dataSql).toMatch(/AS `col`/);
  });

  it('恶意 label 含分号/空格/DROP 时应被兜底', async () => {
    for (const evil of ['a; DROP TABLE sys_user', 'a b', "a'b", 'a`b', '--x']) {
      const { pool, captured } = captureDataSql([{ field: 'company_name', label: evil }]);
      await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 });
      expect(captured.dataSql).toMatch(/AS `col`/);
      expect(captured.dataSql).not.toMatch(/DROP TABLE/);
    }
  });

  it('合法中文/英文/下划线别名应原样保留（不误伤正常报表）', async () => {
    for (const ok of ['客户名称', 'company_name', '客户名称_2024', 'ABC123']) {
      const { pool, captured } = captureDataSql([{ field: 'company_name', label: ok }]);
      await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 });
      expect(captured.dataSql).toContain(`AS \`${ok}\``);
    }
  });

  it('超长别名（>60 字符）应被截断，不产生超长标识符', async () => {
    const long = 'A'.repeat(200);
    const { pool, captured } = captureDataSql([{ field: 'company_name', label: long }]);
    await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 });
    const m = captured.dataSql.match(/AS `([^`]*)`/);
    expect(m).not.toBeNull();
    expect(m[1].length).toBeLessThanOrEqual(60);
  });

  it('label 为 null/undefined 时应兜底为 col 而不抛错', async () => {
    for (const label of [null, undefined]) {
      const { pool, captured } = captureDataSql([{ field: 'company_name', label }]);
      await expect(customReportService.runReport(pool, 1, { page: 1, pageSize: 20 })).resolves.toBeDefined();
      expect(captured.dataSql).toMatch(/AS `col`/);
    }
  });

  it('label 为数字时应转字符串后按白名单判定（数字本身合法，不应误判为恶意）', async () => {
    // 说明：sanitizeLabel 会 String() 转换，'123' 命中 /^\w+$/ 属合法别名。
    // 这里锁定的是「数字不会导致抛错或产生非法 SQL」，而非必须兜底。
    const { pool, captured } = captureDataSql([{ field: 'company_name', label: 123 }]);
    await expect(customReportService.runReport(pool, 1, { page: 1, pageSize: 20 })).resolves.toBeDefined();
    expect(captured.dataSql).toMatch(/AS `123`/);
  });

  it('四种聚合方式（无/count/sum/avg）均应套用清洗后的别名', async () => {
    for (const agg of [null, 'count', 'sum', 'avg']) {
      const { pool, captured } = captureDataSql([{ field: 'company_name', label: 'x`y', agg }]);
      await customReportService.runReport(pool, 1, { page: 1, pageSize: 20 });
      expect(captured.dataSql).toMatch(/AS `col`/);
    }
  });
});

// ============================================================================
// H-003 · 跨客户创建报价 → 403
// ============================================================================
describe('H-003 · 报价创建的客户数据权限校验', () => {
  const VALID_BODY = {
    customer_id: 999,
    items: [{ product_id: 1, quantity: 1, unit_price: 100 }]
  };

  function makeReq(body = VALID_BODY, dataPermission = { type: 'self', userId: 5, ownerColumn: 'owner_id' }) {
    return { body, user: { userId: 5, roleCode: 'sales' }, dataPermission, traceId: 'test' };
  }

  it('客户不在操作者数据范围内时应返回 403 且不创建报价', async () => {
    mockPool.query.mockResolvedValueOnce([[]]); // 查不到 → 无权
    const res = makeRes();
    const next = jest.fn();

    await quoteController.add(makeReq(), res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/无权|不存在/);
    expect(mockCreateQuote).not.toHaveBeenCalled(); // 关键：必须在业务写入前拦下
    expect(next).not.toHaveBeenCalled();
  });

  it('客户在数据范围内时应放行并创建报价', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 999 }]]);
    mockCreateQuote.mockResolvedValue({ id: 1 });
    const res = makeRes();
    const next = jest.fn();

    await quoteController.add(makeReq(), res, next);

    expect(res.body.code).toBe(200);
    expect(mockCreateQuote).toHaveBeenCalledTimes(1);
  });

  it('权限子句与参数应拼入 SQL（不得裸拼 userInput）', async () => {
    buildDataPermissionWhere.mockResolvedValue({ clause: 'c.owner_id = ?', params: [5] });
    mockPool.query.mockResolvedValueOnce([[{ id: 999 }]]);
    mockCreateQuote.mockResolvedValue({ id: 1 });

    await quoteController.add(makeReq(), makeRes(), jest.fn());

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('c.owner_id = ?'); // 权限走占位符
    expect(sql).toContain('c.id = ?');        // 客户 ID 走占位符
    expect(params[0]).toBe(999);
    expect(params).toContain(5);
    expect(sql).not.toContain(String(999));   // 不可字面量内联
  });

  it('缺少 customer_id 时应先返回 400，不触发权限查询', async () => {
    const res = makeRes();
    await quoteController.add(makeReq({ items: [{ product_id: 1 }] }), res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('items 为空时应先返回 400，不触发权限查询', async () => {
    const res = makeRes();
    await quoteController.add(makeReq({ customer_id: 1, items: [] }), res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

// ============================================================================
// H-004 · 转他人报价为合同 → 403
// ============================================================================
describe('H-004 · 报价转合同的数据权限校验', () => {
  function makeReq(dataPermission = { type: 'self', userId: 5, ownerColumn: 'create_by' }) {
    return { body: { id: 300 }, user: { userId: 5, roleCode: 'sales' }, dataPermission, traceId: 'test' };
  }

  it('报价不存在或无权限（getQuote 返回 null）时应返回 403 且不转合同', async () => {
    mockGetQuote.mockResolvedValue(null);
    const res = makeRes();
    const next = jest.fn();

    await quoteController.toContract(makeReq(), res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/无权|不存在/);
    expect(mockConvertToContract).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('有权限时应把权限 clause 透传给 getQuote 并正常转合同', async () => {
    buildDataPermissionWhere.mockResolvedValue({ clause: 'q.create_by = ?', params: [5] });
    mockGetQuote.mockResolvedValue({ id: 300, customer_id: 999 });
    mockConvertToContract.mockResolvedValue({ id: 800 });
    const res = makeRes();

    await quoteController.toContract(makeReq(), res, jest.fn());

    expect(res.body.code).toBe(200);
    // 关键：getQuote 必须收到权限参数，否则会绕过数据范围
    const [, idArg, permArg] = mockGetQuote.mock.calls[0];
    expect(idArg).toBe(300);
    expect(permArg).toEqual({ clause: 'q.create_by = ?', params: [5] });
    expect(mockConvertToContract).toHaveBeenCalledTimes(1);
  });

  it('缺少报价 id 时应返回 400', async () => {
    const res = makeRes();
    const req = { body: {}, user: { userId: 5 }, dataPermission: {}, traceId: 'test' };
    await quoteController.toContract(req, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(mockGetQuote).not.toHaveBeenCalled();
  });
});

// ============================================================================
// H-005 · 跨客户创建商机 → 403
// ============================================================================
describe('H-005 · 商机创建的客户数据权限校验', () => {
  const VALID_BODY = { customer_id: 999, name: '越权商机', expected_amount: 1000 };

  function makeReq(body = VALID_BODY, dataPermission = { type: 'self', userId: 5, ownerColumn: 'owner_id' }) {
    return { body, user: { userId: 5, roleCode: 'sales' }, dataPermission, traceId: 'test' };
  }

  it('客户不在操作者数据范围内时应返回 403 且不创建商机', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);
    const res = makeRes();
    const next = jest.fn();

    await opportunityController.add(makeReq(), res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/无权|不存在/);
    expect(mockCreateOpportunity).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('客户在数据范围内时应放行并创建商机', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 999 }]]);
    mockCreateOpportunity.mockResolvedValue({ id: 1 });
    const res = makeRes();

    await opportunityController.add(makeReq(), res, jest.fn());

    expect(res.body.code).toBe(200);
    expect(mockCreateOpportunity).toHaveBeenCalledTimes(1);
  });

  it('权限子句应走占位符参数（防注入）', async () => {
    buildDataPermissionWhere.mockResolvedValue({ clause: 'c.owner_id = ?', params: [5] });
    mockPool.query.mockResolvedValueOnce([[{ id: 999 }]]);
    mockCreateOpportunity.mockResolvedValue({ id: 1 });

    await opportunityController.add(makeReq(), makeRes(), jest.fn());

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('c.owner_id = ?');
    expect(sql).not.toContain(String(999));
    expect(params[0]).toBe(999);
    expect(params).toContain(5);
  });
});

// ============================================================================
// M-008 · 转移接收人必须是在职业务角色
// ============================================================================
describe('M-008 · 客户转移的接收人角色校验', () => {
  /**
   * 构造 transferService 用的 conn mock（按 SQL 内容路由）。
   *
   * ⚠️ 用**有序数组**而非对象：Object 的键遍历顺序虽稳定，但一旦某条 SQL
   *    同时命中多个模式（如 pending 查询与 INSERT 都含表名），语义就变得脆弱。
   *    数组按声明顺序首个命中即返回，行为显式可预测。
   */
  function makeConn(routes = []) {
    return {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      query: jest.fn().mockImplementation((sql) => {
        const s = String(sql);
        for (const [pattern, result] of routes) {
          if (s.includes(pattern)) return Promise.resolve([typeof result === 'function' ? result(s) : result]);
        }
        return Promise.resolve([{ affectedRows: 1, insertId: 1 }]);
      })
    };
  }

  /**
   * 固定「客户存在且归属发起人」的有序路由基线。
   * 顺序很重要：角色校验 → pending 检查 → INSERT。
   * 用 'JOIN sys_role' / 'FROM crm_customer_transfer WHERE' / 'INSERT INTO' 三个互不重叠的模式。
   */
  function baseRoutes(userRows = []) {
    return [
      ['FROM crm_customer WHERE', [{ id: 10, company_name: 'A公司', owner_id: 5 }]],
      ['JOIN sys_role', userRows],
      ['FROM crm_customer_transfer WHERE', []]
    ];
  }

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../config/database', () => mockPool);
    jest.doMock('../../services/notificationService', () => ({
      createNotification: jest.fn().mockResolvedValue({ id: 1 }),
      dismissByBusiness: jest.fn().mockResolvedValue({ affectedRows: 1 })
    }));
  });

  /** 每次重新 require，确保拿到 doMock 生效的模块实例 */
  function loadTransferService() {
    let mod;
    jest.isolateModules(() => { mod = require('../../services/transferService'); });
    return mod;
  }

  it('接收人为 HR 等非业务角色时应拒绝转移', async () => {
    const transferService = loadTransferService();
    // 查无此人（JOIN sys_role 已过滤掉非业务角色）
    const conn = makeConn(baseRoutes([]));
    const pool = { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn().mockResolvedValue(conn) };
    mockPool.getConnection.mockResolvedValue(conn);

    await expect(
      transferService.createTransfer(pool, { customer_id: 10, to_user_id: 999 }, 5)
    ).rejects.toThrow(/接收人不存在、已停用或非业务角色/);
  });

  it('接收人已停用（status != 1）时应拒绝转移', async () => {
    const transferService = loadTransferService();
    const conn = makeConn(baseRoutes([]));
    const pool = { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn().mockResolvedValue(conn) };

    await expect(
      transferService.createTransfer(pool, { customer_id: 10, to_user_id: 888 }, 5)
    ).rejects.toThrow(/接收人不存在、已停用或非业务角色/);
  });

  it('接收人为有效 sales 时应通过角色校验（继续建转移单）', async () => {
    const transferService = loadTransferService();
    const conn = makeConn(baseRoutes([{ id: 7, real_name: '销售B' }]));
    const pool = { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn().mockResolvedValue(conn) };

    const res = await transferService.createTransfer(pool, { customer_id: 10, to_user_id: 7 }, 5);
    expect(res).toBeDefined();
    expect(conn.commit).toHaveBeenCalled();
  });

  it('角色校验 SQL 必须按 role.code 判定，且使用 JOIN sys_role，不得硬编码 roleId', async () => {
    const transferService = loadTransferService();
    const conn = makeConn(baseRoutes([{ id: 7, real_name: '销售B' }]));
    const pool = { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn().mockResolvedValue(conn) };

    await transferService.createTransfer(pool, { customer_id: 10, to_user_id: 7 }, 5);

    const roleSql = conn.query.mock.calls
      .map(c => String(c[0]))
      .find(s => s.includes('JOIN sys_role'));
    expect(roleSql).toBeDefined();
    expect(roleSql).toContain('r.code IN');
    // 铁律：禁止硬编码 roleId 数字
    expect(roleSql).not.toMatch(/role_id\s*=\s*\d/);
    expect(roleSql).not.toMatch(/role_id\s+IN\s*\(\s*\d/);
  });

  it('允许的角色应恰为 sales/manager/boss/super_admin（不含 hr/finance/purchase）', async () => {
    const transferService = loadTransferService();
    const conn = makeConn(baseRoutes([{ id: 7, real_name: 'B' }]));
    const pool = { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn().mockResolvedValue(conn) };

    await transferService.createTransfer(pool, { customer_id: 10, to_user_id: 7 }, 5);

    const roleSql = conn.query.mock.calls.map(c => String(c[0])).find(s => s.includes('JOIN sys_role'));
    for (const allow of ['sales', 'manager', 'boss', 'super_admin']) {
      expect(roleSql).toContain(`'${allow}'`);
    }
    for (const deny of ['hr', 'finance', 'purchase', 'engineer']) {
      expect(roleSql).not.toContain(`'${deny}'`);
    }
  });
});

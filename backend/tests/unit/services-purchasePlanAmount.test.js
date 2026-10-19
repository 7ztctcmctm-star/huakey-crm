/**
 * purchaseService.updatePlan 明细金额精度（P1-1）
 *
 * 原实现 `item.quantity * item.unit_price`：采购单价是 DECIMAL(12,4)，4 位小数与整数数量
 * 相乘的浮点尾数会落进 amount 列。此处与 createPlan / createPurchaseOrder 的合规写法对齐。
 */

const purchaseService = require('../../services/purchaseService');

function makeConn() {
  return {
    query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  };
}

function makePool(conn, planStatus = 'draft') {
  return {
    query: jest.fn().mockResolvedValue([[planStatus === null ? null : { status: planStatus }]]),
    getConnection: jest.fn().mockResolvedValue(conn)
  };
}

/** 从 conn.query 的调用中取出某类 SQL 的绑定参数 */
function paramsOf(conn, keyword) {
  const call = conn.query.mock.calls.find((c) => String(c[0]).includes(keyword));
  return call ? call[1] : null;
}

describe('purchaseService.updatePlan 明细金额', () => {
  beforeEach(() => jest.clearAllMocks());

  it('明细 amount 走 money.mul：3 × 0.1450 应为 0.44（原生浮点会算成 0.43）', async () => {
    // 缺陷前提
    expect(Number((3 * 0.145).toFixed(2))).toBe(0.43);

    const conn = makeConn();
    const pool = makePool(conn);
    await purchaseService.updatePlan(pool, 1, {
      items: [{ product_id: 11, quantity: 3, unit_price: 0.145 }]
    });

    // INSERT (plan_id, product_id, supplier_id, quantity, unit_price, amount, reason)
    const insertParams = paramsOf(conn, 'INSERT INTO crm_purchase_plan_item');
    expect(insertParams[5]).toBe(0.44);
  });

  it('计划总额按精确值累加：3×0.1450 + 0.10 + 0.20 = 0.74（浮点累加会算成 0.73）', async () => {
    // 缺陷前提：浮点累加的尾数累积后又被 toFixed 截断
    expect(Number((3 * 0.145 + 1 * 0.1 + 1 * 0.2).toFixed(2))).toBe(0.73);

    const conn = makeConn();
    const pool = makePool(conn);
    await purchaseService.updatePlan(pool, 1, {
      items: [
        { product_id: 11, quantity: 3, unit_price: 0.145 },
        { product_id: 12, quantity: 1, unit_price: 0.1 },
        { product_id: 13, quantity: 1, unit_price: 0.2 }
      ]
    });

    const updateParams = paramsOf(conn, 'UPDATE crm_purchase_plan');
    // UPDATE ... SET total_amount = ? WHERE id = ? → 最后一个是 id
    expect(updateParams[updateParams.length - 2]).toBe(0.74);
  });

  it('明细与总额口径一致：总额等于各明细 amount 精确求和', async () => {
    const conn = makeConn();
    const pool = makePool(conn);
    await purchaseService.updatePlan(pool, 1, {
      items: [
        { product_id: 11, quantity: 7, unit_price: 0.145 },
        { product_id: 12, quantity: 2, unit_price: 1.005 }
      ]
    });

    const insertParams = paramsOf(conn, 'INSERT INTO crm_purchase_plan_item');
    const updateParams = paramsOf(conn, 'UPDATE crm_purchase_plan');
    // 7 × 0.145 = 1.015 → 1.02；2 × 1.005 = 2.01 → 2.01；合计 3.03
    expect(insertParams[5]).toBe(1.02);
    expect(updateParams[updateParams.length - 2]).toBe(3.03);
  });

  it('计划不存在时返回 404，不写明细', async () => {
    const conn = makeConn();
    const pool = makePool(conn, null);
    const res = await purchaseService.updatePlan(pool, 999, { items: [] });

    expect(res).toMatchObject({ code: 404 });
    expect(conn.query).not.toHaveBeenCalled();
  });
});

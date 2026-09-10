/**
 * 金额计算工具测试（P1-1）
 *
 * 重点不是覆盖率，而是**锁定实测出来的浮点缺陷**：
 * 这些用例在修复前会失败（用原生浮点运算），修复后必须通过。
 */

const money = require('../utils/money');

describe('money 金额精度工具', () => {
  describe('复现并锁定 P1-1 缺陷', () => {
    it('折扣：1.50 × (1-0.15) 应为 1.28（原生浮点会算成 1.27）', () => {
      // 先确认缺陷前提成立：原生写法确实错
      expect(Number((1.5 * (1 - 0.15)).toFixed(2))).toBe(1.27);
      // 修复后必须得到精确值
      expect(money.applyDiscount(1.5, 0.15)).toBe(1.28);
    });

    it('折扣：一批曾算出偏差的金额都应正确', () => {
      const cases = [
        [1.5, 0.15, 1.28],
        [1.7, 0.15, 1.45],
        [2.3, 0.15, 1.96],
        [4.1, 0.15, 3.49],
        [7.1, 0.15, 6.04],
        [9.5, 0.15, 8.08],
        [9.7, 0.15, 8.25],
        [10.1, 0.15, 8.59],
      ];
      cases.forEach(([amount, rate, expected]) => {
        expect(money.applyDiscount(amount, rate)).toBe(expected);
      });
    });

    it('4 位小数单价：0.1450 × 1 应为 0.15（原生浮点会算成 0.14）', () => {
      expect(Number((0.145 * 1).toFixed(2))).toBe(0.14); // 缺陷前提
      expect(money.mul(0.145, 1)).toBe(0.15);
    });

    it('4 位小数单价：多个用例', () => {
      expect(money.mul(0.285, 1)).toBe(0.29);
      expect(money.mul(0.0725, 2)).toBe(0.15);
      expect(money.mul(0.1425, 2)).toBe(0.29);
      expect(money.mul(0.2825, 2)).toBe(0.57);
      expect(money.mul(0.075, 3)).toBe(0.23);
      expect(money.mul(0.011, 5)).toBe(0.06);
    });

    it('对照组：2 位单价 × 整数数量本来就正确，不应被改坏', () => {
      expect(money.mul(12.34, 3)).toBe(37.02);
      expect(money.mul(99.99, 7)).toBe(699.93);
    });
  });

  describe('基础运算', () => {
    it('add：0.1 + 0.2 应为 0.3', () => {
      expect(0.1 + 0.2).not.toBe(0.3); // 浮点事实
      expect(money.add(0.1, 0.2)).toBe(0.3);
    });

    it('sub：1000.10 - 1000.00 应为 0.10', () => {
      expect(money.sub(1000.1, 1000.0)).toBe(0.1);
    });

    it('sub：结果不应出现浮点尾数', () => {
      const r = money.sub(1000.1, 1000.0);
      expect(String(r)).toBe('0.1');
    });

    it('sum：逐项累加不应累积误差', () => {
      expect(money.sum([0.1, 0.2, 0.3])).toBe(0.6);
      expect(money.sum([0.335, 0.335, 0.335])).toBe(1.01);
      expect(money.sum([])).toBe(0);
    });

    it('round2：half-up 语义（0.125 → 0.13）', () => {
      expect(money.round2(0.125)).toBe(0.13);
      expect(money.round2(1.005)).toBe(1.01);
      expect(money.round2('2.674')).toBe(2.67);
      expect(money.round2('2.675')).toBe(2.68);
    });

    it('percentOf：13% of 100 应为 13', () => {
      expect(money.percentOf(100, 13)).toBe(13);
      expect(money.percentOf(1234.56, 6)).toBe(74.07);
    });
  });

  describe('精度与健壮性', () => {
    it('接受 mysql2 返回的 DECIMAL 字符串（精确解析，不经浮点）', () => {
      expect(money.mul('0.1450', '1')).toBe(0.15);
      expect(money.applyDiscount('1.50', '0.15')).toBe(1.28);
      expect(money.add('0.10', '0.20')).toBe(0.3);
    });

    it('大额 DECIMAL(15,2) 不丢精度', () => {
      expect(money.mul('99999999999.99', 1)).toBe(99999999999.99);
      expect(money.add('99999999999.99', '0.01')).toBe(100000000000);
    });

    it('负数正确处理', () => {
      expect(money.applyDiscount(-1.5, 0.15)).toBe(-1.28);
      expect(money.sub(0, 0.01)).toBe(-0.01);
    });

    it('非法输入应抛出明确错误', () => {
      expect(() => money.round2('abc')).toThrow(/无法解析/);
      expect(() => money.round2('1.2.3')).toThrow(/无法解析/);
    });

    it('NaN / Infinity 不抛异常（容错为 0）', () => {
      expect(money.round2(NaN)).toBe(0);
      expect(money.round2(Infinity)).toBe(0);
    });
  });
});

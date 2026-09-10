/**
 * 金额计算工具 —— 消除 IEEE 754 浮点误差
 *
 * 【背景 / P1-1】
 * 本项目金额列均为 DECIMAL(15,2)（采购单价为 DECIMAL(12,4)），**存储层是精确的**。
 * 但 JS 端用浮点数做乘法与折扣时会产生误差，且该误差会**直接写入 DECIMAL 列**
 * （MySQL 只按 2 位四舍五入，无法纠正已经偏掉的尾数）。
 *
 * 实测缺陷（可复现，见 tests/money.test.js）：
 *   1) 折扣：1.50 × (1 - 0.15)
 *        JS：1 - 0.15 === 0.84999999999999997780（偏小）
 *            → 1.2749999999999999 → 保留 2 位 = 1.27
 *        精确十进制：1.50 × 0.85 = 1.275 → 1.28        ← 相差 1 分，且会入库
 *   2) 4 位小数单价：0.1450 × 1
 *        JS：0.14499999999999999001 → 0.14
 *        精确十进制：0.1450 → 0.15                     ← 相差 1 分
 *   对照组（2 位单价 × 整数数量，如 12.34×3）无缺陷：误差被舍入吸收。
 *
 * 【实现约定】
 * - 中间表示：以 1e-6 为单位的 BigInt（标度 6，足以覆盖 DECIMAL(x,4) 的乘积）
 * - 只在**最后一次**舍入，避免双重舍入引入偏差
 * - 舍入策略：half-up（远离零），与 MySQL DECIMAL 行为一致
 * - 溢出：BigInt 无上限，无溢出风险
 */

/** 内部标度：6 位小数 */
const SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(SCALE); // 1e6
/** 乘积标度为 1e12，换算到「分」需除以 1e10 */
const PRODUCT_TO_CENTS = 10n ** 10n;

/**
 * 把入参规范化为「十进制字符串」。
 * - 字符串（mysql2 返回 DECIMAL 时的形态）原样使用，保证精确
 * - number 先用 15 位有效数字消除浮点噪声（1.2749999999999999 → 1.275）
 */
function toDecimalString(value) {
  if (typeof value === 'string') return value.trim();
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Number(n.toPrecision(15)));
}

/** 十进制字符串 → 以 1e-6 为单位的 BigInt */
function toScaledBigInt(value) {
  const s = toDecimalString(value);
  if (!s || s === '-' || !/^-?\d*\.?\d*$/.test(s)) {
    throw new TypeError(`money: 无法解析的金额 "${value}"`);
  }
  const negative = s.startsWith('-');
  const body = negative ? s.slice(1) : s;
  const [intPart = '0', fracPart = ''] = body.split('.');
  const frac = (fracPart + '0'.repeat(SCALE)).slice(0, SCALE);
  const big = BigInt((intPart || '0') + frac);
  return negative ? -big : big;
}

/** 四舍五入（half-up，远离零）：n / d */
function divRoundHalfUp(n, d) {
  const negative = n < 0n;
  const absN = negative ? -n : n;
  let q = absN / d;
  const r = absN % d;
  if (r * 2n >= d) q += 1n;
  return negative ? -q : q;
}

/** 以 1e-6 为单位的 BigInt → 保留 2 位小数的 number */
function scaledToAmount(scaled) {
  const cents = divRoundHalfUp(scaled, SCALE_FACTOR / 100n); // 除以 1e4 → 得到「分」
  return Number(cents) / 100;
}

/** 以 1e-12 为单位的乘积 BigInt → 保留 2 位小数的 number */
function productToAmount(product) {
  const cents = divRoundHalfUp(product, PRODUCT_TO_CENTS);
  return Number(cents) / 100;
}

/**
 * 保留 2 位小数（四舍五入，half-up）
 * @param {number|string} value
 * @returns {number}
 */
function round2(value) {
  return scaledToAmount(toScaledBigInt(value));
}

/** 精确加法：a + b */
function add(a, b) {
  return scaledToAmount(toScaledBigInt(a) + toScaledBigInt(b));
}

/** 精确减法：a - b */
function sub(a, b) {
  return scaledToAmount(toScaledBigInt(a) - toScaledBigInt(b));
}

/**
 * 精确乘法：a × b，结果保留 2 位小数。
 * 适用于「单价 × 数量」（单价可为 4 位小数）等场景。
 */
function mul(a, b) {
  return productToAmount(toScaledBigInt(a) * toScaledBigInt(b));
}

/**
 * 折扣计算：amount × (1 - discountRate)，结果保留 2 位小数。
 *
 * ⚠️ 这正是本项目实测出错的那类运算。
 * 禁止再直接写 `amount * (1 - rate)`。
 *
 * @param {number|string} amount 折前金额
 * @param {number|string} rate   折扣率，0.15 表示减免 15%
 */
function applyDiscount(amount, rate) {
  const factor = SCALE_FACTOR - toScaledBigInt(rate); // (1 - rate)，单位 1e-6
  return productToAmount(toScaledBigInt(amount) * factor);
}

/**
 * 按百分比取值：base × percent / 100，结果保留 2 位小数（如税额）。
 */
function percentOf(base, percent) {
  const product = toScaledBigInt(base) * toScaledBigInt(percent); // ×1e12
  // value = base × percent / 100；其「分」值 = base × percent = product / 1e12
  const cents = divRoundHalfUp(product, SCALE_FACTOR * SCALE_FACTOR);
  return Number(cents) / 100;
}

/**
 * 金额求和：对数组逐项精确累加，结果保留 2 位小数。
 */
function sum(values) {
  const list = values || [];
  const total = list.reduce((acc, v) => acc + toScaledBigInt(v), 0n);
  return scaledToAmount(total);
}

module.exports = {
  round2,
  add,
  sub,
  mul,
  applyDiscount,
  percentOf,
  sum,
  toDecimalString,
};

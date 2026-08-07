/**
 * CSV 安全导出工具
 * 提供公式注入防护（CSV Injection / DDE Injection）
 */

/**
 * 对单元格值进行公式注入防护转义
 * 以 =、+、-、@、\t、\r 开头的单元格在 Excel 中会被解释为公式，
 * 需要在前面加单引号 ' 来禁用公式解析
 * @param {*} value - 原始单元格值
 * @returns {string} 安全的字符串值
 */
function escapeCsvCell(value) {
  const str = (value ?? '').toString();
  // 检测危险前缀（DDE / formula injection 向量）
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * 将二维数据导出为 CSV 字符串
 * @param {Array<Object>} rows - 数据行数组
 * @param {Array<string>} [headers] - 列名列表，不传则从第一行的 keys 提取
 * @returns {string} CSV 文本
 */
function buildCsv(rows, headers) {
  if (!rows || rows.length === 0) return '';
  const cols = headers || Object.keys(rows[0]);
  const lines = [
    cols.join(','),
    ...rows.map(row =>
      cols.map(h => {
        const cell = escapeCsvCell(row[h]);
        // CSV 标准转义：含逗号/引号/换行的字段用双引号包裹
        return `"${cell.replace(/"/g, '""')}"`;
      }).join(',')
    )
  ];
  return lines.join('\n');
}

module.exports = { escapeCsvCell, buildCsv };

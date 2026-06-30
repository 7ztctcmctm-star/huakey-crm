/**
 * 字段级权限敏感字段注册表
 * 非管理员用户无法查看以下字段
 */

module.exports = {
  product: ['cost_price'],
  quote: ['cost_price'],
  purchase_item: ['unit_price', 'amount', 'total_price'],
  supplier: ['bank_account', 'tax_id', 'contact_phone', 'contact_email'],
  contract:      ['amount']
};

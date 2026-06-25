/**
 * 联系人路由服务层
 * 职责：处理联系人管理相关的业务逻辑
 */

/**
 * 查询联系人列表
 * @param {object} pool - 数据库连接池
 * @param {object} params - { customer_id, page, pageSize }
 * @returns {object} { list, total }
 */
async function listContacts(pool, params) {
  const { customer_id, page = 1, pageSize = 20 } = params;

  if (!customer_id) {
    throw new Error('客户ID不能为空');
  }

  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  const [countResult] = await pool.query(
    'SELECT COUNT(*) as total FROM crm_contact WHERE customer_id = ? AND deleted_at IS NULL',
    [customer_id]
  );
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT * FROM crm_contact
     WHERE customer_id = ? AND deleted_at IS NULL
     ORDER BY is_decision DESC, create_time DESC
     LIMIT ? OFFSET ?`,
    [customer_id, safePageSize, offset]
  );

  return { list: rows, total };
}

/**
 * 添加联系人
 * @param {object} pool - 数据库连接池
 * @param {object} params - 联系人参数
 * @returns {number} 新增联系人的ID
 * @throws {Error} 如果客户不存在则抛出错误
 */
async function addContact(pool, params) {
  const { customer_id, name, position, phone, email, wechat, is_decision, remark } = params;

  if (!customer_id || !name) {
    throw new Error('客户ID和联系人姓名不能为空');
  }

  const [customers] = await pool.query(
    'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
    [customer_id]
  );

  if (customers.length === 0) {
    throw new Error('客户不存在');
  }

  const [result] = await pool.query(
    `INSERT INTO crm_contact (customer_id, name, position, phone, email, wechat, is_decision, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [customer_id, name, position || null, phone || null, email || null, wechat || null, is_decision || 0, remark || null]
  );

  return result.insertId;
}

/**
 * 修改联系人
 * @param {object} pool - 数据库连接池
 * @param {object} params - 联系人参数
 * @throws {Error} 如果联系人ID为空则抛出错误
 */
async function updateContact(pool, params) {
  const { id, name, position, phone, email, wechat, is_decision, remark } = params;

  if (!id) {
    throw new Error('联系人ID不能为空');
  }

  await pool.query(
    `UPDATE crm_contact SET name = ?, position = ?, phone = ?, email = ?, wechat = ?, is_decision = ?, remark = ?
    WHERE id = ?`,
    [name, position || null, phone || null, email || null, wechat || null, is_decision || 0, remark || null, id]
  );
}

/**
 * 删除联系人（软删除）
 * @param {object} pool - 数据库连接池
 * @param {number} id - 联系人ID
 * @param {object} user - 当前用户信息
 * @param {function} canManageCustomer - 权限检查函数
 * @throws {Error} 如果联系人不存在或无权限则抛出错误
 */
async function deleteContact(pool, id, user, canManageCustomer) {
  if (!id) {
    throw new Error('联系人ID不能为空');
  }

  // 查询联系人所属客户
  const [contacts] = await pool.query(
    'SELECT customer_id FROM crm_contact WHERE id = ? AND deleted_at IS NULL',
    [id]
  );

  if (contacts.length === 0) {
    throw new Error('联系人不存在');
  }

  // 查询客户负责人
  const [customers] = await pool.query(
    'SELECT owner_id FROM crm_customer WHERE id = ?',
    [contacts[0].customer_id]
  );

  if (customers.length === 0) {
    throw new Error('所属客户不存在');
  }

  // 权限检查：有manageAll权限或客户负责人可删除
  if (!(await canManageCustomer(user, customers[0].owner_id))) {
    throw new Error('无权删除该联系人');
  }

  await pool.query('UPDATE crm_contact SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = {
  listContacts,
  addContact,
  updateContact,
  deleteContact
};

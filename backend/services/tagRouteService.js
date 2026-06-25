// 标签管理服务
// 从 routes/tag.js 提取的业务逻辑

/**
 * 获取所有标签
 */
async function listTags(pool) {
  const [tags] = await pool.query('SELECT id, name, color, sort FROM crm_tag WHERE deleted_at IS NULL ORDER BY sort');
  return tags;
}

/**
 * 获取客户的标签
 */
async function getCustomerTags(pool, customerId) {
  const [tags] = await pool.query(
    `SELECT t.id, t.name, t.color FROM crm_tag t
     JOIN crm_customer_tag ct ON t.id = ct.tag_id
     WHERE ct.customer_id = ? ORDER BY t.sort`,
    [customerId]
  );
  return tags;
}

/**
 * 设置客户标签（仅管理员/经理）
 */
async function setCustomerTags(pool, { customerId, tag_ids, userId, req }, logAction, getIpAddress) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 删除旧标签
    await conn.query('DELETE FROM crm_customer_tag WHERE customer_id = ?', [customerId]);
    // 插入新标签
    if (tag_ids && tag_ids.length > 0) {
      const values = tag_ids.map(tagId => [customerId, tagId]);
      await conn.query('INSERT INTO crm_customer_tag (customer_id, tag_id) VALUES ?', [values]);
    }
    await conn.commit();

    // 记录日志
    await logAction({
      module: '客户管理', action: '设置标签', method: 'POST',
      url: `/api/tag/customer/${customerId}`,
      params: { customer_id: customerId, tag_ids },
      ipAddress: getIpAddress(req), userId, userName: req.user.username,
      description: `为客户(ID:${customerId})设置标签`, status: 1
    });

    return { success: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 管理标签（仅管理员/经理）
 */
async function manageTag(pool, { action, id, name, color }) {
  if (action === 'add') {
    if (!name || !name.trim()) {
      return { error: '标签名称不能为空', status: 400 };
    }
    const [result] = await pool.query(
      'INSERT INTO crm_tag (name, color) VALUES (?, ?) ON DUPLICATE KEY UPDATE color=VALUES(color)',
      [name.trim(), color || '#1a56db']
    );
    return { id: result.insertId };
  } else if (action === 'update') {
    await pool.query('UPDATE crm_tag SET name = ?, color = ? WHERE id = ?', [name.trim(), color, id]);
    return { success: true };
  } else if (action === 'delete') {
    await pool.query('DELETE FROM crm_customer_tag WHERE tag_id = ?', [id]);
    await pool.query('UPDATE crm_tag SET deleted_at = NOW() WHERE id = ?', [id]);
    return { success: true };
  } else {
    return { error: '无效操作', status: 400 };
  }
}

module.exports = { listTags, getCustomerTags, setCustomerTags, manageTag };

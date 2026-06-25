// 部门管理服务
// 从 routes/dept.js 提取的业务逻辑

/**
 * 获取部门列表
 */
async function listDepts(pool) {
  const [rows] = await pool.query('SELECT id, name, parent_id, sort, create_time, update_time FROM sys_dept ORDER BY sort, id');
  return { list: rows, total: rows.length };
}

/**
 * 新增部门
 */
async function addDept(pool, { name, parent_id, sort }) {
  const [result] = await pool.query(
    'INSERT INTO sys_dept (name, parent_id, sort) VALUES (?, ?, ?)',
    [name, parent_id || 0, sort || 0]
  );
  return { id: result.insertId };
}

/**
 * 修改部门
 */
async function updateDept(pool, { id, name, parent_id, sort }) {
  await pool.query(
    'UPDATE sys_dept SET name=?, parent_id=?, sort=? WHERE id=?',
    [name, parent_id || 0, sort || 0, id]
  );
  return { success: true };
}

/**
 * 删除部门（检查子部门和用户关联）
 */
async function deleteDept(pool, { id }) {
  // 检查是否有子部门
  const [children] = await pool.query('SELECT COUNT(*) as cnt FROM sys_dept WHERE parent_id = ?', [id]);
  if (children[0].cnt > 0) {
    return { error: `该部门下有 ${children[0].cnt} 个子部门，无法删除`, status: 400 };
  }
  // 检查是否有用户属于该部门
  const [users] = await pool.query('SELECT COUNT(*) as cnt FROM sys_user WHERE dept_id = ?', [id]);
  if (users[0].cnt > 0) {
    return { error: `该部门下有 ${users[0].cnt} 个用户，无法删除`, status: 400 };
  }
  await pool.query('DELETE FROM sys_dept WHERE id=?', [id]);
  return { success: true };
}

module.exports = { listDepts, addDept, updateDept, deleteDept };

/**
 * 跟进模板路由服务层
 * 职责：处理跟进模板管理相关的业务逻辑
 */
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');

/**
 * 有效模板类型
 */
const VALID_TYPES = ['first', 'quote', 'deal', 'general'];

/**
 * 查询模板列表
 * @param {object} pool - 数据库连接池
 * @returns {Array} 模板列表
 */
async function listTemplates(pool) {
  const [rows] = await pool.query(
    `SELECT id, name, type, content, create_by, create_time
     FROM crm_followup_template
     WHERE deleted_at IS NULL
     ORDER BY type, name`
  );
  return rows;
}

/**
 * 创建模板
 * @param {object} pool - 数据库连接池
 * @param {object} params - { name, type, content }
 * @param {number} userId - 创建人ID
 * @returns {number} 新增模板的ID
 */
async function createTemplate(pool, params, userId) {
  const { name, type = 'general', content } = params;

  if (!name || !name.trim()) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '模板名称不能为空');
  }
  if (!content || !content.trim()) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '模板内容不能为空');
  }

  const safeType = VALID_TYPES.includes(type) ? type : 'general';

  const [result] = await pool.query(
    'INSERT INTO crm_followup_template (name, type, content, create_by) VALUES (?, ?, ?, ?)',
    [name.trim(), safeType, content.trim(), userId]
  );

  return result.insertId;
}

/**
 * 更新模板
 * @param {object} pool - 数据库连接池
 * @param {number} id - 模板ID
 * @param {object} params - { name, type, content }
 * @param {number} userId - 当前用户ID
 * @throws {Error} 如果模板不存在、无权限或参数无效则抛出错误
 */
async function updateTemplate(pool, id, params, userId) {
  const { name, type, content } = params;

  // 检查模板是否存在
  const [existing] = await pool.query(
    'SELECT id, create_by FROM crm_followup_template WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '模板不存在');
  }

  // 权限检查：创建人可修改
  const isOwner = existing[0].create_by === userId;
  if (!isOwner) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权修改此模板');
  }

  if (!name || !name.trim()) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '模板名称不能为空');
  }
  if (!content || !content.trim()) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '模板内容不能为空');
  }

  const safeType = VALID_TYPES.includes(type) ? type : 'general';

  await pool.query(
    'UPDATE crm_followup_template SET name = ?, type = ?, content = ? WHERE id = ?',
    [name.trim(), safeType, content.trim(), id]
  );
}

/**
 * 删除模板（软删除）
 * @param {object} pool - 数据库连接池
 * @param {number} id - 模板ID
 * @param {number} userId - 当前用户ID
 * @throws {Error} 如果模板不存在或无权限则抛出错误
 */
async function deleteTemplate(pool, id, userId) {
  const [existing] = await pool.query(
    'SELECT id, create_by FROM crm_followup_template WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '模板不存在');
  }

  // 权限检查：创建人可删除
  const isOwner = existing[0].create_by === userId;
  if (!isOwner) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权删除此模板');
  }

  await pool.query('UPDATE crm_followup_template SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate
};

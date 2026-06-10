const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');

const router = express.Router();

const roleAddSchema = Joi.object({
  name: Joi.string().required().max(100),
  code: Joi.string().required().max(50),
  description: Joi.string().allow(null, '').optional()
});

const roleUpdateSchema = Joi.object({
  id: Joi.number().integer().required(),
  name: Joi.string().max(100).optional(),
  code: Joi.string().max(50).optional(),
  description: Joi.string().allow(null, '').optional(),
  status: Joi.number().integer().valid(0, 1).optional().default(1)
});

const roleDeleteSchema = Joi.object({
  id: Joi.number().integer().required()
});

router.post('/list', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, code, description, status, create_time, update_time FROM sys_role ORDER BY id');
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: rows.length } });
  } catch (error) {
    console.error('[角色管理] 查询失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

const requireAdmin = (req, res, next) => {
  if (!req.user.manageAll && req.user.roleId !== 1) {
    return res.status(403).json({ code: 403, message: '无权限操作', data: null });
  }
  next();
};

router.post('/add', authenticateToken, requireAdmin, validate(roleAddSchema), async (req, res) => {
  try {
    const { name, code, description } = req.body;
    const [result] = await pool.query(
      'INSERT INTO sys_role (name, code, description) VALUES (?, ?, ?)',
      [name, code, description || null]
    );
    res.json({ code: 200, message: '新增角色成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[角色管理] 新增角色失败:', error);
    res.status(500).json({ code: 500, message: '新增角色失败', data: null });
  }
});

router.post('/update', authenticateToken, requireAdmin, validate(roleUpdateSchema), async (req, res) => {
  try {
    const { id, name, code, description, status } = req.body;
    await pool.query(
      'UPDATE sys_role SET name=?, code=?, description=?, status=? WHERE id=?',
      [name, code, description, status !== undefined ? status : 1, id]
    );
    res.json({ code: 200, message: '修改角色成功', data: null });
  } catch (error) {
    console.error('[角色管理] 修改角色失败:', error);
    res.status(500).json({ code: 500, message: '修改角色失败', data: null });
  }
});

router.post('/delete', authenticateToken, requireAdmin, validate(roleDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;
    // 检查是否有用户关联该角色
    const [users] = await pool.query('SELECT COUNT(*) as cnt FROM sys_user WHERE role_id = ?', [id]);
    if (users[0].cnt > 0) {
      return res.status(400).json({ code: 400, message: `该角色下有 ${users[0].cnt} 个用户，无法删除`, data: null });
    }
    await pool.query('DELETE FROM sys_role WHERE id=?', [id]);
    res.json({ code: 200, message: '删除角色成功', data: null });
  } catch (error) {
    console.error('[角色管理] 删除角色失败:', error);
    res.status(500).json({ code: 500, message: '删除角色失败', data: null });
  }
});

module.exports = router;

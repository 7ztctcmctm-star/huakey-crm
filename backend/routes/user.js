const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');

const router = express.Router();

const userListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  pageSize: Joi.number().integer().min(1).max(200).optional().default(10),
  username: Joi.string().allow('').optional().max(50),
  realName: Joi.string().allow('').optional().max(50)
});

const userAddSchema = Joi.object({
  username: Joi.string().required().max(50).trim(),
  password: Joi.string().required().min(6).max(100),
  real_name: Joi.string().allow(null, '').optional().max(50),
  phone: Joi.string().allow(null, '').optional().max(20),
  email: Joi.string().email().allow(null, '').optional().max(100),
  dept_id: Joi.number().integer().allow(null).optional(),
  role_id: Joi.number().integer().allow(null).optional()
});

const userUpdateSchema = Joi.object({
  id: Joi.number().integer().required(),
  real_name: Joi.string().allow(null, '').optional().max(50),
  phone: Joi.string().allow(null, '').optional().max(20),
  email: Joi.string().email().allow(null, '').optional().max(100),
  dept_id: Joi.number().integer().allow(null).optional(),
  role_id: Joi.number().integer().allow(null).optional(),
  status: Joi.number().integer().valid(0, 1).optional()
});

const userDeleteSchema = Joi.object({
  id: Joi.number().integer().required()
});

// 1. 获取用户列表
router.post('/list', authenticateToken, checkPermission('system:user'), validate(userListSchema), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, username, realName } = req.body;

    const offset = (page - 1) * pageSize;
    const params = [];
    let whereClause = 'WHERE u.status = 1';

    if (username) {
      whereClause += ' AND u.username LIKE ?';
      params.push(`%${username}%`);
    }

    if (realName) {
      whereClause += ' AND u.real_name LIKE ?';
      params.push(`%${realName}%`);
    }

    // 查询总数
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM sys_user u ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 查询列表
    const [users] = await pool.query(
      `SELECT 
        u.id, u.username, u.real_name, u.phone, u.email,
        u.dept_id, u.role_id, u.status, u.create_time, u.update_time,
        d.name as dept_name, r.name as role_name
      FROM sys_user u
      LEFT JOIN sys_dept d ON u.dept_id = d.id
      LEFT JOIN sys_role r ON u.role_id = r.id
      ${whereClause}
      ORDER BY u.create_time DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    res.json({
      code: 200,
      message: '获取用户列表成功',
      data: {
        list: users,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取用户列表失败',
      data: null
    });
  }
});

// 2. 添加用户
router.post('/add', authenticateToken, checkPermission('system:user:add'), validate(userAddSchema), async (req, res) => {
  try {
    const { username, password, real_name, phone, email, dept_id, role_id } = req.body;

    // 检查用户名是否已存在（仅检查未删除的用户）
    const [existingUsers] = await pool.query(
      'SELECT id FROM sys_user WHERE username = ? AND status = 1',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        code: 400,
        message: '用户名已存在',
        data: null
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 插入用户
    const [result] = await pool.query(
      `INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [username, hashedPassword, real_name || null, phone || null, email || null, dept_id || null, role_id || null]
    );

    res.json({
      code: 200,
      message: '添加用户成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('添加用户错误:', error);
    res.status(500).json({
      code: 500,
      message: '添加用户失败',
      data: null
    });
  }
});

// 3. 修改用户
router.post('/update', authenticateToken, checkPermission('system:user:edit'), validate(userUpdateSchema), async (req, res) => {
  try {
    const { id, real_name, phone, email, dept_id, role_id, status } = req.body;

    // 检查用户是否存在
    const [users] = await pool.query(
      'SELECT id FROM sys_user WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null
      });
    }

    // 构建更新字段
    const updates = [];
    const params = [];

    if (real_name !== undefined) {
      updates.push('real_name = ?');
      params.push(real_name);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (dept_id !== undefined) {
      updates.push('dept_id = ?');
      params.push(dept_id);
    }
    if (role_id !== undefined) {
      updates.push('role_id = ?');
      params.push(role_id);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '没有要更新的字段',
        data: null
      });
    }

    params.push(id);

    await pool.query(
      `UPDATE sys_user SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({
      code: 200,
      message: '修改用户成功',
      data: null
    });
  } catch (error) {
    console.error('修改用户错误:', error);
    res.status(500).json({
      code: 500,
      message: '修改用户失败',
      data: null
    });
  }
});

// 4. 删除用户（逻辑删除）
router.post('/delete', authenticateToken, checkPermission('system:user:delete'), validate(userDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;

    // 检查用户是否存在
    const [users] = await pool.query(
      'SELECT id FROM sys_user WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null
      });
    }

    // 不能删除自己
    if (id == req.user.userId) {
      return res.status(400).json({
        code: 400,
        message: '不能删除当前登录用户',
        data: null
      });
    }

    // 逻辑删除
    await pool.query(
      'UPDATE sys_user SET status = 0 WHERE id = ?',
      [id]
    );

    res.json({
      code: 200,
      message: '删除用户成功',
      data: null
    });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({
      code: 500,
      message: '删除用户失败',
      data: null
    });
  }
});

// 5. 获取用户详情
router.get('/detail/:id', authenticateToken, checkPermission('system:user'), async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await pool.query(
      `SELECT 
        u.id, u.username, u.real_name, u.phone, u.email,
        u.dept_id, u.role_id, u.status, u.create_time, u.update_time,
        d.name as dept_name, r.name as role_name
      FROM sys_user u
      LEFT JOIN sys_dept d ON u.dept_id = d.id
      LEFT JOIN sys_role r ON u.role_id = r.id
      WHERE u.id = ?`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null
      });
    }

    res.json({
      code: 200,
      message: '获取用户详情成功',
      data: users[0]
    });
  } catch (error) {
    console.error('获取用户详情错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取用户详情失败',
      data: null
    });
  }
});

module.exports = router;

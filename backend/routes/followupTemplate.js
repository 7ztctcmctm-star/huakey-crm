const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

// 获取所有模板
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, type, content, create_by, create_time
       FROM crm_followup_template
       WHERE deleted_at IS NULL
       ORDER BY type, name`
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[跟进模板] 获取列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建模板（仅管理员/经理）
router.post('/', authenticateToken, requireManager, async (req, res) => {
  try {
    const { name, type = 'general', content } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '模板名称不能为空', data: null });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ code: 400, message: '模板内容不能为空', data: null });
    }
    const validTypes = ['first', 'quote', 'deal', 'general'];
    const safeType = validTypes.includes(type) ? type : 'general';

    const [result] = await pool.query(
      'INSERT INTO crm_followup_template (name, type, content, create_by) VALUES (?, ?, ?, ?)',
      [name.trim(), safeType, content.trim(), req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[跟进模板] 创建失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新模板（仅管理员）
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, content } = req.body;

    // 检查模板是否存在
    const [existing] = await pool.query(
      'SELECT id, create_by FROM crm_followup_template WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ code: 404, message: '模板不存在', data: null });
    }

    // 权限检查：创建人可修改
    const isOwner = existing[0].create_by === req.user.userId;
    if (!isOwner) {
      return res.status(403).json({ code: 403, message: '无权修改此模板', data: null });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '模板名称不能为空', data: null });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ code: 400, message: '模板内容不能为空', data: null });
    }

    const validTypes = ['first', 'quote', 'deal', 'general'];
    const safeType = validTypes.includes(type) ? type : 'general';

    await pool.query(
      'UPDATE crm_followup_template SET name = ?, type = ?, content = ? WHERE id = ?',
      [name.trim(), safeType, content.trim(), id]
    );
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[跟进模板] 更新失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除模板（仅管理员）
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      'SELECT id, create_by FROM crm_followup_template WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ code: 404, message: '模板不存在', data: null });
    }

    // 权限检查：创建人可删除
    const isOwner = existing[0].create_by === req.user.userId;
    if (!isOwner) {
      return res.status(403).json({ code: 403, message: '无权删除此模板', data: null });
    }

    await pool.query('UPDATE crm_followup_template SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[跟进模板] 删除失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

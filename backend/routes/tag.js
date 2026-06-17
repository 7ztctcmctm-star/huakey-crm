const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 获取所有标签
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const [tags] = await pool.query('SELECT id, name, color, sort FROM crm_tag ORDER BY sort');
    res.json({ code: 200, message: 'success', data: tags });
  } catch (error) {
    console.error('获取标签列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取客户的标签
router.get('/customer/:customerId', authenticateToken, async (req, res) => {
  try {
    const [tags] = await pool.query(
      `SELECT t.id, t.name, t.color FROM crm_tag t
       JOIN crm_customer_tag ct ON t.id = ct.tag_id
       WHERE ct.customer_id = ? ORDER BY t.sort`,
      [req.params.customerId]
    );
    res.json({ code: 200, message: 'success', data: tags });
  } catch (error) {
    console.error('获取客户标签错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 设置客户标签（管理员）
router.post('/customer/:customerId', authenticateToken, async (req, res) => {
  try {
  const { tag_ids } = req.body;
  const customerId = req.params.customerId;
  const userId = req.user.userId;
  const roleId = req.user.roleId;

  // 仅管理员可设置标签
  if (roleId !== 1 && roleId !== 2) {
    return res.status(403).json({ code: 403, message: '仅管理员可设置标签', data: null });
  }

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
    const { logAction, getIpAddress } = require('../middleware/logger');
    await logAction({
      module: '客户管理', action: '设置标签', method: 'POST',
      url: `/api/tag/customer/${customerId}`,
      params: { customer_id: customerId, tag_ids },
      ipAddress: getIpAddress(req), userId, userName: req.user.username,
      description: `为客户(ID:${customerId})设置标签`, status: 1
    });

    res.json({ code: 200, message: '标签设置成功', data: null });
  } catch (error) {
    await conn.rollback();
    console.error('设置客户标签错误:', error);
    res.status(500).json({ code: 500, message: '设置失败', data: null });
  } finally {
    conn.release();
  }
  } catch (error) {
    console.error('设置客户标签错误:', error);
    res.status(500).json({ code: 500, message: '设置失败', data: null });
  }
});

// 管理标签（增删改）
router.post('/manage', authenticateToken, async (req, res) => {
  try {
  const { action, id, name, color } = req.body;
  const roleId = req.user.roleId;
  if (roleId !== 1 && roleId !== 2) {
    return res.status(403).json({ code: 403, message: '仅管理员可管理标签', data: null });
  }

  try {
    if (action === 'add') {
      if (!name || !name.trim()) {
        return res.status(400).json({ code: 400, message: '标签名称不能为空', data: null });
      }
      const [result] = await pool.query('INSERT INTO crm_tag (name, color) VALUES (?, ?) ON DUPLICATE KEY UPDATE color=VALUES(color)', [name.trim(), color || '#1a56db']);
      res.json({ code: 200, message: '标签已添加', data: { id: result.insertId } });
    } else if (action === 'update') {
      await pool.query('UPDATE crm_tag SET name = ?, color = ? WHERE id = ?', [name.trim(), color, id]);
      res.json({ code: 200, message: '标签已更新', data: null });
    } else if (action === 'delete') {
      await pool.query('DELETE FROM crm_customer_tag WHERE tag_id = ?', [id]);
      await pool.query('DELETE FROM crm_tag WHERE id = ?', [id]);
      res.json({ code: 200, message: '标签已删除', data: null });
    } else {
      return res.status(400).json({ code: 400, message: '无效操作', data: null });
    }
  } catch (error) {
    console.error('管理标签错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
  } catch (error) {
    console.error('管理标签错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

module.exports = router;

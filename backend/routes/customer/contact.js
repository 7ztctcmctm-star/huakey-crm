const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { canManageCustomer } = require('./detail');

const addContactSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  name: Joi.string().required().max(50),
  position: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  wechat: Joi.string().max(50).allow('', null),
  is_decision: Joi.number().integer().valid(0, 1).default(0),
  remark: Joi.string().max(500).allow('', null)
});

const router = express.Router();

// 添加联系人
router.post('/add', authenticateToken, checkPermission('customer:edit'), validate(addContactSchema), async (req, res) => {
  try {
    const { customer_id, name, position, phone, email, wechat, is_decision, remark } = req.body;

    if (!customer_id || !name) {
      return res.status(400).json({
        code: 400,
        message: '客户ID和联系人姓名不能为空',
        data: null
      });
    }

    const [customers] = await pool.query(
      'SELECT id FROM crm_customer WHERE id = ? AND status != 0',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '客户不存在',
        data: null
      });
    }

    const [result] = await pool.query(
      `INSERT INTO crm_contact (customer_id, name, position, phone, email, wechat, is_decision, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, name, position || null, phone || null, email || null, wechat || null, is_decision || 0, remark || null]
    );

    res.json({
      code: 200,
      message: '添加联系人成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('添加联系人错误:', error);
    res.status(500).json({
      code: 500,
      message: '添加联系人失败',
      data: null
    });
  }
});

// 修改联系人
router.post('/update', authenticateToken, checkPermission('customer:edit'), async (req, res) => {
  try {
    const { id, name, position, phone, email, wechat, is_decision, remark } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '联系人ID不能为空',
        data: null
      });
    }

    await pool.query(
      `UPDATE crm_contact SET name = ?, position = ?, phone = ?, email = ?, wechat = ?, is_decision = ?, remark = ?
      WHERE id = ?`,
      [name, position || null, phone || null, email || null, wechat || null, is_decision || 0, remark || null, id]
    );

    res.json({
      code: 200,
      message: '修改联系人成功',
      data: null
    });
  } catch (error) {
    console.error('修改联系人错误:', error);
    res.status(500).json({
      code: 500,
      message: '修改联系人失败',
      data: null
    });
  }
});

// 删除联系人
router.post('/delete', authenticateToken, checkPermission('customer:edit'), async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '联系人ID不能为空',
        data: null
      });
    }

    // 查询联系人所属客户
    const [contacts] = await pool.query(
      'SELECT customer_id FROM crm_contact WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '联系人不存在',
        data: null
      });
    }

    // 查询客户负责人
    const [customers] = await pool.query(
      'SELECT owner_id FROM crm_customer WHERE id = ?',
      [contacts[0].customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '所属客户不存在',
        data: null
      });
    }

    // 权限检查：有manageAll权限或客户负责人可删除
    if (!(await canManageCustomer(req.user, customers[0].owner_id))) {
      return res.status(403).json({
        code: 403,
        message: '无权删除该联系人',
        data: null
      });
    }

    await pool.query('UPDATE crm_contact SET deleted_at = NOW() WHERE id = ?', [id]);

    res.json({
      code: 200,
      message: '删除联系人成功',
      data: null
    });
  } catch (error) {
    console.error('删除联系人错误:', error);
    res.status(500).json({
      code: 500,
      message: '删除联系人失败',
      data: null
    });
  }
});

module.exports = router;

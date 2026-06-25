const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { canManageCustomer } = require('./detail');
const contactService = require('../../services/contactRouteService');

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

const updateContactSchema = Joi.object({
  id: Joi.number().integer().required(),
  name: Joi.string().required().max(50),
  position: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  wechat: Joi.string().max(50).allow('', null),
  is_decision: Joi.number().integer().valid(0, 1).default(0),
  remark: Joi.string().max(500).allow('', null)
});

const deleteContactSchema = Joi.object({
  id: Joi.number().integer().required()
});

const listContactSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const router = express.Router();

// 查询联系人列表
router.post('/list', authenticateToken, checkPermission('customer:view'), validate(listContactSchema), async (req, res) => {
  try {
    const result = await contactService.listContacts(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('查询联系人错误:', error);
    if (error.message === '客户ID不能为空') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 添加联系人
router.post('/add', authenticateToken, checkPermission('customer:edit'), validate(addContactSchema), async (req, res) => {
  try {
    const id = await contactService.addContact(pool, req.body);
    res.json({ code: 200, message: '添加联系人成功', data: { id } });
  } catch (error) {
    console.error('添加联系人错误:', error);
    if (error.message === '客户不存在' || error.message === '客户ID和联系人姓名不能为空') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '添加联系人失败', data: null });
  }
});

// 修改联系人
router.post('/update', authenticateToken, checkPermission('customer:edit'), validate(updateContactSchema), async (req, res) => {
  try {
    await contactService.updateContact(pool, req.body);
    res.json({ code: 200, message: '修改联系人成功', data: null });
  } catch (error) {
    console.error('修改联系人错误:', error);
    if (error.message === '联系人ID不能为空') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '修改联系人失败', data: null });
  }
});

// 删除联系人
router.post('/delete', authenticateToken, checkPermission('customer:edit'), validate(deleteContactSchema), async (req, res) => {
  try {
    await contactService.deleteContact(pool, req.body.id, req.user, canManageCustomer);
    res.json({ code: 200, message: '删除联系人成功', data: null });
  } catch (error) {
    console.error('删除联系人错误:', error);
    if (error.message === '联系人不存在' || error.message === '所属客户不存在') {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.message === '无权删除该联系人') {
      return res.status(403).json({ code: 403, message: error.message, data: null });
    }
    if (error.message === '联系人ID不能为空') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '删除联系人失败', data: null });
  }
});

module.exports = router;

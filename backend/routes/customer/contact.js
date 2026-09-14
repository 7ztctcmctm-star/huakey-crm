const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const customerDetailService = require('../../services/customerDetailService');
const contactService = require('../../services/contactRouteService');

// [2026-09-14 阶段4] 原从 './detail' 引入 canManageCustomer；detail.js 已随老树下线删除，
// 改为直接绑定 customerDetailService（其本就是对 canManageCustomer 的唯一实现）。
const canManageCustomer = (user, ownerId) => customerDetailService.canManageCustomer(pool, user, ownerId);

const addContactSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  name: Joi.string().required().max(50),
  position: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  wechat: Joi.string().max(50).allow('', null),
  is_decision: Joi.number().integer().valid(0, 1).default(0),
  is_primary: Joi.number().integer().valid(0, 1).default(0),
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
  is_primary: Joi.number().integer().valid(0, 1).default(0),
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
router.post('/list', authenticateToken, checkPermission('customer:view'), validate(listContactSchema), async (req, res, next) => {
  try {
    const result = await contactService.listContacts(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    next(error);
  }
});

// 添加联系人
router.post('/add', authenticateToken, checkPermission('customer:edit'), validate(addContactSchema), async (req, res, next) => {
  try {
    const id = await contactService.addContact(pool, req.body, req.user, canManageCustomer);
    res.json({ code: 200, message: '添加联系人成功', data: { id } });
  } catch (error) {
    next(error);
  }
});

// 修改联系人
router.post('/update', authenticateToken, checkPermission('customer:edit'), validate(updateContactSchema), async (req, res, next) => {
  try {
    await contactService.updateContact(pool, req.body, req.user, canManageCustomer);
    res.json({ code: 200, message: '修改联系人成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 删除联系人
router.post('/delete', authenticateToken, checkPermission('customer:edit'), validate(deleteContactSchema), async (req, res, next) => {
  try {
    await contactService.deleteContact(pool, req.body.id, req.user, canManageCustomer);
    res.json({ code: 200, message: '删除联系人成功', data: null });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

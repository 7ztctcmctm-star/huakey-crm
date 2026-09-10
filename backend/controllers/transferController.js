/**
 * 客户转移控制器（双方同意制）
 *
 * 对应服务：services/transferService.js
 * 业务规则见该文件头部注释（需同意 / 不可撤回 / 超 3 天回流）
 */

const pool = require('../config/database');
const transferService = require('../services/transferService');
const { logAction, getIpAddress } = require('../middleware/logger');

/** 发起转移（销售 A → 销售 B） */
async function create(req, res, next) {
  try {
    const result = await transferService.createTransfer(pool, req.body, req.user.userId);
    await logAction({
      module: 'customer',
      action: 'transfer-create',
      method: req.method,
      url: req.originalUrl,
      ipAddress: getIpAddress(req),
      userId: req.user.userId,
      userName: req.user.username,
      description: `发起客户转移申请（客户ID ${result.customer_id} → 用户ID ${result.to_user_id}）`
    });
    res.json({ code: 200, message: `转移申请已发出，等待对方在 ${result.expire_days} 天内处理`, data: result });
  } catch (error) {
    next(error);
  }
}

/** 接收人同意 */
async function accept(req, res, next) {
  try {
    const result = await transferService.acceptTransfer(pool, req.body.id, req.user.userId);
    await logAction({
      module: 'customer',
      action: 'transfer-accept',
      method: req.method,
      url: req.originalUrl,
      ipAddress: getIpAddress(req),
      userId: req.user.userId,
      userName: req.user.username,
      description: `同意客户转移申请（申请ID ${result.id}）`
    });
    res.json({ code: 200, message: '已同意转移，客户归属已变更', data: result });
  } catch (error) {
    next(error);
  }
}

/** 接收人拒绝 */
async function reject(req, res, next) {
  try {
    const result = await transferService.rejectTransfer(pool, req.body.id, req.user.userId, req.body.remark);
    await logAction({
      module: 'customer',
      action: 'transfer-reject',
      method: req.method,
      url: req.originalUrl,
      ipAddress: getIpAddress(req),
      userId: req.user.userId,
      userName: req.user.username,
      description: `拒绝客户转移申请（申请ID ${result.id}）`
    });
    res.json({ code: 200, message: '已拒绝该转移申请', data: result });
  } catch (error) {
    next(error);
  }
}

/** 我收到的待处理申请（通知栏 / 待办） */
async function myPending(req, res, next) {
  try {
    const data = await transferService.listMyPending(pool, req.user.userId, req.body || {});
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    next(error);
  }
}

/** 某客户的转移记录（含历史） */
async function byCustomer(req, res, next) {
  try {
    const data = await transferService.listByCustomer(pool, req.body.customer_id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, accept, reject, myPending, byCustomer };

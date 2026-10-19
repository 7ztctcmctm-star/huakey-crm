/**
 * 客户转移控制器（双方同意制）
 *
 * 对应服务：services/transferService.js
 * 业务规则见该文件头部注释（需同意 / 不可撤回 / 超 3 天回流）
 */

const pool = require('../config/database');
const transferService = require('../services/transferService');
const { logAction, getIpAddress } = require('../middleware/logger');
const { buildDataPermissionWhere } = require('../middleware/permission');

/**
 * 取幂等键：优先 Idempotency-Key 请求头，其次 body.idempotency_key。
 * ⚠️ body 传入时必须在对应 Joi schema 显式声明（validate 中间件 stripUnknown=true 会剥离未声明字段）。
 */
function idempotencyKeyOf(req) {
  return req.headers['idempotency-key'] || req.body.idempotency_key || null;
}

/** 发起转移（销售 A → 销售 B） */
async function create(req, res, next) {
  try {
    const result = await transferService.createTransfer(pool, req.body, req.user.userId, idempotencyKeyOf(req));
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
    const result = await transferService.acceptTransfer(pool, req.body.id, req.user.userId, idempotencyKeyOf(req));
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
    const result = await transferService.rejectTransfer(pool, req.body.id, req.user.userId, req.body.remark, idempotencyKeyOf(req));
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
    // [M-005] 校验操作者对该客户有数据权限，防止查看他人客户的转移历史
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const [customers] = await pool.query(
      `SELECT id FROM crm_customer c WHERE c.id = ? AND c.deleted_at IS NULL AND ${clause}`,
      [req.body.customer_id, ...params]
    );
    if (customers.length === 0) {
      return res.status(403).json({ code: 403, message: '客户不存在或无权操作', data: null });
    }
    const data = await transferService.listByCustomer(pool, req.body.customer_id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    next(error);
  }
}

/** 可转移的接收人候选（排除自己） */
async function candidates(req, res, next) {
  try {
    const data = await transferService.listTransferCandidates(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, accept, reject, myPending, byCustomer, candidates };

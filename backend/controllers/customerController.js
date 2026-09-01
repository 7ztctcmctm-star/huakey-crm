/**
 * customerController.refactored.js —— 薄控制器样板
 *
 * 重构要点（对照评审报告 C1/C2/m8）：
 * 1. controller 只做：取参 → 调 service → 审计日志 → res.json；错误一律 next(error)
 * 2. 删除所有手写校验（routes/customer/detail.js 已挂 Joi validate 中间件，重复校验）
 * 3. 删除 error.status/error.message 改写（让真实错误透传，appErrorHandler 统一渲染）
 * 4. 删除 error.code === 404/403/400/409 分支（service 改抛 AppError，由中间件分类）
 * 5. 唯一保留的“翻译点”：ER_DUP_ENTRY（DB 基础设施错误）→ AppError（领域错误），这是合理的 controller 职责
 *
 * 使用：直接覆盖 backend/controllers/customerController.js 即可（导出签名不变）
 */

const pool = require('../config/database')
const { logAction: rawLogAction, getIpAddress, createRouteLogger } = require('../middleware/logger')
const { logFieldChanges } = require('../utils/fieldLog')
const { invalidateCache } = require('../middleware/cache')
const { buildDataPermissionWhere } = require('../middleware/permission')

const AppError = require('../errors/AppError')
const ErrorCodes = require('../errors/codes')

const customerService = require('../services/customerService')
const customerDetailService = require('../services/customerDetailService')
const leadsService = require('../services/leadsService')
const assignService = require('../services/assignService')
const poolService = require('../services/poolService')
const importService = require('../services/importService')

const MODULE_NAME = '客户管理'
const logAction = createRouteLogger(MODULE_NAME)

// DB 重复键 → 领域错误（唯一允许在 controller 出现的“错误翻译”）
function translateDupEntry(message = '检测到重复客户（相同公司名和电话已存在），请核对后重试') {
  return new AppError(ErrorCodes.BUSINESS_VALIDATION, message)
}

// ==================== detail ====================

async function list(req, res, next) {
  try {
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c')
    const result = await customerService.listCustomers(pool, req.body, { clause, params })
    res.json({ code: 200, message: '获取客户列表成功', data: result })
  } catch (error) {
    next(error)
  }
}

async function create(req, res, next) {
  try {
    const result = await customerDetailService.addCustomer(pool, req.body, req.user.userId)
    await logAction(req, 'add', `新增客户: ${req.body.company_name}${result.assignedOwner ? '（已自动分配）' : ''}`)
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({
      code: 200,
      message: result.possibleDuplicates
        ? `添加客户成功（注意：已有 ${result.possibleDuplicates.length} 个同名客户，可能重复）`
        : '添加客户成功',
      data: { id: result.id, possibleDuplicates: result.possibleDuplicates }
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return next(translateDupEntry())
    next(error)
  }
}

async function update(req, res, next) {
  try {
    const { id, ...updateFields } = req.body
    const result = await customerDetailService.updateCustomer(pool, id, updateFields, req.user)
    await logAction(req, 'update', `修改客户: ${result.customer.company_name}`)
    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑',
      oldData: result.oldData,
      newData: updateFields,
      allowedFields: ['company_name', 'contact_name', 'phone', 'email', 'address', 'industry', 'source', 'level', 'status', 'remark'],
      description: `修改客户 "${result.customer.company_name}" 字段变更`
    })
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({ code: 200, message: '修改客户成功', data: null })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return next(translateDupEntry())
    next(error)
  }
}

async function remove(req, res, next) {
  try {
    await customerDetailService.deleteCustomer(pool, req.body.id, req.user)
    await logAction(req, 'delete', `删除客户: ID=${req.body.id}`)
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({ code: 200, message: '删除客户成功', data: null })
  } catch (error) {
    next(error)
  }
}

async function detail(req, res, next) {
  try {
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c')
    const data = await customerDetailService.getCustomerDetail(pool, req.params.id, { clause, params })
    res.json({ code: 200, message: '获取客户详情成功', data })
  } catch (error) {
    next(error)
  }
}

async function view360(req, res, next) {
  try {
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c')
    const data = await customerDetailService.getCustomer360(pool, req.params.id, { clause, params })
    res.json({ code: 200, message: '查询成功', data })
  } catch (error) {
    next(error)
  }
}

async function exportCustomers(req, res, next) {
  try {
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c')
    const buf = await customerDetailService.exportCustomers(pool, req.body, { clause, params })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx')
    res.send(buf)
    await logAction(req, 'export', '导出客户列表')
  } catch (error) {
    next(error)
  }
}

async function forward(req, res, next) {
  try {
    const result = await customerService.forwardStatus(pool, req.body.customer_id, req.user.userId)
    await rawLogAction({
      module: MODULE_NAME, action: 'forward', method: 'POST', url: '/api/customer/forward',
      params: { customer_id: req.body.customer_id },
      ipAddress: getIpAddress(req), userId: req.user.userId, userName: req.user.username,
      description: '客户状态推进', status: 1
    })
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({ code: 200, message: '状态推进成功', data: result })
  } catch (error) {
    next(error)
  }
}

async function backward(req, res, next) {
  try {
    const result = await customerService.backwardStatus(pool, req.body.customer_id, req.user.userId, req.body.reason)
    await rawLogAction({
      module: MODULE_NAME, action: 'backward', method: 'POST', url: '/api/customer/backward',
      params: { customer_id: req.body.customer_id, reason: req.body.reason },
      ipAddress: getIpAddress(req), userId: req.user.userId, userName: req.user.username,
      description: '客户状态回退', status: 1
    })
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({ code: 200, message: '状态回退成功', data: result })
  } catch (error) {
    next(error)
  }
}

// ==================== leads ====================

async function listLeads(req, res, next) {
  try {
    const result = await leadsService.getLeadsList(pool, req.body, req.user, customerDetailService.SOURCE_PARENT_MAP)
    res.json({ code: 200, message: '获取线索列表成功', data: result })
  } catch (error) {
    next(error)
  }
}

async function convertLead(req, res, next) {
  try {
    const result = await leadsService.convertLead(pool, req.body.id, req.user.userId)
    await logAction(req, 'convert', `线索转化: ${result.company_name} → 已分配`)
    res.json({ code: 200, message: '转化成功，已分配给当前销售', data: result })
  } catch (error) {
    next(error)
  }
}

async function batchConvertLeads(req, res, next) {
  try {
    const result = await leadsService.batchConvert(pool, req.body.ids)
    await logAction(req, 'batch-convert', `批量转化线索: ${result.converted}条成功`)
    res.json({ code: 200, message: '批量转化完成', data: result })
  } catch (error) {
    next(error)
  }
}

async function importLeads(req, res, next) {
  try {
    const result = await leadsService.importLeads(pool, req.body.leads, req.user.userId)
    await logAction(req, 'import', `导入线索: ${result.imported}条成功`)
    res.json({ code: 200, message: '导入完成', data: result })
  } catch (error) {
    next(error)
  }
}

async function claimLead(req, res, next) {
  try {
    const result = await leadsService.claimLead(pool, req.body.id, req.user.userId)
    await logAction(req, 'claim-lead', `领取线索: ${result.company_name}`)
    res.json({ code: 200, message: '领取成功，该线索已归您跟进', data: result })
  } catch (error) {
    next(error)
  }
}

async function markLeadLost(req, res, next) {
  try {
    await leadsService.markLeadLost(pool, req.body.id, req.user.userId)
    res.json({ code: 200, message: '已标记为流失', data: { id: req.body.id } })
  } catch (error) {
    next(error)
  }
}

async function getLeadsStats(req, res, next) {
  try {
    const result = await leadsService.getLeadsStats(pool, req.user)
    res.json({ code: 200, message: '查询成功', data: result })
  } catch (error) {
    next(error)
  }
}

// ==================== assign ====================

async function assign(req, res, next) {
  try {
    const { customer_id, to_user_id, remark } = req.body
    const result = await assignService.manualAssign(pool, customer_id, to_user_id, req.user.userId, remark)
    const actionDesc = to_user_id ? `分配给用户ID ${to_user_id}` : '回收为待分配'
    await logAction(req, 'assign', `${actionDesc}: ${result.company_name}`)
    res.json({ code: 200, message: result.message, data: null })
  } catch (error) {
    next(error)
  }
}

async function batchAssign(req, res, next) {
  try {
    const result = await assignService.batchAssign(pool, req.body.customer_ids, req.body.to_user_id, req.user.userId, req.body.remark)
    await logAction(req, 'batch-assign', `批量分配 ${result.count} 个客户 → 用户ID ${req.body.to_user_id}`)
    res.json({ code: 200, message: `成功分配 ${result.count} 个客户`, data: { count: result.count } })
  } catch (error) {
    next(error)
  }
}

async function listAssignLogs(req, res, next) {
  try {
    const data = await assignService.getAssignLogs(pool, req.body)
    res.json({ code: 200, message: '查询成功', data })
  } catch (error) {
    next(error)
  }
}

async function createAssignRule(req, res, next) {
  try {
    const id = await assignService.createRule(pool, req.body)
    await logAction(req, 'add-assign-rule', `添加分配规则: ${req.body.rule_name}`)
    res.json({ code: 200, message: '添加成功', data: { id } })
  } catch (error) {
    next(error)
  }
}

async function updateAssignRule(req, res, next) {
  try {
    const affectedRows = await assignService.updateRule(pool, req.body.id, req.body)
    if (affectedRows === 0) return next(new AppError(ErrorCodes.BUSINESS_VALIDATION, '无更新内容'))
    await logAction(req, 'update-assign-rule', `更新分配规则ID: ${req.body.id}`)
    res.json({ code: 200, message: '更新成功', data: null })
  } catch (error) {
    next(error)
  }
}

async function deleteAssignRule(req, res, next) {
  try {
    await assignService.deleteRule(pool, req.body.id)
    await logAction(req, 'delete-assign-rule', `删除分配规则ID: ${req.body.id}`)
    res.json({ code: 200, message: '删除成功', data: null })
  } catch (error) {
    next(error)
  }
}

async function autoAssign(req, res, next) {
  try {
    const result = await assignService.applyRule(pool, req.user.userId)
    if (result.count === 0) return next(new AppError(ErrorCodes.BUSINESS_VALIDATION, result.message))
    await logAction(req, 'auto-assign', `轮询分配 ${result.count} 个客户给 ${result.sales_count} 名销售`)
    res.json({ code: 200, message: `已将 ${result.count} 个客户分配给 ${result.sales_count} 名销售`, data: { count: result.count, sales_count: result.sales_count } })
  } catch (error) {
    next(error)
  }
}

async function getAssignRules(req, res, next) {
  try {
    const list = await assignService.getAssignRules(pool)
    res.json({ code: 200, message: '查询成功', data: list })
  } catch (error) {
    next(error)
  }
}

async function getSalesUsers(req, res, next) {
  try {
    const users = await assignService.getSalesUsers(pool)
    res.json({ code: 200, message: '查询成功', data: users })
  } catch (error) {
    next(error)
  }
}

async function getMySubordinates(req, res, next) {
  try {
    const users = await assignService.getMySubordinates(pool, req.user.userId)
    res.json({ code: 200, message: '查询成功', data: users })
  } catch (error) {
    next(error)
  }
}

// ==================== pool ====================

async function claim(req, res, next) {
  try {
    const result = await poolService.claimCustomer(pool, req.body.customer_id, req.user.userId, req.user)
    await logAction(req, 'claim', `认领客户: ${result.company_name}`)
    res.json({ code: 200, message: '认领客户成功', data: { protect_until: result.protect_until } })
  } catch (error) {
    next(error)
  }
}

async function batchClaim(req, res, next) {
  try {
    const result = await poolService.batchClaimCustomers(pool, req.body.customer_ids, req.user.userId, req.user)
    await logAction(req, 'batch-claim', `批量认领 ${result.claimed} 个客户`)
    const msg = `成功认领 ${result.claimed} 个客户` + (result.skipped.length > 0 ? `，跳过: ${result.skipped.join('; ')}` : '')
    res.json({ code: 200, message: msg, data: { claimed: result.claimed, skipped: result.skipped.length > 0 ? result.skipped : null } })
  } catch (error) {
    next(error)
  }
}

async function release(req, res, next) {
  try {
    const result = await poolService.releaseCustomer(pool, req.body.customer_id, req.user.userId, req.user)
    await logAction(req, 'release', `释放客户到公海: ${result.company_name}`)
    res.json({ code: 200, message: '释放客户成功', data: null })
  } catch (error) {
    next(error)
  }
}

async function batchRelease(req, res, next) {
  try {
    const result = await poolService.batchReleaseCustomers(pool, req.body.customer_ids, req.user.userId, req.user)
    await logAction(req, 'batch-release', `批量释放 ${result.count} 个客户到公海`)
    res.json({ code: 200, message: `成功释放 ${result.count} 个客户`, data: { count: result.count } })
  } catch (error) {
    next(error)
  }
}

async function listPoolLogs(req, res, next) {
  try {
    const result = await poolService.getPoolLogs(pool, req.body)
    res.json({ code: 200, message: '查询成功', data: result })
  } catch (error) {
    next(error)
  }
}

// ==================== import ====================

async function importPreview(req, res, next) {
  try {
    if (!req.file) return next(new AppError(ErrorCodes.VALIDATION_ERROR, '请上传Excel文件'))
    const data = await importService.importPreview(pool, req.file.buffer)
    res.json({ code: 200, message: '预览成功', data })
  } catch (error) {
    next(error)
  }
}

async function importConfirm(req, res, next) {
  try {
    if (!req.file) return next(new AppError(ErrorCodes.VALIDATION_ERROR, '请上传Excel文件'))
    const result = await importService.importCustomers(pool, req.file.buffer, req.user.userId)
    res.json({
      code: 200,
      message: `导入完成: 成功 ${result.success} 条, 重复 ${result.duplicates} 条, 验证失败 ${result.invalid} 条`,
      data: result
    })
  } catch (error) {
    next(error)
  }
}

// ==================== 潜客转化（Prompt 4-1） ====================

async function convertToCustomer(req, res, next) {
  try {
    const result = await customerService.convertToCustomer(pool, req.body.id);
    res.json({ code: 200, message: '转化为正式客户成功', data: result });
  } catch (error) {
    next(error);
  }
}

// ==================== Phase 2: 客户中心三页面 ====================

async function listLeadPool(req, res, next) {
  try {
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c')
    const result = await customerService.listLeads(pool, req.body, { clause, params })
    res.json({ code: 200, message: '获取潜客池列表成功', data: result })
  } catch (error) {
    next(error)
  }
}

async function listFormal(req, res, next) {
  try {
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c')
    const result = await customerService.listFormalCustomers(pool, req.body, { clause, params })
    res.json({ code: 200, message: '获取正式客户列表成功', data: result })
  } catch (error) {
    next(error)
  }
}

async function listPoolNew(req, res, next) {
  try {
    const { clause, params } = await buildDataPermissionWhere(req.dataPermission, 'c')
    const result = await customerService.listPoolCustomersNew(pool, req.body, { clause, params })
    res.json({ code: 200, message: '获取公海池列表成功', data: result })
  } catch (error) {
    next(error)
  }
}

async function convertLeadToFormal(req, res, next) {
  try {
    const result = await customerService.convertLeadToCustomer(pool, req.body.id, req.user.userId)
    await logAction(req, 'convert-lead', `潜客转正式客户: ${result.company_name}`)
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({ code: 200, message: '潜客转正式客户成功', data: result })
  } catch (error) {
    next(error)
  }
}

async function releaseToPool(req, res, next) {
  try {
    const result = await customerService.releaseCustomerToPool(pool, req.body.id, req.user.userId, req.body.reason)
    await logAction(req, 'release-to-pool', `释放客户到公海: ${result.company_name}`)
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({ code: 200, message: '释放客户到公海成功', data: null })
  } catch (error) {
    next(error)
  }
}

async function claimPool(req, res, next) {
  try {
    const result = await customerService.claimPoolCustomer(pool, req.body.id, req.user.userId)
    await logAction(req, 'claim-pool', `领取公海客户: ${result.company_name}`)
    await invalidateCache([`customer:list:${req.user.userId}:*`])
    res.json({ code: 200, message: '领取公海客户成功', data: { protect_until: result.protect_until } })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  list, create, update, remove, detail, view360, exportCustomers, forward, backward,
  listLeads, convertLead, batchConvertLeads, importLeads, claimLead, markLeadLost, getLeadsStats,
  convertToCustomer,
  assign, batchAssign, listAssignLogs, createAssignRule, updateAssignRule, deleteAssignRule, autoAssign,
  getAssignRules, getSalesUsers, getMySubordinates,
  claim, batchClaim, release, batchRelease, listPoolLogs, importPreview, importConfirm,
  // Phase 2: 客户中心三页面（新接口，旧接口保留兼容）
  listLeadPool, listFormal, listPoolNew, convertLeadToFormal, releaseToPool, claimPool
}

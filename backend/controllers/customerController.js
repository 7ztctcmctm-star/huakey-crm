const pool = require('../config/database');
const ROLES = require('../config/roles');
const logger = require('../config/logger');
const { buildDataPermissionWhere } = require('../middleware/permission');
const { logAction: rawLogAction, getIpAddress, createRouteLogger } = require('../middleware/logger');
const { logFieldChanges } = require('../utils/fieldLog');
const { invalidateCache } = require('../middleware/cache');

const customerService = require('../services/customerService');
const customerDetailService = require('../services/customerDetailService');
const leadsService = require('../services/leadsService');
const assignService = require('../services/assignService');
const poolService = require('../services/poolService');
const importService = require('../services/importService');

const MODULE_NAME = '客户管理';
const logAction = createRouteLogger(MODULE_NAME);

// ==================== detail.js ====================

async function list(req, res, next) {
  try {
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const result = await customerService.listCustomers(pool, req.body, { clause: permissionWhere, params: permParams });

    res.json({
      code: 200,
      message: '获取客户列表成功',
      data: {
        list: result.list,
        total: result.total,
        page: parseInt(req.body.page || 1),
        pageSize: parseInt(req.body.pageSize || 10)
      }
    });
  } catch (error) {
    logger.error('获取客户列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '获取客户列表失败';
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const { company_name, source } = req.body;

    if (!company_name) {
      return res.status(400).json({ code: 400, message: '公司名称不能为空', data: null });
    }

    if (source && !customerDetailService.VALID_SOURCES.includes(source)) {
      return res.status(400).json({ code: 400, message: `无效的客户来源: ${source}`, data: null });
    }

    const result = await customerDetailService.addCustomer(pool, req.body, req.user.userId);

    await logAction(req, 'add', `新增客户: ${company_name}${result.assignedOwner ? '（已自动分配）' : ''}`);
    await invalidateCache([`customer:list:${req.user.userId}:*`]);

    res.json({
      code: 200,
      message: result.possibleDuplicates
        ? `添加客户成功（注意：已有 ${result.possibleDuplicates.length} 个同名客户，可能重复）`
        : '添加客户成功',
      data: { id: result.id, possibleDuplicates: result.possibleDuplicates }
    });
  } catch (error) {
    logger.error('添加客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 409, message: '检测到重复客户（相同公司名和电话已存在），请核对后重试', data: null });
    }
    error.status = 500;
    error.message = '添加客户失败';
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const { id, ...updateFields } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    const result = await customerDetailService.updateCustomer(pool, id, updateFields, req.user);

    await logAction(req, 'update', `修改客户: ${result.customer.company_name}`);
    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑',
      oldData: result.oldData,
      newData: updateFields,
      allowedFields: ['company_name', 'contact_name', 'phone', 'email', 'address', 'industry', 'source', 'level', 'status', 'remark'],
      description: `修改客户 "${result.customer.company_name}" 字段变更`
    });

    await invalidateCache([`customer:list:${req.user.userId}:*`]);
    res.json({ code: 200, message: '修改客户成功', data: null });
  } catch (error) {
    logger.error('修改客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.code === 403) {
      return res.status(403).json({ code: 403, message: error.message, data: null });
    }
    if (error.code === 400) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    if (error.code === 409) {
      return res.status(409).json({ code: 409, message: error.message, data: { possibleDuplicates: error.possibleDuplicates } });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 409, message: '检测到重复客户（相同公司名和电话已存在），请核对后重试', data: null });
    }
    error.status = 500;
    error.message = '修改客户失败';
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    await customerDetailService.deleteCustomer(pool, id, req.user);

    await logAction(req, 'delete', `删除客户: ID=${id}`);
    await invalidateCache([`customer:list:${req.user.userId}:*`]);

    res.json({ code: 200, message: '删除客户成功', data: null });
  } catch (error) {
    logger.error('删除客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.code === 403) {
      return res.status(403).json({ code: 403, message: error.message, data: null });
    }
    error.status = 500;
    error.message = '删除客户失败';
    next(error);
  }
}

async function detail(req, res, next) {
  try {
    const { clause: permissionWhere, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const data = await customerDetailService.getCustomerDetail(pool, req.params.id, { clause: permissionWhere, params: permParams });

    res.json({ code: 200, message: '获取客户详情成功', data });
  } catch (error) {
    logger.error('获取客户详情错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    error.status = 500;
    error.message = '获取客户详情失败';
    next(error);
  }
}

async function view360(req, res, next) {
  try {
    const data = await customerDetailService.getCustomer360(pool, req.params.id);

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('获取客户360视图错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.code === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    error.status = 500;
    error.message = '服务器内部错误';
    next(error);
  }
}

async function exportCustomers(req, res, next) {
  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const buf = await customerDetailService.exportCustomers(pool, req.body, { clause: permissionClause, params: permParams });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');
    res.send(buf);

    await logAction(req, 'export', '导出客户列表');
  } catch (error) {
    logger.error('导出客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '导出客户失败';
    next(error);
  }
}

async function convert(req, res, next) {
  try {
    const { customer_id, action } = req.body;
    const userId = req.user.userId;

    if (!ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode)) {
      return res.status(403).json({ code: 403, message: '仅管理者可执行转化操作', data: null });
    }

    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '请指定客户', data: null });
    }

    const result = await customerService.convertStatus(pool, customer_id, action);

    await rawLogAction({
      module: MODULE_NAME, action: action,
      method: 'POST', url: '/api/customer/convert',
      params: { customer_id, action },
      ipAddress: getIpAddress(req), userId, userName: req.user.username,
      description: '客户转化操作', status: 1
    });

    res.json({ code: 200, message: '转化成功', data: result });
  } catch (error) {
    logger.error('客户转化错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.code) {
      return res.status(error.code).json({ code: error.code, message: error.message, data: null });
    }
    error.status = 500;
    error.message = '转化失败';
    next(error);
  }
}

// ==================== leads.js ====================

async function listLeads(req, res, next) {
  try {
    const result = await leadsService.getLeadsList(pool, req.body, req.user, customerDetailService.SOURCE_PARENT_MAP);
    res.json({ code: 200, message: '获取线索列表成功', data: result });
  } catch (error) {
    logger.error('获取线索列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '获取线索列表失败';
    next(error);
  }
}

async function convertLead(req, res, next) {
  try {
    const result = await leadsService.convertLead(pool, req.body.id);
    await logAction(req, 'convert', `线索转化: ${result.company_name} → 潜客`);
    res.json({ code: 200, message: '转化成功，已转为潜客', data: result });
  } catch (error) {
    logger.error('线索转化错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = error.code || 500;
    error.message = error.message || '转化失败';
    next(error);
  }
}

async function batchConvertLeads(req, res, next) {
  try {
    const result = await leadsService.batchConvert(pool, req.body.ids);
    await logAction(req, 'batch-convert', `批量转化线索: ${result.converted}条成功`);
    res.json({ code: 200, message: '批量转化完成', data: result });
  } catch (error) {
    logger.error('批量转化错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '批量转化失败';
    next(error);
  }
}

async function importLeads(req, res, next) {
  try {
    const result = await leadsService.importLeads(pool, req.body.leads, req.user.userId);
    await logAction(req, 'import', `导入线索: ${result.imported}条成功`);
    res.json({ code: 200, message: '导入完成', data: result });
  } catch (error) {
    logger.error('导入线索错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '导入失败';
    next(error);
  }
}

async function claimLead(req, res, next) {
  try {
    const result = await leadsService.claimLead(pool, req.body.id, req.user.userId);
    await logAction(req, 'claim-lead', `领取线索: ${result.company_name}`);
    res.json({ code: 200, message: '领取成功，该线索已归您跟进', data: result });
  } catch (error) {
    logger.error('领取线索错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = error.code || 500;
    error.message = error.message || '领取失败';
    next(error);
  }
}

async function markLeadLost(req, res, next) {
  try {
    await leadsService.markLeadLost(pool, req.body.id, req.user.userId);
    res.json({ code: 200, message: '已标记为流失', data: { id: req.body.id } });
  } catch (error) {
    logger.error('标记流失错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = error.code || 500;
    error.message = error.message || '操作失败';
    next(error);
  }
}

async function getLeadsStats(req, res, next) {
  try {
    const result = await leadsService.getLeadsStats(pool, req.user);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('线索统计错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '查询失败';
    next(error);
  }
}

// ==================== assign.js ====================

async function assign(req, res, next) {
  try {
    const { customer_id, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    const result = await assignService.manualAssign(pool, customer_id, to_user_id, userId, remark);

    if (result.code === 404) {
      return res.status(404).json({ code: 404, message: result.message, data: null });
    }

    const actionDesc = to_user_id ? `分配给用户ID ${to_user_id}` : '回收为待分配';
    await logAction(req, 'assign', `${actionDesc}: ${result.company_name}`);

    res.json({ code: 200, message: result.message, data: null });
  } catch (error) {
    logger.error('分配客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '操作失败';
    next(error);
  }
}

async function batchAssign(req, res, next) {
  try {
    const { customer_ids, to_user_id, remark } = req.body;
    const userId = req.user.userId;

    const result = await assignService.batchAssign(pool, customer_ids, to_user_id, userId, remark);

    await logAction(req, 'batch-assign', `批量分配 ${result.count} 个客户 → 用户ID ${to_user_id}`);

    res.json({ code: 200, message: `成功分配 ${result.count} 个客户`, data: { count: result.count } });
  } catch (error) {
    logger.error('批量分配错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '批量分配失败';
    next(error);
  }
}

async function listAssignLogs(req, res, next) {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;
    const data = await assignService.getAssignLogs(pool, { customer_id, page, pageSize });

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('查询分配日志错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '查询失败';
    next(error);
  }
}

async function createAssignRule(req, res, next) {
  try {
    const { rule_name, assign_type, source_value, region_value, user_ids, priority } = req.body;
    if (!rule_name || !assign_type || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '规则名称、分配方式、用户列表为必填', data: null });
    }
    if (!['round_robin', 'by_source', 'by_region'].includes(assign_type)) {
      return res.status(400).json({ code: 400, message: '无效的分配方式', data: null });
    }
    if (assign_type === 'by_source' && !source_value) {
      return res.status(400).json({ code: 400, message: '按来源分配时必须指定来源值', data: null });
    }
    if (assign_type === 'by_region' && !region_value) {
      return res.status(400).json({ code: 400, message: '按区域分配时必须指定区域值', data: null });
    }

    const id = await assignService.createRule(pool, { rule_name, assign_type, source_value, region_value, user_ids, priority });
    await logAction(req, 'add-assign-rule', `添加分配规则: ${rule_name}`);
    res.json({ code: 200, message: '添加成功', data: { id } });
  } catch (error) {
    logger.error('添加分配规则错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '添加失败';
    next(error);
  }
}

async function updateAssignRule(req, res, next) {
  try {
    const { id, rule_name, assign_type, source_value, region_value, user_ids, priority, is_active } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '规则ID不能为空', data: null });

    const affectedRows = await assignService.updateRule(pool, id, { rule_name, assign_type, source_value, region_value, user_ids, priority, is_active });
    if (affectedRows === 0) {
      return res.status(400).json({ code: 400, message: '无更新内容', data: null });
    }

    await logAction(req, 'update-assign-rule', `更新分配规则ID: ${id}`);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('更新分配规则错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '更新失败';
    next(error);
  }
}

async function deleteAssignRule(req, res, next) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '规则ID不能为空', data: null });
    await assignService.deleteRule(pool, id);
    await logAction(req, 'delete-assign-rule', `删除分配规则ID: ${id}`);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('删除分配规则错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '删除失败';
    next(error);
  }
}

async function autoAssign(req, res, next) {
  try {
    const userId = req.user.userId;
    const result = await assignService.applyRule(pool, userId);

    if (result.count === 0) {
      return res.status(400).json({ code: 400, message: result.message, data: null });
    }

    await logAction(req, 'auto-assign', `轮询分配 ${result.count} 个客户给 ${result.sales_count} 名销售`);

    res.json({
      code: 200,
      message: `已将 ${result.count} 个客户分配给 ${result.sales_count} 名销售`,
      data: { count: result.count, sales_count: result.sales_count }
    });
  } catch (error) {
    logger.error('自动分配错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '自动分配失败';
    next(error);
  }
}

async function getAssignRules(req, res, next) {
  try {
    const list = await assignService.getAssignRules(pool);
    res.json({ code: 200, message: '查询成功', data: list });
  } catch (error) {
    logger.error('查询分配规则错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '查询失败';
    next(error);
  }
}

async function getSalesUsers(req, res, next) {
  try {
    const users = await assignService.getSalesUsers(pool);
    res.json({ code: 200, message: '查询成功', data: users });
  } catch (error) {
    logger.error('获取销售用户列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '查询失败';
    next(error);
  }
}

async function getMySubordinates(req, res, next) {
  try {
    const userId = req.user.userId;
    const users = await assignService.getMySubordinates(pool, userId);
    res.json({ code: 200, message: '查询成功', data: users });
  } catch (error) {
    logger.error('获取下属列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '查询失败';
    next(error);
  }
}

// ==================== pool.js ====================

async function listPool(req, res, next) {
  try {
    const result = await poolService.listPoolCustomers(pool, req.body, customerDetailService.SOURCE_PARENT_MAP);
    res.json({ code: 200, message: '获取公海客户列表成功', data: result });
  } catch (error) {
    logger.error('获取公海客户列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '获取公海客户列表失败';
    next(error);
  }
}

async function claim(req, res, next) {
  try {
    const result = await poolService.claimCustomer(pool, req.body.customer_id, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: result.protect_until ? { protect_until: result.protect_until } : null });
    await logAction(req, 'claim', `认领客户: ${result.company_name}`);
    res.json({ code: 200, message: '认领客户成功', data: { protect_until: result.protect_until } });
  } catch (error) {
    logger.error('认领客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '认领客户失败';
    next(error);
  }
}

async function batchClaim(req, res, next) {
  try {
    const result = await poolService.batchClaimCustomers(pool, req.body.customer_ids, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    await logAction(req, 'batch-claim', `批量认领 ${result.claimed} 个客户`);
    const msg = `成功认领 ${result.claimed} 个客户` + (result.skipped.length > 0 ? `，跳过: ${result.skipped.join('; ')}` : '');
    res.json({ code: 200, message: msg, data: { claimed: result.claimed, skipped: result.skipped.length > 0 ? result.skipped : null } });
  } catch (error) {
    logger.error('批量认领错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '批量认领失败';
    next(error);
  }
}

async function release(req, res, next) {
  try {
    const result = await poolService.releaseCustomer(pool, req.body.customer_id, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    await logAction(req, 'release', `释放客户到公海: ${result.company_name}`);
    res.json({ code: 200, message: '释放客户成功', data: null });
  } catch (error) {
    logger.error('释放客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '释放客户失败';
    next(error);
  }
}

async function batchRelease(req, res, next) {
  try {
    const result = await poolService.batchReleaseCustomers(pool, req.body.customer_ids, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    await logAction(req, 'batch-release', `批量释放 ${result.count} 个客户到公海`);
    res.json({ code: 200, message: `成功释放 ${result.count} 个客户`, data: { count: result.count } });
  } catch (error) {
    logger.error('批量释放错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '批量释放失败';
    next(error);
  }
}

async function listPoolLogs(req, res, next) {
  try {
    const result = await poolService.getPoolLogs(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('查询公海日志错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = 500;
    error.message = '查询失败';
    next(error);
  }
}

// ==================== import.js ====================

async function importPreview(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const data = await importService.importPreview(pool, req.file.buffer);

    res.json({ code: 200, message: '预览成功', data });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('导入预览错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = status;
    error.message = error.message || '预览失败';
    next(error);
  }
}

async function importConfirm(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const result = await importService.importCustomers(pool, req.file.buffer, req.user.userId);

    res.json({
      code: 200,
      message: `导入完成: 成功 ${result.success} 条, 重复 ${result.duplicates} 条, 验证失败 ${result.invalid} 条`,
      data: result
    });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('导入错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    error.status = status;
    error.message = error.message || '导入失败';
    next(error);
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
  detail,
  view360,
  exportCustomers,
  convert,
  listLeads,
  convertLead,
  batchConvertLeads,
  importLeads,
  claimLead,
  markLeadLost,
  getLeadsStats,
  assign,
  batchAssign,
  listAssignLogs,
  createAssignRule,
  updateAssignRule,
  deleteAssignRule,
  autoAssign,
  getAssignRules,
  getSalesUsers,
  getMySubordinates,
  listPool,
  claim,
  batchClaim,
  release,
  batchRelease,
  listPoolLogs,
  importPreview,
  importConfirm
};

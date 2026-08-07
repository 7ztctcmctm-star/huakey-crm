const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
const pool = require('../config/database');
const ROLES = require('../config/roles');
const logger = require('../config/logger');
const { buildDataPermissionWhere, stripRestrictedFields } = require('../middleware/permission');
const { createRouteLogger } = require('../middleware/logger');
const { invalidateCache } = require('../middleware/cache');
const { logFieldChanges } = require('../utils/fieldLog');
const { simpleApproveContract } = require('../services/approvalService');
const contractService = require('../services/contractService');
const contractCrudService = require('../services/contractCrudService');
const contractPaymentService = require('../services/contractPaymentService');
const {
  exportContracts: exportContractsService,
  exportPayments: exportPaymentsService,
  importPayments: importPaymentsService
} = require('../services/contractExportService');
const XLSX = require('xlsx');

const MODULE_NAME = '合同管理';
const logAction = createRouteLogger(MODULE_NAME);

// ==================== CRUD ====================

async function listContracts(req, res, next) {
  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const result = await contractCrudService.listContracts(pool, req.body, { clause: permissionClause, params: permParams });
    result.list = stripRestrictedFields(result.list, req.restrictedFields);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[合同] 合同列表错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function getContractDetail(req, res, next) {
  const { id } = req.params;

  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'c');
    const contract = await contractCrudService.getContractDetail(pool, id, { clause: permissionClause, params: permParams });
    if (!contract) {
      throw new AppError(ErrorCodes.CONTRACT_NOT_FOUND, '合同不存在');
    }
    stripRestrictedFields(contract, req.restrictedFields);

    res.json({ code: 200, message: '查询成功', data: contract });
  } catch (error) {
    logger.error('[合同] 查询合同详情失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function createContract(req, res, next) {
  const { customer_id, amount } = req.body;

  try {
    const result = await contractService.createContract(pool, req.body, req.user.userId);
    await logAction(req, 'add', `新增合同: ${result.contract_no}`);

    // 通知审批人（不影响主流程）
    await contractCrudService.createContractNotification(pool, result.id, result.contract_no, amount, customer_id, req.user.userId);

    res.json({ code: 200, message: '创建合同成功', data: result });
  } catch (error) {
    logger.error('[合同] 创建合同失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function updateContract(req, res, next) {
  try {
    const oldData = await contractCrudService.updateContract(pool, req.body);
    await logAction(req, 'update', `修改合同: ID=${req.body.id}`);

    if (oldData) {
      const contractFields = ['customer_id', 'opportunity_id', 'amount', 'sign_date', 'delivery_date', 'payment_terms', 'status', 'remark'];
      const { id, customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark } = req.body;
      const newData = { customer_id, opportunity_id, amount, sign_date, delivery_date, payment_terms, status, remark };
      await logFieldChanges(req, {
        module: MODULE_NAME,
        action: '编辑',
        oldData,
        newData,
        allowedFields: contractFields,
        description: `修改合同 #${id} 字段变更`
      });
    }

    await invalidateCache(['cache:*:/api/contract/*']);
    res.json({ code: 200, message: '修改合同成功', data: null });
  } catch (error) {
    logger.error('[合同] 修改合同失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function deleteContract(req, res, next) {
  const { id } = req.body;

  try {
    const result = await contractCrudService.deleteContract(pool, id, req.user);
    await logAction(req, 'delete', `删除合同: ID=${id}`);
    await invalidateCache(['cache:*:/api/contract/*']);
    res.json({ code: 200, message: result.message, data: null });
  } catch (error) {
    logger.error('[合同] 删除合同失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function getOpportunityList(req, res, next) {
  try {
    const { clause: permissionClause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const rows = await contractCrudService.getOpportunityList(pool, { clause: permissionClause, params: permParams });
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[合同] 商机列表错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function searchContracts(req, res, next) {
  try {
    const { keyword } = req.query;
    const rows = await contractCrudService.searchContracts(pool, keyword);
    stripRestrictedFields(rows, req.restrictedFields);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[合同] 合同搜索错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

// ==================== Approval ====================

async function approveContract(req, res, next) {
  try {
    const { id, approval_status, approval_remark } = req.body;
    // 统一使用 manageAll + roleCode，禁止依赖固定数字 roleId（与 quoteController 保持一致）
    // boss/manager 均由 sys_role.manage_all=1 标记 → manageAll=true
    if (!req.user.manageAll && !ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode)) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, '无审批权限');
    }
    if (!id || ![2, 3].includes(approval_status)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '参数错误: id必填, approval_status为2(通过)或3(拒绝)');
    }

    await simpleApproveContract(pool, id, approval_status, approval_remark, req.user.userId);

    res.json({ code: 200, message: approval_status === 2 ? '审批通过' : '已拒绝', data: null });
  } catch (error) {
    logger.error('[合同] 审批合同错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

// ==================== Payment ====================

async function addPayment(req, res, next) {
  try {
    await contractPaymentService.addPayment(pool, req.body, req.user);
    await logAction(req, 'add', `登记回款: 合同ID=${req.body.contract_id}, 金额=${req.body.pay_amount}`);
    res.json({ code: 200, message: '登记回款成功', data: null });
  } catch (error) {
    logger.error('[合同] 登记回款失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function updatePayment(req, res, next) {
  try {
    await contractPaymentService.updatePayment(pool, req.body, req.user);
    await logAction(req, 'update', `修改回款记录: ID=${req.body.id}`);
    res.json({ code: 200, message: '修改回款记录成功', data: null });
  } catch (error) {
    logger.error('[合同] 修改回款记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function deletePayment(req, res, next) {
  try {
    await contractPaymentService.deletePayment(pool, req.body.id, req.user);
    await logAction(req, 'delete', `删除回款记录: ID=${req.body.id}`);
    res.json({ code: 200, message: '删除回款记录成功', data: null });
  } catch (error) {
    logger.error('[合同] 删除回款记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function listPayments(req, res, next) {
  try {
    const result = await contractPaymentService.listPayments(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[合同] 查询回款列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function getMergedPayments(req, res, next) {
  try {
    const result = await contractPaymentService.getMergedPayments(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: { list: result.list, total: result.total } });
  } catch (error) {
    logger.error('[合同] 合并回款视图查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function getPaymentSummary(req, res, next) {
  try {
    const { page = 1, pageSize = 20 } = req.body;
    const result = await contractPaymentService.getSummary(pool);
    res.json({
      code: 200, message: '查询成功',
      data: { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize), summary: result }
    });
  } catch (error) {
    logger.error('[合同] 对账汇总错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function exportStatement(req, res, next) {
  try {
    const { buffer } = await contractPaymentService.getStatementExport(pool, req.body);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=statement.xlsx');
    res.send(buffer);
    await logAction(req, 'export', '导出对账单');
  } catch (error) {
    logger.error('[合同] 对账单导出错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

// ==================== Export / Import ====================

async function exportContracts(req, res, next) {
  try {
    const buf = await exportContractsService(pool, req.body, req.dataPermission, req.restrictedFields);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=contracts.xlsx');
    res.send(buf);
    await logAction(req, 'export', '导出合同');
  } catch (error) {
    logger.error('[合同] 导出合同错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function exportPayments(req, res, next) {
  try {
    const buf = await exportPaymentsService(pool, req.body);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payments.xlsx');
    res.send(buf);
    await logAction(req, 'export', '导出回款');
  } catch (error) {
    logger.error('[合同] 导出回款错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function importPayments(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '请上传文件');
    }

    const result = await importPaymentsService(pool, req.file.buffer);

    res.json({ code: 200, message: result.message, data: { success: result.success, failed: result.failed, errors: result.errors } });
  } catch (error) {
    logger.error('[合同] 回款导入错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function downloadPaymentImportTemplate(req, res, next) {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['合同编号', '回款日期', '回款金额', '回款方式', '备注'],
      ['CON-260101-001', '2026-01-15', 50000, '银行转账', '第一期回款']
    ]);
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, '回款导入模板');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payment_import_template.xlsx');
    res.send(buf);
  } catch (error) {
    logger.error('[合同] 导出模板失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

module.exports = {
  listContracts,
  getContractDetail,
  createContract,
  updateContract,
  deleteContract,
  getOpportunityList,
  searchContracts,
  approveContract,
  addPayment,
  updatePayment,
  deletePayment,
  listPayments,
  getMergedPayments,
  getPaymentSummary,
  exportStatement,
  exportContracts,
  exportPayments,
  importPayments,
  downloadPaymentImportTemplate
};

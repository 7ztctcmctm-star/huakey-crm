const pool = require('../config/database');
const opportunityService = require('../services/opportunityService');
const { logFieldChanges } = require('../utils/fieldLog');
const ROLES = require('../config/roles');
const logger = require('../config/logger');
const { buildDataPermissionWhere } = require('../middleware/permission');

const MODULE_NAME = '商机管理';

async function list(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const result = await opportunityService.listOpportunities(pool, req.body, { clause, params: permParams });
    res.json({
      code: 200,
      message: '获取商机列表成功',
      data: {
        ...result,
        page: parseInt(req.body.page) || 1,
        pageSize: parseInt(req.body.pageSize) || 10
      }
    });
  } catch (error) {
    logger.error('获取商机列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function add(req, res, next) {
  try {
    const result = await opportunityService.createOpportunity(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '添加商机成功', data: result });
  } catch (error) {
    logger.error('添加商机错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const { id, ...data } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });

    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, id, { clause, params: permParams });
    if (!existing) return res.status(403).json({ code: 403, message: '无权修改该商机', data: null });

    const oldData = await opportunityService.updateOpportunity(pool, id, data);

    const oppFields = ['customer_id', 'name', 'expected_amount', 'expected_date', 'stage', 'win_rate', 'remark', 'owner_id'];
    await logFieldChanges(req, { module: MODULE_NAME, action: '编辑', oldData, newData: req.body, allowedFields: oppFields, description: `修改商机 "${oldData.name}" 字段变更` });
    res.json({ code: 200, message: '修改商机成功', data: null });
  } catch (error) {
    logger.error('修改商机错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function updateStage(req, res, next) {
  try {
    const { id, stage, change_reason } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });

    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, id, { clause, params: permParams });
    if (!existing) return res.status(403).json({ code: 403, message: '无权修改该商机', data: null });

    const result = await opportunityService.advanceStage(pool, id, stage, req.user.userId, { changeReason: change_reason });
    res.json({ code: 200, message: `阶段已从"${opportunityService.STAGE_MAP[result.oldStage]}"推进至"${result.stageName}"`, data: null });
  } catch (error) {
    logger.error('推进阶段错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

/**
 * v1.1: 阶段回退
 */
async function backwardStage(req, res, next) {
  try {
    const { id, stage, change_reason } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });

    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, id, { clause, params: permParams });
    if (!existing) return res.status(403).json({ code: 403, message: '无权修改该商机', data: null });

    const result = await opportunityService.backwardStage(pool, id, stage, req.user.userId, { changeReason: change_reason });
    res.json({ code: 200, message: `阶段已从"${opportunityService.STAGE_MAP[result.oldStage]}"回退至"${result.stageName}"`, data: null });
  } catch (error) {
    logger.error('回退阶段错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

/**
 * v1.1: 获取商机来源字典
 */
async function getSources(req, res, next) {
  try {
    const list = await opportunityService.getSourceList(pool, true);
    res.json({ code: 200, message: '获取商机来源列表成功', data: list });
  } catch (error) {
    logger.error('获取商机来源列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

/**
 * v1.1: 导出商机列表为 Excel
 * 使用简单 CSV 导出（避免引入 exceljs 依赖），前端可直接下载
 */
async function exportOpportunities(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    // 导出最多 10000 条，避免内存溢出
    const result = await opportunityService.listOpportunities(pool, { ...req.query, page: 1, pageSize: 10000 }, { clause, params: permParams });

    // CSV 表头
    const headers = ['商机编号', '商机名称', '客户名称', '阶段', '预计金额', '预计成交日', '赢单率', '负责人', '来源', '创建时间', '更新时间'];
    const rows = result.list.map(item => [
      item.opportunity_no || '',
      item.name || '',
      item.customer_name || '',
      opportunityService.STAGE_MAP[item.stage] || '',
      item.expected_amount || 0,
      item.expected_date || '',
      `${item.win_rate || 0}%`,
      item.owner_name || '',
      item.source_name || '',
      item.create_time ? new Date(item.create_time).toLocaleString('zh-CN') : '',
      item.update_time ? new Date(item.update_time).toLocaleString('zh-CN') : ''
    ]);

    // 生成 CSV（UTF-8 BOM 头，确保 Excel 正确识别中文）
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=opportunities_${Date.now()}.csv`);
    res.send('\ufeff' + csvContent);
  } catch (error) {
    logger.error('导出商机列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function stageLog(req, res, next) {
  try {
    const logs = await opportunityService.getStageLog(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: logs });
  } catch (error) {
    logger.error('查询阶段日志错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function stageStats(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, req.params.id, { clause, params: permParams });
    if (!existing) return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    const data = await opportunityService.getStageStats(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('阶段统计错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '商机ID不能为空', data: null });

    const opp = await opportunityService.getOpportunityForPermission(pool, id);
    if (!opp) return res.status(404).json({ code: 404, message: '商机不存在', data: null });

    const { manageAll, userId } = req.user;
    if (!manageAll && !ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode) && opp.owner_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权删除该商机', data: null });
    }

    await opportunityService.deleteOpportunity(pool, id);
    res.json({ code: 200, message: '删除商机成功', data: null });
  } catch (error) {
    logger.error('删除商机错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function detail(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const data = await opportunityService.getOpportunityWithPermission(pool, req.params.id, { clause, params: permParams });
    if (!data) return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    res.json({ code: 200, message: '获取商机详情成功', data });
  } catch (error) {
    logger.error('获取商机详情错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function funnel(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const data = await opportunityService.getFunnelStats(pool, { clause, params: permParams });
    res.json({ code: 200, message: '获取销售漏斗成功', data });
  } catch (error) {
    logger.error('获取销售漏斗错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function stageLogWithPermission(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, req.params.id, { clause, params: permParams });
    if (!existing) return res.status(404).json({ code: 404, message: '商机不存在', data: null });
    const logs = await opportunityService.getStageLog(pool, req.params.id);
    res.json({
      code: 200,
      message: '查询成功',
      data: logs.map(l => ({ ...l, from_stage_name: opportunityService.STAGE_MAP[l.from_stage], to_stage_name: opportunityService.STAGE_MAP[l.to_stage] }))
    });
  } catch (error) {
    logger.error('获取阶段变更日志错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

async function timeline(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const existing = await opportunityService.getOpportunityWithPermission(pool, req.params.id, { clause, params: permParams });
    if (!existing) return res.status(404).json({ code: 404, message: '商机不存在', data: null });

    const events = await opportunityService.getTimeline(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: events });
  } catch (error) {
    logger.error('获取商机时间轴错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
}

module.exports = {
  list,
  add,
  update,
  updateStage,
  backwardStage,
  getSources,
  exportOpportunities,
  stageLog,
  stageStats,
  delete: remove,
  detail,
  funnel,
  stageLogWithPermission,
  timeline
};

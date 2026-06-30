const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission } = require('../../middleware/permission');
const { exportContracts, exportPayments, importPayments } = require('../../services/contractExportService');
const { createRouteLogger } = require('../../middleware/logger');
const XLSX = require('xlsx');
const multer = require('multer');
const logger = require('../../config/logger');

const logAction = createRouteLogger('合同管理');

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('仅支持 xlsx/xls/csv 文件'), ok);
  }
});

// 合同导出
router.post('/export', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), async (req, res) => {
  try {
    const buf = await exportContracts(pool, req.body, req.dataPermission);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=contracts.xlsx');
    res.send(buf);
    await logAction(req, 'export', '导出合同');
  } catch (error) {
    logger.error('[合同] 导出合同错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '导出合同失败', data: null });
  }
});

// 回款导出
router.post('/payment/export', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const buf = await exportPayments(pool, req.body);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payments.xlsx');
    res.send(buf);
    await logAction(req, 'export', '导出回款');
  } catch (error) {
    logger.error('[合同] 导出回款错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

// 批量导入回款（Excel）
router.post('/payment/import', authenticateToken, checkPermission('contract'), importUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传文件', data: null });
    }

    const result = await importPayments(pool, req.file.buffer);

    res.json({ code: 200, message: result.message, data: { success: result.success, failed: result.failed, errors: result.errors } });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('[合同] 回款导入错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '导入失败', data: null });
  }
});

// 回款导入模板下载
router.get('/payment/import-template', authenticateToken, async (req, res) => {
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
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

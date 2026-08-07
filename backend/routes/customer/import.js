const express = require('express');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { validate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');
const importService = require('../../services/importService');
const logger = require('../../config/logger');
const { enqueue } = require('../../utils/queue');

// 导入接口无额外 body 字段（文件由 multer 处理）
const importUploadSchema = Joi.object({});

// [安全修复] 文件上传限制：仅允许Excel/CSV，最大10MB
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv' // .csv
];
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

const upload = multer({
  storage: multer.memoryStorage(), // 内存存储（兼容 Vercel Serverless）
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 xlsx、xls、csv 格式的文件'));
    }
  }
});

const router = express.Router();

// 下载导入模板
router.get('/template', authenticateToken, (req, res, next) => {
  try {
    const headers = ['公司名称', '联系人', '电话', '邮箱', '地址', '行业', '来源', '等级', '备注'];
    const example = ['华科科技有限公司', '张三', '13800138000', 'zhangsan@example.com', '北京市朝阳区', '科技', '展会', 'A', '示例客户'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);

    // 设置列宽
    ws['!cols'] = [
      { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 25 },
      { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 8 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '客户导入模板');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customer_import_template.xlsx');
    res.send(buf);
  } catch (error) {
    next(error);
  }
});

// Excel异步批量导入（直接入队，返回 202）
router.post('/import', authenticateToken, checkPermission('customer:import'), upload.single('file'), validate(importUploadSchema), async (req, res, next) => {
  try {
    const customers = importService.parseRowsFromBuffer(req.file.buffer);
    await enqueue('customer_import', { customers }, req.user.userId);
    res.status(202).json({
      code: 202,
      message: `共 ${customers.length} 条已加入处理队列`,
      data: { queued: customers.length }
    });
  } catch (error) {
    logger.error('异步导入入队错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// Excel导入预览
router.post('/import-preview', authenticateToken, checkPermission('customer:import'), upload.single('file'), validate(importUploadSchema), customerController.importPreview);

// Excel导入确认（集成清洗 + 验证 + 去重）
router.post('/import-confirm', authenticateToken, checkPermission('customer:import'), upload.single('file'), validate(importUploadSchema), customerController.importConfirm);

// [安全修复] multer错误处理中间件
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 400, message: '文件大小不能超过10MB', data: null });
  }
  if (err.message && err.message.includes('仅支持')) {
    return res.status(400).json({ code: 400, message: err.message, data: null });
  }
  next(err);
});

module.exports = router;

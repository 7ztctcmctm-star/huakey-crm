const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { importPreview, importCustomers } = require('../../services/importService');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

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
router.get('/template', authenticateToken, (req, res) => {
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
    console.error('生成模板错误:', error);
    res.status(500).json({ code: 500, message: '生成模板失败', data: null });
  }
});

// Excel导入预览
router.post('/import-preview', authenticateToken, checkPermission('customer:import'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const data = await importPreview(pool, req.file.buffer);

    res.json({ code: 200, message: '预览成功', data });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('导入预览错误:', error);
    res.status(status).json({ code: status, message: error.message || '预览失败', data: null });
  }
});

// Excel导入确认（集成清洗 + 验证 + 去重）
router.post('/import-confirm', authenticateToken, checkPermission('customer:import'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const result = await importCustomers(pool, req.file.buffer, req.user.userId);

    res.json({
      code: 200,
      message: `导入完成: 成功 ${result.success} 条, 重复 ${result.duplicates} 条, 验证失败 ${result.invalid} 条`,
      data: result
    });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('导入错误:', error);
    res.status(status).json({ code: status, message: error.message || '导入失败', data: null });
  }
});

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

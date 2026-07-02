const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission } = require('../../middleware/permission');
const multer = require('multer');
const { validate, Joi } = require('../../middleware/validate');
const contractController = require('../../controllers/contractController');

// Joi schemas
const exportContractsSchema = Joi.object({
  keyword: Joi.string().max(100).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null)
});

const exportPaymentsSchema = Joi.object({
  keyword: Joi.string().max(100).allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

const importPaymentsSchema = Joi.object({});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('仅支持 xlsx/xls/csv 文件'), ok);
  }
});

// 合同导出
router.post('/export', authenticateToken, checkPermission('contract'), checkDataPermission('contract', 'create_by'), validate(exportContractsSchema), contractController.exportContracts);

// 回款导出
router.post('/payment/export', authenticateToken, checkPermission('contract'), validate(exportPaymentsSchema), contractController.exportPayments);

// 批量导入回款（Excel）
router.post('/payment/import', authenticateToken, checkPermission('contract'), importUpload.single('file'), validate(importPaymentsSchema), contractController.importPayments);

// 回款导入模板下载
router.get('/payment/import-template', authenticateToken, contractController.downloadPaymentImportTemplate);

module.exports = router;

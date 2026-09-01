const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
// file-type 22+ 为 ESM-only（CVE 修复后无法在 CommonJS 中 require），经动态 import 加载
let fileTypeMod = null;
async function loadFileType() {
  if (!fileTypeMod) {
    fileTypeMod = await import('file-type');
  }
  return fileTypeMod;
}
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const pool = require('../config/database');
const uploadRouteService = require('../services/uploadRouteService');
const logger = require('../config/logger');
const { validate, Joi } = require('../middleware/validate');

const uploadFileSchema = Joi.object({
  business_type: Joi.string().max(50).allow('', null),
  business_id: Joi.number().integer().positive().allow(null)
});

const deleteAttachmentSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 使用内存存储（兼容 Vercel Serverless，无本地磁盘）
const storage = multer.memoryStorage();

// 允许的 MIME 类型映射（扩展名 -> 真实 MIME 集合）
const ALLOWED_MIME_TYPES = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
  '.rar': ['application/vnd.rar', 'application/x-rar-compressed']
};

const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|zip|rar)$/i;

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.test(ext)) {
      return cb(new Error('不支持的文件格式'));
    }
    // 客户端提交的 mimetype 仅作初步过滤，最终由 magic bytes 校验
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (allowedMimes && !allowedMimes.includes(file.mimetype)) {
      return cb(new Error('文件类型与扩展名不匹配'));
    }
    cb(null, true);
  }
});

/**
 * 基于文件 magic bytes 的深度类型校验
 * multer fileFilter 无法异步读取 buffer，因此在内存存储后单独校验
 */
const validateFileMagic = async (req, res, next) => {
  const file = req.file;
  if (!file) return next();

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ALLOWED_MIME_TYPES[ext];

  try {
    const { fileTypeFromBuffer } = await loadFileType();
    const type = await fileTypeFromBuffer(file.buffer.slice(0, 4100));
    if (!type) {
      return res.status(400).json({ code: 400, message: '无法识别文件类型', data: null });
    }
    if (allowedMimes && !allowedMimes.includes(type.mime)) {
      return res.status(400).json({ code: 400, message: '文件内容与扩展名不匹配', data: null });
    }
    next();
  } catch (error) {
    logger.error('[上传] magic bytes 检测失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    return res.status(400).json({ code: 400, message: '文件检测失败，请重试', data: null });
  }
};

// 上传文件
// [权限控制] 仅允许拥有 file:upload 权限的用户上传
const uploadHandler = async (req, res, next) => {
  try {
    const result = await uploadRouteService.uploadFile(pool, {
      file: req.file,
      business_type: req.body.business_type,
      business_id: req.body.business_id,
      userId: req.user.userId
    });
    res.json({ code: 200, message: '上传成功', data: [result] });
  } catch (error) {
    next(error);
  }
};

// Multer 错误处理中间件（确保错误响应带 CORS 头）
const multerErrorHandler = (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 400, message: '文件大小不能超过10MB', data: null });
  }
  if (err.message === '不支持的文件格式' || err.message === '文件类型与扩展名不匹配') {
    return res.status(400).json({ code: 400, message: err.message, data: null });
  }
  // 其他 multer 错误
  if (err.name === 'MulterError') {
    return res.status(400).json({ code: 400, message: '文件上传失败: ' + err.message, data: null });
  }
  next(err);
};

router.post('/file', authenticateToken, checkPermission('file:upload'), upload.single('file'), validateFileMagic, validate(uploadFileSchema), uploadHandler);
// 兼容前端直接调用 /upload 的旧路径
router.post('/', authenticateToken, checkPermission('file:upload'), upload.single('file'), validateFileMagic, validate(uploadFileSchema), uploadHandler);
router.use(multerErrorHandler);

// 查询附件列表
router.get('/list', authenticateToken, checkPermission('file'), async (req, res, next) => {
  try {
    const list = await uploadRouteService.listAttachments(pool, req.query);
    res.json({ code: 200, message: '查询成功', data: list });
  } catch (error) {
    next(error);
  }
});

// 删除附件
router.post('/delete', authenticateToken, checkPermission('file'), validate(deleteAttachmentSchema), async (req, res, next) => {
  try {
    await uploadRouteService.deleteAttachment(pool, req.body.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

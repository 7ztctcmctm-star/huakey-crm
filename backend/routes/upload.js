const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { fileTypeFromBuffer } = require('file-type');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const pool = require('../config/database');
const uploadRouteService = require('../services/uploadRouteService');
const logger = require('../config/logger');

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
// [权限说明] 当前仅做认证，未绑定业务权限码；如需细控可补充 checkPermission('file:upload')
router.post('/file', authenticateToken, upload.single('file'), validateFileMagic, async (req, res) => {
  try {
    const result = await uploadRouteService.uploadFile(pool, {
      file: req.file,
      business_type: req.body.business_type,
      business_id: req.body.business_id,
      userId: req.user.userId
    });
    res.json({ code: 200, message: '上传成功', data: [result] });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    logger.error('文件上传错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '文件上传失败', data: null });
  }
});

// 查询附件列表
router.get('/list', authenticateToken, checkPermission('file'), async (req, res) => {
  try {
    const list = await uploadRouteService.listAttachments(pool, req.query);
    res.json({ code: 200, message: '查询成功', data: list });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    logger.error('查询附件错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 删除附件
router.post('/delete', authenticateToken, checkPermission('file'), async (req, res) => {
  try {
    await uploadRouteService.deleteAttachment(pool, req.body.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    if (error.statusCode === 404) {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    logger.error('删除附件错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;

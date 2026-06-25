const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const pool = require('../config/database');
const uploadRouteService = require('../services/uploadRouteService');

// 使用内存存储（兼容 Vercel Serverless，无本地磁盘）
const storage = multer.memoryStorage();

// 允许的 MIME 类型映射
const ALLOWED_MIME_TYPES = {
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.png': ['image/png'],
  '.gif': ['image/gif'], '.webp': ['image/webp'], '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
  '.rar': ['application/vnd.rar', 'application/x-rar-compressed']
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|zip|rar)$/i;
    if (!allowedExts.test(ext)) {
      return cb(new Error('不支持的文件格式'));
    }
    // 校验 MIME 类型
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (allowedMimes && !allowedMimes.includes(file.mimetype)) {
      return cb(new Error('文件类型与扩展名不匹配'));
    }
    cb(null, true);
  }
});

// 上传文件
router.post('/file', authenticateToken, upload.single('file'), async (req, res) => {
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
    console.error('文件上传错误:', error);
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
    console.error('查询附件错误:', error);
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
    console.error('删除附件错误:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;

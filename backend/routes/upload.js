const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');
const { getSupabaseStorage } = require('../utils/supabaseStorage');

// Supabase Storage 客户端（懒加载，未配置则回退本地存储）
let supabaseStorage = null;
const getStorage = async () => {
  if (!supabaseStorage) supabaseStorage = await getSupabaseStorage();
  return supabaseStorage;
};

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
    const { business_type, business_id } = req.body;
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请选择文件', data: null });
    }

    const file = req.file;
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    let filePath;
    const storage = await getStorage();

    if (storage) {
      // 上传到 Supabase Storage
      const { data, error } = await storage.upload(filename, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600'
      });
      if (error) throw new Error(`Supabase Storage 上传失败: ${error.message}`);
      const { data: urlData } = storage.getPublicUrl(filename);
      filePath = urlData.publicUrl;
    } else {
      // 回退：本地文件存储
      const fs = require('fs');
      const uploadDir = path.join(__dirname, '../uploads/attachments');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
      filePath = `/uploads/attachments/${filename}`;
    }

    const [result] = await pool.query(
      `INSERT INTO crm_attachment (business_type, business_id, file_name, file_path, file_size, file_type, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [business_type || null, business_id || null, file.originalname, filePath, file.size, file.mimetype, req.user.userId]
    );

    res.json({
      code: 200, message: '上传成功',
      data: [{ id: result.insertId || (result.rows && result.rows[0]?.id), file_name: file.originalname, file_path: filePath, file_size: file.size, file_type: file.mimetype }]
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({ code: 500, message: '文件上传失败', data: null });
  }
});

// 查询附件列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { business_type, business_id } = req.query;
    if (!business_type || !business_id) {
      return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    }
    const [list] = await pool.query(
      'SELECT * FROM crm_attachment WHERE business_type = ? AND business_id = ? ORDER BY create_time DESC',
      [business_type, business_id]
    );
    res.json({ code: 200, message: '查询成功', data: list });
  } catch (error) {
    console.error('查询附件错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 删除附件
router.post('/delete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '附件ID不能为空', data: null });

    const [rows] = await pool.query('SELECT * FROM crm_attachment WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '附件不存在', data: null });

    const attachment = rows[0];

    // Supabase Storage 删除（如果是 Supabase URL）
    const storage = await getStorage();
    if (storage && attachment.file_path && !attachment.file_path.startsWith('/uploads/')) {
      const urlParts = attachment.file_path.split('/');
      const remoteFilename = urlParts[urlParts.length - 1];
      await storage.remove([remoteFilename]).catch(e => console.warn('Supabase 文件删除失败（可能已不存在）:', e.message));
    } else {
      // 本地文件删除
      const fs = require('fs');
      const fullPath = path.join(__dirname, '..', attachment.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    await pool.query('DELETE FROM crm_attachment WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('删除附件错误:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;

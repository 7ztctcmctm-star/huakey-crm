const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');

const uploadDir = path.join(__dirname, '../uploads/attachments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|zip|rar)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
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
    const filePath = `/uploads/attachments/${file.filename}`;
    const [result] = await pool.query(
      `INSERT INTO crm_attachment (business_type, business_id, file_name, file_path, file_size, file_type, create_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [business_type || null, business_id || null, file.originalname, filePath, file.size, file.mimetype, req.user.userId]
    );

    res.json({
      code: 200, message: '上传成功',
      data: [{ id: result.insertId, file_name: file.originalname, file_path: filePath, file_size: file.size, file_type: file.mimetype }]
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({ code: 500, message: '上传失败', data: null });
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
    // 删除物理文件
    const fullPath = path.join(__dirname, '..', attachment.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    await pool.query('DELETE FROM crm_attachment WHERE id = ?', [id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('删除附件错误:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 管理员权限检查
const requireAdmin = (req, res, next) => {
  if (req.user.manageAll || req.user.roleId === 1) return next();
  return res.status(403).json({ code: 403, message: '需要管理员权限', data: null });
};

// 文件上传配置
const uploadDir = path.join(__dirname, '../uploads/knowledge');
const UPLOAD_BASE = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ============ 产品知识库 ============

// 产品列表
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '', category = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE p.deleted_at IS NULL';
    const params = [];

    if (keyword) {
      where += ' AND (p.name LIKE ? OR p.model LIKE ? OR p.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
      where += ' AND p.category = ?';
      params.push(category);
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_product p ${where}`, params);
    const [rows] = await pool.query(
      `SELECT p.*, u.real_name as create_by_name FROM crm_knowledge_product p LEFT JOIN sys_user u ON p.create_by = u.id ${where} ORDER BY p.create_time DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    res.json({ code: 200, message: '查询成功', data: { list: rows, total } });
  } catch (error) {
    console.error('[知识库] 产品列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 产品详情
router.get('/products/:id', authenticateToken, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      'SELECT p.*, u.real_name as create_by_name FROM crm_knowledge_product p LEFT JOIN sys_user u ON p.create_by = u.id WHERE p.id = ? AND p.deleted_at IS NULL',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ code: 404, message: '产品不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[知识库] 产品详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建产品
router.post('/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, category, model, description, specs, price, images } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '产品名称不能为空', data: null });
    const [result] = await pool.query(
      'INSERT INTO crm_knowledge_product (name, category, model, description, specs, price, images, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), category || null, model || null, description || null, specs || null, price || null, images || null, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[知识库] 创建产品失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新产品
router.put('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, category, model, description, specs, price, images, status } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (model !== undefined) { fields.push('model = ?'); values.push(model); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (specs !== undefined) { fields.push('specs = ?'); values.push(specs); }
    if (price !== undefined) { fields.push('price = ?'); values.push(price); }
    if (images !== undefined) { fields.push('images = ?'); values.push(images); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_knowledge_product SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[知识库] 更新产品失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除产品（软删除）
router.delete('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE crm_knowledge_product SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[知识库] 删除产品失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 上传产品图片
router.post('/products/:id/images', authenticateToken, requireAdmin, upload.array('images', 9), async (req, res) => {
  try {
    const files = req.files.map(f => `/uploads/knowledge/${f.filename}`);
    const [[row]] = await pool.query('SELECT images FROM crm_knowledge_product WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    const existing = row && row.images ? JSON.parse(row.images) : [];
    const allImages = [...existing, ...files];
    await pool.query('UPDATE crm_knowledge_product SET images = ? WHERE id = ?', [JSON.stringify(allImages), req.params.id]);
    res.json({ code: 200, message: '上传成功', data: { images: allImages } });
  } catch (error) {
    console.error('[知识库] 上传图片失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 产品分类列表（去重）
router.get('/products-meta/categories', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT category FROM crm_knowledge_product WHERE deleted_at IS NULL AND category IS NOT NULL AND category != '' ORDER BY category"
    );
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.category) });
  } catch (error) {
    console.error('[知识库] 产品分类查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 销售话术 ============

// 话术列表
router.get('/scripts', authenticateToken, async (req, res) => {
  try {
    const { keyword = '', scene = '', page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (keyword) { where += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (scene) { where += ' AND scene = ?'; params.push(scene); }
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_script ${where}`, params);
    const [rows] = await pool.query(
      `SELECT * FROM crm_knowledge_script ${where} ORDER BY sort_order ASC, create_time DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    res.json({ code: 200, message: '查询成功', data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('[知识库] 话术列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 话术详情（usage_count+1）
router.get('/scripts/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE crm_knowledge_script SET usage_count = usage_count + 1 WHERE id = ?', [req.params.id]);
    const [[row]] = await pool.query('SELECT * FROM crm_knowledge_script WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!row) return res.status(404).json({ code: 404, message: '话术不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[知识库] 话术详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建话术
router.post('/scripts', authenticateToken, async (req, res) => {
  try {
    const { title, scene, content, sort_order } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ code: 400, message: '话术标题不能为空', data: null });
    if (!content || !content.trim()) return res.status(400).json({ code: 400, message: '话术内容不能为空', data: null });
    const [result] = await pool.query(
      'INSERT INTO crm_knowledge_script (title, scene, content, sort_order, create_by) VALUES (?, ?, ?, ?, ?)',
      [title.trim(), scene || null, content.trim(), sort_order || 0, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[知识库] 创建话术失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新话术
router.put('/scripts/:id', authenticateToken, async (req, res) => {
  try {
    const { title, scene, content, sort_order } = req.body;
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title.trim()); }
    if (scene !== undefined) { fields.push('scene = ?'); values.push(scene); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content.trim()); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(parseInt(sort_order)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_knowledge_script SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[知识库] 更新话术失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除话术
router.delete('/scripts/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE crm_knowledge_script SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[知识库] 删除话术失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 话术场景列表
router.get('/scripts-meta/scenes', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT scene FROM crm_knowledge_script WHERE deleted_at IS NULL AND scene IS NOT NULL AND scene != '' ORDER BY scene"
    );
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.scene) });
  } catch (error) {
    console.error('[知识库] 场景列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ FAQ ============

// FAQ列表
router.get('/faqs', authenticateToken, async (req, res) => {
  try {
    const { keyword = '', category = '', page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (keyword) { where += ' AND (question LIKE ? OR answer LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (category) { where += ' AND category = ?'; params.push(category); }
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_faq ${where}`, params);
    const [rows] = await pool.query(
      `SELECT * FROM crm_knowledge_faq ${where} ORDER BY sort_order ASC, create_time DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    res.json({ code: 200, message: '查询成功', data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('[知识库] FAQ列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// FAQ详情（view_count+1）
router.get('/faqs/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE crm_knowledge_faq SET view_count = view_count + 1 WHERE id = ?', [req.params.id]);
    const [[row]] = await pool.query('SELECT * FROM crm_knowledge_faq WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!row) return res.status(404).json({ code: 404, message: 'FAQ不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[知识库] FAQ详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建FAQ
router.post('/faqs', authenticateToken, async (req, res) => {
  try {
    const { question, answer, category, sort_order } = req.body;
    if (!question || !question.trim()) return res.status(400).json({ code: 400, message: '问题不能为空', data: null });
    if (!answer || !answer.trim()) return res.status(400).json({ code: 400, message: '答案不能为空', data: null });
    const [result] = await pool.query(
      'INSERT INTO crm_knowledge_faq (question, answer, category, sort_order, create_by) VALUES (?, ?, ?, ?, ?)',
      [question.trim(), answer.trim(), category || null, sort_order || 0, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[知识库] 创建FAQ失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新FAQ
router.put('/faqs/:id', authenticateToken, async (req, res) => {
  try {
    const { question, answer, category, sort_order } = req.body;
    const fields = [];
    const values = [];
    if (question !== undefined) { fields.push('question = ?'); values.push(question.trim()); }
    if (answer !== undefined) { fields.push('answer = ?'); values.push(answer.trim()); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(parseInt(sort_order)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_knowledge_faq SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[知识库] 更新FAQ失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除FAQ
router.delete('/faqs/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE crm_knowledge_faq SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[知识库] 删除FAQ失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// FAQ分类列表
router.get('/faqs-meta/categories', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT category FROM crm_knowledge_faq WHERE deleted_at IS NULL AND category IS NOT NULL AND category != '' ORDER BY category"
    );
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.category) });
  } catch (error) {
    console.error('[知识库] FAQ分类查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 文档管理 ============

// 文档列表
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const { keyword = '', type = '', page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let where = 'WHERE d.deleted_at IS NULL';
    const params = [];
    if (keyword) { where += ' AND (d.name LIKE ? OR d.description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (type) { where += ' AND d.type = ?'; params.push(type); }
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_document d ${where}`, params);
    const [rows] = await pool.query(
      `SELECT d.*, u.real_name as create_by_name FROM crm_knowledge_document d LEFT JOIN sys_user u ON d.create_by = u.id ${where} ORDER BY d.create_time DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    res.json({ code: 200, message: '查询成功', data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    console.error('[知识库] 文档列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 文档详情
router.get('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      'SELECT d.*, u.real_name as create_by_name FROM crm_knowledge_document d LEFT JOIN sys_user u ON d.create_by = u.id WHERE d.id = ? AND d.deleted_at IS NULL',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ code: 404, message: '文档不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[知识库] 文档详情查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建文档（支持文件上传）
router.post('/documents', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '文档名称不能为空', data: null });
    if (!type) return res.status(400).json({ code: 400, message: '文档类型不能为空', data: null });

    let filePath = null, fileSize = null, fileType = null;
    if (req.file) {
      filePath = `/uploads/knowledge/${req.file.filename}`;
      fileSize = req.file.size;
      fileType = path.extname(req.file.originalname).slice(1).toLowerCase();
    }

    const [result] = await pool.query(
      'INSERT INTO crm_knowledge_document (name, type, description, file_path, file_size, file_type, create_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), type, description || null, filePath, fileSize, fileType, req.user.userId]
    );
    res.json({ code: 200, message: '创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error('[知识库] 创建文档失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新文档
router.put('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { name, type, description } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (type !== undefined) { fields.push('type = ?'); values.push(type); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    values.push(req.params.id);
    await pool.query(`UPDATE crm_knowledge_document SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[知识库] 更新文档失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除文档
router.delete('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT file_path FROM crm_knowledge_document WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (row && row.file_path) {
      const fullPath = path.resolve(__dirname, '..', row.file_path);
      // 校验路径必须在uploads目录下，防止目录遍历
      if (!fullPath.startsWith(UPLOAD_BASE)) {
        return res.status(400).json({ code: 400, message: '非法文件路径', data: null });
      }
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await pool.query('UPDATE crm_knowledge_document SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[知识库] 删除文档失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 下载文档
router.get('/documents/:id/download', authenticateToken, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM crm_knowledge_document WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!row || !row.file_path) return res.status(404).json({ code: 404, message: '文档不存在', data: null });

    await pool.query('UPDATE crm_knowledge_document SET download_count = download_count + 1 WHERE id = ?', [req.params.id]);

    const fullPath = path.join(__dirname, '..', row.file_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ code: 404, message: '文件不存在', data: null });

    res.download(fullPath, `${row.name}.${row.file_type || 'bin'}`);
  } catch (error) {
    console.error('[知识库] 下载文档失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 知识库首页统计 ============

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [[productCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_product WHERE deleted_at IS NULL');
    const [[scriptCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_script WHERE deleted_at IS NULL');
    const [[faqCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_faq WHERE deleted_at IS NULL');
    const [[docCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_document WHERE deleted_at IS NULL');

    const [recentProducts] = await pool.query('SELECT id, name, category, create_time FROM crm_knowledge_product WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');
    const [recentScripts] = await pool.query('SELECT id, title, scene, create_time FROM crm_knowledge_script WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');
    const [recentFaqs] = await pool.query('SELECT id, question, category, create_time FROM crm_knowledge_faq WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');
    const [recentDocs] = await pool.query('SELECT id, name, type, create_time FROM crm_knowledge_document WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');

    res.json({
      code: 200, message: '查询成功',
      data: {
        counts: { products: productCount.cnt, scripts: scriptCount.cnt, faqs: faqCount.cnt, documents: docCount.cnt },
        recent: { products: recentProducts, scripts: recentScripts, faqs: recentFaqs, documents: recentDocs }
      }
    });
  } catch (error) {
    console.error('[知识库] 统计查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

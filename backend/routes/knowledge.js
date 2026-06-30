const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const knowledgeService = require('../services/knowledgeService');

// Joi schemas
const productSchema = Joi.object({
  name: Joi.string().required().max(200).trim(),
  category: Joi.string().max(100).allow('', null),
  model: Joi.string().max(100).allow('', null),
  description: Joi.string().max(5000).allow('', null),
  specs: Joi.string().max(5000).allow('', null),
  price: Joi.number().precision(2).min(0).allow(null),
  images: Joi.string().max(10000).allow('', null)
});

const productUpdateSchema = Joi.object({
  name: Joi.string().max(200).trim(),
  category: Joi.string().max(100).allow('', null),
  model: Joi.string().max(100).allow('', null),
  description: Joi.string().max(5000).allow('', null),
  specs: Joi.string().max(5000).allow('', null),
  price: Joi.number().precision(2).min(0).allow(null),
  images: Joi.string().max(10000).allow('', null),
  status: Joi.number().integer().valid(0, 1).allow(null)
});

const scriptSchema = Joi.object({
  title: Joi.string().required().max(200).trim(),
  scene: Joi.string().max(100).allow('', null),
  content: Joi.string().required().max(10000).trim(),
  sort_order: Joi.number().integer().min(0).default(0)
});

const scriptUpdateSchema = Joi.object({
  title: Joi.string().max(200).trim(),
  scene: Joi.string().max(100).allow('', null),
  content: Joi.string().max(10000).trim(),
  sort_order: Joi.number().integer().min(0)
});

const faqSchema = Joi.object({
  question: Joi.string().required().max(500).trim(),
  answer: Joi.string().required().max(10000).trim(),
  category: Joi.string().max(100).allow('', null),
  sort_order: Joi.number().integer().min(0).default(0)
});

const faqUpdateSchema = Joi.object({
  question: Joi.string().max(500).trim(),
  answer: Joi.string().max(10000).trim(),
  category: Joi.string().max(100).allow('', null),
  sort_order: Joi.number().integer().min(0)
});

const documentSchema = Joi.object({
  name: Joi.string().required().max(200).trim(),
  type: Joi.string().required().max(50),
  description: Joi.string().max(1000).allow('', null)
});

const documentUpdateSchema = Joi.object({
  name: Joi.string().max(200).trim(),
  type: Joi.string().max(50),
  description: Joi.string().max(1000).allow('', null)
});

const requireAdmin = require('../middleware/admin');
const logger = require('../config/logger');

// 文件上传配置（multer 中间件留在路由层）
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

router.get('/products', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.listProducts(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] 产品列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/products/:id', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const row = await knowledgeService.getProduct(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '产品不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[知识库] 产品详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/products', authenticateToken, requireAdmin, validate(productSchema), async (req, res) => {
  try {
    if (!req.body.name || !req.body.name.trim()) return res.status(400).json({ code: 400, message: '产品名称不能为空', data: null });
    const result = await knowledgeService.createProduct(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[知识库] 创建产品失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/products/:id', authenticateToken, requireAdmin, validate(productUpdateSchema), async (req, res) => {
  try {
    await knowledgeService.updateProduct(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[知识库] 更新产品失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await knowledgeService.deleteProduct(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[知识库] 删除产品失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/products/:id/images', authenticateToken, requireAdmin, upload.array('images', 9), async (req, res) => {
  try {
    const filePaths = req.files.map(f => `/uploads/knowledge/${f.filename}`);
    const allImages = await knowledgeService.addProductImages(pool, req.params.id, filePaths);
    res.json({ code: 200, message: '上传成功', data: { images: allImages } });
  } catch (error) {
    logger.error('[知识库] 上传图片失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/products-meta/categories', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.getProductCategories(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] 产品分类查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 销售话术 ============

router.get('/scripts', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.listScripts(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] 话术列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/scripts/:id', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const row = await knowledgeService.getScript(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '话术不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[知识库] 话术详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/scripts', authenticateToken, validate(scriptSchema), async (req, res) => {
  try {
    if (!req.body.title || !req.body.title.trim()) return res.status(400).json({ code: 400, message: '话术标题不能为空', data: null });
    if (!req.body.content || !req.body.content.trim()) return res.status(400).json({ code: 400, message: '话术内容不能为空', data: null });
    const result = await knowledgeService.createScript(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[知识库] 创建话术失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/scripts/:id', authenticateToken, validate(scriptUpdateSchema), async (req, res) => {
  try {
    await knowledgeService.updateScript(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[知识库] 更新话术失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/scripts/:id', authenticateToken, async (req, res) => {
  try {
    await knowledgeService.deleteScript(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[知识库] 删除话术失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/scripts-meta/scenes', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.getScriptScenes(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] 场景列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ FAQ ============

router.get('/faqs', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.listFaqs(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] FAQ列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/faqs/:id', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const row = await knowledgeService.getFaq(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: 'FAQ不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[知识库] FAQ详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/faqs', authenticateToken, validate(faqSchema), async (req, res) => {
  try {
    if (!req.body.question || !req.body.question.trim()) return res.status(400).json({ code: 400, message: '问题不能为空', data: null });
    if (!req.body.answer || !req.body.answer.trim()) return res.status(400).json({ code: 400, message: '答案不能为空', data: null });
    const result = await knowledgeService.createFaq(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[知识库] 创建FAQ失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/faqs/:id', authenticateToken, validate(faqUpdateSchema), async (req, res) => {
  try {
    await knowledgeService.updateFaq(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[知识库] 更新FAQ失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/faqs/:id', authenticateToken, async (req, res) => {
  try {
    await knowledgeService.deleteFaq(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[知识库] 删除FAQ失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/faqs-meta/categories', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.getFaqCategories(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] FAQ分类查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 文档管理 ============

router.get('/documents', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.listDocuments(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] 文档列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/documents/:id', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const row = await knowledgeService.getDocument(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '文档不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[知识库] 文档详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/documents', authenticateToken, upload.single('file'), validate(documentSchema), async (req, res) => {
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

    const result = await knowledgeService.createDocument(pool, { name, type, description, filePath, fileSize, fileType }, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[知识库] 创建文档失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/documents/:id', authenticateToken, validate(documentUpdateSchema), async (req, res) => {
  try {
    await knowledgeService.updateDocument(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[知识库] 更新文档失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const filePath = await knowledgeService.getDocumentFilePath(pool, req.params.id);
    if (filePath) {
      const fullPath = path.resolve(__dirname, '..', filePath);
      if (!fullPath.startsWith(UPLOAD_BASE)) return res.status(400).json({ code: 400, message: '非法文件路径', data: null });
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await knowledgeService.deleteDocument(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[知识库] 删除文档失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/documents/:id/download', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const row = await knowledgeService.getDocumentForDownload(pool, req.params.id);
    if (!row || !row.file_path) return res.status(404).json({ code: 404, message: '文档不存在', data: null });

    await knowledgeService.incrementDownloadCount(pool, req.params.id);

    const fullPath = path.join(__dirname, '..', row.file_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ code: 404, message: '文件不存在', data: null });
    res.download(fullPath, `${row.name}.${row.file_type || 'bin'}`);
  } catch (error) {
    logger.error('[知识库] 下载文档失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 知识库首页统计 ============

router.get('/stats', authenticateToken, checkPermission('knowledge'), async (req, res) => {
  try {
    const data = await knowledgeService.getStats(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[知识库] 统计查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

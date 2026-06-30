const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { cache, invalidateCache } = require('../middleware/cache');
const ROLES = require('../config/roles');
const { logFieldChanges } = require('../utils/fieldLog');
const productService = require('../services/productService');

const MODULE_NAME = '产品管理';
const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 产品管理
 *     description: 产品 CRUD、分类管理
 *
 * /api/product:
 *   get:
 *     summary: 获取产品列表
 *     tags: [产品管理]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 产品列表
 */

const productAddSchema = Joi.object({
  name: Joi.string().required().max(200),
  code: Joi.string().max(100).allow('', null),
  category: Joi.string().max(100).allow('', null),
  unit: Joi.string().max(20).allow('', null),
  price: Joi.number().precision(2).min(0).allow(null),
  cost_price: Joi.number().precision(2).min(0).allow(null),
  stock: Joi.number().integer().min(0).allow(null),
  description: Joi.string().max(2000).allow('', null)
});

const productUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  name: Joi.string().max(200).allow('', null),
  code: Joi.string().max(100).allow('', null),
  category: Joi.string().max(100).allow('', null),
  unit: Joi.string().max(20).allow('', null),
  price: Joi.number().precision(2).min(0).allow(null),
  cost_price: Joi.number().precision(2).min(0).allow(null),
  stock: Joi.number().integer().min(0).allow(null),
  status: Joi.number().integer().valid(0, 1).allow(null),
  description: Joi.string().max(2000).allow('', null)
});

const productDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const productListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  pageSize: Joi.number().integer().min(1).max(200).optional().default(20),
  keyword: Joi.string().allow('').optional(),
  name: Joi.string().allow('').optional(),
  code: Joi.string().allow('').optional(),
  category: Joi.string().allow('').optional(),
  status: Joi.number().integer().valid(0, 1).allow('', null).optional()
});

const requireAdmin = require('../middleware/admin');

// 1. 产品列表
router.post('/list', authenticateToken, cache(120), checkPermission('product'), validate(productListSchema), async (req, res) => {
  try {
    const result = await productService.listProducts(pool, req.body);

    // 非管理员不返回成本价字段
    const { manageAll, roleId } = req.user;
    const isAdmin = manageAll || ADMIN_ROLE_CODES.has(req.user.roleCode);
    if (!isAdmin) {
      result.list.forEach(item => { delete item.cost_price; });
    }

    res.json({ code: 200, message: '获取产品列表成功', data: result });
  } catch (error) {
    console.error('[产品] 获取产品列表失败:', error);
    res.status(500).json({ code: 500, message: '获取产品列表失败', data: null });
  }
});

// 2. 新增产品
router.post('/add', authenticateToken, checkPermission('product:add'), requireAdmin, validate(productAddSchema), async (req, res) => {
  try {
    const result = await productService.createProduct(pool, req.body);
    res.json({ code: 200, message: '新增产品成功', data: result });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '新增产品失败', data: null });
  }
});

// 3. 编辑产品
router.post('/update', authenticateToken, checkPermission('product:edit'), requireAdmin, validate(productUpdateSchema), async (req, res) => {
  try {
    const { id, ...data } = req.body;
    const oldData = await productService.getProductFull(pool, id);
    if (!oldData) return res.status(404).json({ code: 404, message: '产品不存在', data: null });

    await productService.updateProduct(pool, id, data);

    await logFieldChanges(req, {
      module: MODULE_NAME,
      action: '编辑产品',
      oldData,
      newData: req.body,
      allowedFields: ['name', 'model', 'category', 'unit', 'price', 'cost', 'status', 'remark', 'description'],
      description: `编辑产品: ${oldData.name}`
    });

    await invalidateCache(['cache:*:/api/product/*']);
    res.json({ code: 200, message: '修改产品成功', data: null });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '修改产品失败', data: null });
  }
});

// 4. 删除产品（逻辑删除）
router.post('/delete', authenticateToken, checkPermission('product:delete'), requireAdmin, validate(productDeleteSchema), async (req, res) => {
  try {
    await productService.deleteProduct(pool, req.body.id);
    await invalidateCache(['cache:*:/api/product/*']);
    res.json({ code: 200, message: '删除产品成功', data: null });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '删除产品失败', data: null });
  }
});

// 5. 产品详情
router.get('/detail/:id', authenticateToken, checkPermission('product'), async (req, res) => {
  try {
    const row = await productService.getProduct(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '产品不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 6. 产品分类列表
router.get('/categories', authenticateToken, checkPermission('product'), async (req, res) => {
  try {
    const data = await productService.getCategories(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[产品] 操作失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// ============ 产品价格表 ============

// 7. 获取产品价格表
router.get('/:id/prices', authenticateToken, async (req, res) => {
  try {
    const data = await productService.getProductPrices(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[产品] 价格表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 8. 添加产品价格
router.post('/:id/prices', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    const { price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to } = req.body;
    if (!price_type || unit_price === undefined) return res.status(400).json({ code: 400, message: '价格类型和单价不能为空', data: null });

    const product = await productService.getProduct(pool, productId);
    if (!product) return res.status(404).json({ code: 404, message: '产品不存在', data: null });

    const result = await productService.createPrice(pool, { product_id: productId, price_type, customer_level, unit_price, min_quantity, currency, valid_from, valid_to });
    res.json({ code: 200, message: '添加成功', data: result });
  } catch (error) {
    console.error('[产品] 添加价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 9. 更新产品价格
router.put('/price/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await productService.updatePrice(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[产品] 更新价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 10. 删除产品价格
router.delete('/price/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await productService.deletePrice(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[产品] 删除价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 11. 获取客户对应价格（报价时调用）
router.get('/:id/price', authenticateToken, async (req, res) => {
  try {
    const { customer_level } = req.query;
    const price = await productService.getDefaultPrice(pool, req.params.id, customer_level);
    res.json({ code: 200, message: '查询成功', data: price });
  } catch (error) {
    console.error('[产品] 获取客户价格失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

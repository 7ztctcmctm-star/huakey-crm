const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { restore, permanentDelete, getDeletedList } = require('../utils/softDelete');

const requireAdmin = (req, res, next) => {
  if (!req.user.manageAll && req.user.roleId !== 1) {
    return res.status(403).json({ code: 403, message: '无权限操作', data: null });
  }
  next();
};

// 可回收站管理的表配置
const TABLE_CONFIG = {
  customer: { table: 'crm_customer', nameColumn: 'company_name', label: '客户' },
  opportunity: { table: 'crm_opportunity', nameColumn: 'name', label: '商机' },
  contract: { table: 'crm_contract', nameColumn: 'contract_no', label: '合同' },
  quote: { table: 'crm_quote', nameColumn: 'quote_no', label: '报价单' },
  supplier: { table: 'crm_supplier', nameColumn: 'name', label: '供应商' },
  purchase: { table: 'crm_purchase_order', nameColumn: 'title', label: '采购单' },
  service: { table: 'crm_service_order', nameColumn: 'title', label: '工单' },
  product: { table: 'crm_product', nameColumn: 'name', label: '产品' }
};

// 获取回收站列表
router.post('/list', authenticateToken, checkPermission('recycle_bin:view'), async (req, res) => {
  const { module, page = 1, pageSize = 20, keyword } = req.body;

  if (!module || !TABLE_CONFIG[module]) {
    // 返回所有模块的已删除统计
    try {
      const stats = [];
      for (const [key, config] of Object.entries(TABLE_CONFIG)) {
        const [result] = await pool.query(
          `SELECT COUNT(*) as cnt FROM ${config.table} WHERE deleted_at IS NOT NULL`
        );
        stats.push({ module: key, label: config.label, count: result[0].cnt });
      }
      res.json({ code: 200, message: '查询成功', data: { stats } });
    } catch (error) {
      console.error('查询回收站统计失败:', error);
      res.status(500).json({ code: 500, message: '查询失败', data: null });
    }
    return;
  }

  try {
    const config = TABLE_CONFIG[module];
    const result = await getDeletedList(config.table, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      keyword,
      nameColumn: config.nameColumn
    });

    res.json({
      code: 200,
      message: '查询成功',
      data: { ...result, module, label: config.label }
    });
  } catch (error) {
    console.error('查询回收站列表失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 恢复记录
router.post('/restore', authenticateToken, checkPermission('data:restore'), requireAdmin, async (req, res) => {
  const { module, id } = req.body;

  if (!module || !TABLE_CONFIG[module] || !id) {
    return res.status(400).json({ code: 400, message: '参数不完整', data: null });
  }

  try {
    const config = TABLE_CONFIG[module];
    const success = await restore(config.table, id);

    if (success) {
      res.json({ code: 200, message: `${config.label}恢复成功`, data: null });
    } else {
      res.json({ code: 404, message: '记录不存在或未被删除', data: null });
    }
  } catch (error) {
    console.error('恢复记录失败:', error);
    res.status(500).json({ code: 500, message: '恢复失败', data: null });
  }
});

// 彻底删除
router.post('/permanent-delete', authenticateToken, checkPermission('data:restore'), requireAdmin, async (req, res) => {
  const { module, id } = req.body;

  if (!module || !TABLE_CONFIG[module] || !id) {
    return res.status(400).json({ code: 400, message: '参数不完整', data: null });
  }

  try {
    const config = TABLE_CONFIG[module];
    const success = await permanentDelete(config.table, id);

    if (success) {
      res.json({ code: 200, message: `${config.label}已彻底删除`, data: null });
    } else {
      res.json({ code: 404, message: '记录不存在', data: null });
    }
  } catch (error) {
    console.error('彻底删除失败:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

module.exports = router;

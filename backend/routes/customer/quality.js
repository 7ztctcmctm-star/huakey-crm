/**
 * @deprecated 数据质量检查路由已迁移至 /api/v1/data-quality（Prompt 4-5 质量检查剥离）。
 * 本文件保留以向前端平滑迁移返回 410 Gone，不再承载业务逻辑。
 * 新实现见 routes/dataQuality.js + services/dataManagement/qualityService.js。
 */
const express = require('express');
const router = express.Router();

const deprecated = (res, replacement) => {
  res.status(410).json({
    code: 410,
    message: `该接口已废弃，请使用 ${replacement}`,
    data: null
  });
};

router.post('/quality-check', (req, res) => deprecated(res, '/api/v1/data-quality/check'));
router.post('/quality-report', (req, res) => deprecated(res, '/api/v1/data-quality/report'));

module.exports = router;

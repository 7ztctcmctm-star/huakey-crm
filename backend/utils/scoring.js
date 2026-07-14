/**
 * 供应商评分工具入口（兼容层）
 *
 * 实际评分逻辑已迁移至 services/supplierScoringService.js（Prompt 4-5 评分统一）。
 * 本文件保留原导出签名（calculateSupplierScore / checkAllSuppliersScores /
 * getCurrentPeriod），供 routes/cronJobs.js 与定时任务调用，避免改动调用方。
 *
 * 原 PostgreSQL `ON CONFLICT` upsert 已在 supplierScoringService 中改为 MySQL
 * 兼容的 SELECT-then-INSERT/UPDATE。
 */

const pool = require('../config/database');
const supplierScoringService = require('../services/supplierScoringService');

const calculateSupplierScore = (supplierId) =>
  supplierScoringService.calculateSupplierScore(pool, supplierId);

const checkAllSuppliersScores = () =>
  supplierScoringService.checkAllSuppliersScores(pool);

const getCurrentPeriod = supplierScoringService.getCurrentPeriod;

module.exports = {
  calculateSupplierScore,
  checkAllSuppliersScores,
  getCurrentPeriod
};

/**
 * 数据管理模块注册（Prompt 4-5 质量检查剥离）
 * 将数据质量检查从客户/评分模块剥离到独立的数据管理域，
 * 路由前缀 /data-quality，权限点 data_quality:check。
 */
const registry = require('../../core/ModuleRegistry');
const router = require('../dataQuality');

const descriptor = {
  routes: router,
  permissions: [
    'data_quality:check'
  ]
};

registry.register('data-quality', descriptor);
module.exports = descriptor;

const ModuleRegistry = require('../../../core/ModuleRegistry');
const express = require('express');

describe('ModuleRegistry', () => {
  // 每个用例使用独立实例（require 缓存的是单例，测试间需清理）
  let registry;

  beforeEach(() => {
    registry = new ModuleRegistry.constructor();
  });

  test('可以注册模块并返回路由列表', () => {
    const router = express.Router();
    registry.register('customer', { routes: router, permissions: ['customer:list'] });

    const routes = registry.getAllRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('customer');
    expect(routes[0].prefix).toBe('/customer');
    expect(routes[0].router).toBe(router);
  });

  test('可以返回所有权限点', () => {
    registry.register('product', {
      routes: express.Router(),
      permissions: ['product:list', 'product:add']
    });

    const perms = registry.getAllPermissions();
    expect(perms).toHaveLength(1);
    expect(perms[0].name).toBe('product');
    expect(perms[0].permissions).toEqual(['product:list', 'product:add']);
  });

  test('缺少路由时抛出错误', () => {
    expect(() => registry.register('bad', { permissions: [] })).toThrow('must provide an Express router');
  });

  test('通过 module.js 文件注册试点模块', () => {
    // 加载真实路由需要 JWT_SECRET
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    // 模拟 app.js 加载模块
    require('../../../routes/customer/module');
    require('../../../routes/product/module');
    require('../../../routes/report/module');

    const mainRoutes = ModuleRegistry.getAllRoutes();
    const names = mainRoutes.map(r => r.name);
    expect(names).toContain('customer');
    expect(names).toContain('product');
    expect(names).toContain('report');
  });
});

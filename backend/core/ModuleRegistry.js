class ModuleRegistry {
  constructor() {
    this.modules = new Map();
  }

  /**
   * 注册模块
   * @param {string} name - 模块名称
   * @param {object} options
   * @param {import('express').Router} options.routes - 模块路由
   * @param {string[]} [options.permissions=[]] - 模块权限点
   * @param {string[]} [options.migrations=[]] - 模块迁移文件路径
   */
  register(name, { routes, permissions = [], migrations = [] }) {
    if (!name || typeof name !== 'string') {
      throw new Error('Module name must be a non-empty string');
    }
    if (!routes || typeof routes !== 'function') {
      throw new Error(`Module ${name} must provide an Express router`);
    }
    this.modules.set(name, { routes, permissions, migrations });
  }

  /**
   * 获取所有已注册模块的路由
   * @returns {Array<{name: string, prefix: string, router: import('express').Router}>}
   */
  getAllRoutes() {
    const all = [];
    for (const [name, mod] of this.modules) {
      all.push({ name, prefix: `/${name}`, router: mod.routes });
    }
    return all;
  }

  /**
   * 获取所有已注册模块的权限点
   * @returns {Array<{name: string, permissions: string[]}>}
   */
  getAllPermissions() {
    const all = [];
    for (const [name, mod] of this.modules) {
      all.push({ name, permissions: mod.permissions });
    }
    return all;
  }

  /**
   * 获取指定模块
   * @param {string} name
   */
  get(name) {
    return this.modules.get(name);
  }
}

module.exports = new ModuleRegistry();

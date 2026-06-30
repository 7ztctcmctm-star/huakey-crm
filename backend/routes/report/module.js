const registry = require('../../core/ModuleRegistry');
const router = require('./index');

const descriptor = {
  routes: router,
  permissions: [
    'report'
  ]
};

registry.register('report', descriptor);
module.exports = descriptor;

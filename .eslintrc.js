module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true,
    jest: true
  },
  extends: 'standard',
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    // 允许尾逗号（与现有代码风格一致）
    'comma-dangle': ['error', 'only-multiline'],
    // 允许 console（后端需要日志输出）
    'no-console': 'off',
    // 允许未使用的变量以 _ 开头
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // 允许函数括号前无空格（兼容现有代码）
    'space-before-function-paren': ['error', 'never'],
    // 分号风格（项目现有代码不使用分号）
    semi: ['error', 'never']
  },
  ignorePatterns: [
    'node_modules/',
    'frontend/',
    'database/',
    'scripts/',
    'deploy/',
    '*.min.js'
  ]
}

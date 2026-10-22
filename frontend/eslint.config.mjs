// 前端 ESLint flat 配置（ESLint 10 + eslint-plugin-vue 10）
// 风格与 backend/.eslintrc.json 对齐：no-unused-vars warn / no-undef error / no-empty warn，
// CI 门禁 `eslint . --max-warnings=0`（与 backend `npm run lint` 同口径）。
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.vite/**'
    ]
  },

  // Node 侧配置文件（vite / vitest / playwright / postcss 等）
  {
    files: ['*.config.js', '*.config.mjs', '*.config.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },

  // 通用 JS：浏览器环境 + 后端同源核心规则
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      // caughtErrors: 'none' 与 backend（ESLint 8 默认值）对齐：`catch (e) {}` 不使用的绑定不告警
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|next$', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': 'warn',
      'no-redeclare': 'error',
      'no-fallthrough': 'warn'
    }
  },

  // Vue SFC：官方 flat/essential 规则集
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|next$', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      // 项目约定：路由级视图按路由名单文件名（user.vue / tags.vue / index.vue），
      // 与 router 配置一一对应；src/components 下的可复用组件均为多词命名。
      // eslint-plugin-vue v10 将 multi-word-component-names 并入 essential，按项目风格关闭。
      'vue/multi-word-component-names': 'off'
    }
  },

  // Node 侧脚本与测试基建：process / global / __dirname（vite-node 运行时注入）
  {
    files: ['e2e/**/*.js', 'src/tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },

  // vitest 单测文件：describe / it / expect / vi 等全局量
  {
    files: ['src/**/*.test.js', 'src/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.vitest }
    }
  }
]

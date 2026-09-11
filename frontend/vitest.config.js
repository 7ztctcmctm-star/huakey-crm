import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/**/*.test.{js,ts}', 'src/**/__tests__/**/*.{js,ts}'],
    exclude: ['src/tests/e2e/**'],
    // 实测（2026-09-11，8 逻辑核）：13 个测试文件并行时，request/guards/Login 三个既有文件的
    // beforeEach（vi.resetModules + 动态 import，jsdom 下开销大）会因 CPU 争抢超过 10s 而失败；
    // guards.test.js 的动态 import('@/router/index') 用例体更是实测 12s。串行跑全绿（56s），
    // 并行跑 26s。故放宽超时上限、保持并行——这些用例本身逻辑是毫秒级的，慢在模块加载争抢 CPU。
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  }
})

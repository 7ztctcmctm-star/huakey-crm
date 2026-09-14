import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  },
  build: {
    // 生产构建剥离 console.log 和 debugger（保留 console.warn/error 用于故障排查）
    minify: 'esbuild',
    esbuild: {
      drop: ['debugger'],
      pure: ['console.log'],
    },
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 注：此处 MUST 使用函数形式而非对象形式。
        // 对象形式会把 element-plus 整个包**强制**归入单一 chunk，
        // 覆盖 Rollup 自身按 import 图做的代码分割，导致产出一个 ~944 KB 的巨石 chunk
        // 并经由 index.html 的 modulepreload 进入首屏关键路径。
        // 函数形式下仅对 vue 生态与 echarts 做定向归组，element-plus 交由 Rollup
        // 按组件粒度自动切分（登录页只需 el-form/el-input 等少量组件）。
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // vue 运行时与路由/状态/请求 —— 保持单块，命中率高且体积小
          if (/[\\/]node_modules[\\/](vue|vue-router|pinia|axios|@vue)[\\/]/.test(id)) {
            return 'vendor'
          }
          // echarts 已经是路由级懒加载（仅出现在路由 manifest 中，index.html 未 preload），
          // 单独归组以便长期缓存；如需进一步瘦身可改用 echarts 按需注册（useECharts.js 已是按需注册）
          if (/[\\/]node_modules[\\/](echarts|zrender)[\\/]/.test(id)) {
            return 'echarts'
          }
          // element-plus 不再强制归组，交给 Rollup 自动切分
        }
      }
    }
  }
})

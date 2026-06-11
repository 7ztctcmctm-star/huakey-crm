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
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'echarts-core': ['echarts/core', 'echarts/renderers', 'echarts/charts', 'echarts/components'],
          'echarts-charts': ['echarts/lib/chart/line', 'echarts/lib/chart/bar', 'echarts/lib/chart/pie', 'echarts/lib/chart/scatter', 'echarts/lib/chart/radar'],
          'echarts-components': ['echarts/lib/component/tooltip', 'echarts/lib/component/legend', 'echarts/lib/component/grid', 'echarts/lib/component/title', 'echarts/lib/component/dataZoom', 'echarts/lib/component/markLine', 'echarts/lib/component/markPoint'],
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          'vendor': ['vue', 'vue-router', 'pinia', 'axios']
        }
      }
    }
  }
})

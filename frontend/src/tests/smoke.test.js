import { describe, it, expect } from 'vitest'
import { createApp, ref, reactive, computed, watch, onMounted } from 'vue'

describe('前端冒烟测试', () => {
  it('Vue 核心API可用', () => {
    expect(createApp).toBeDefined()
    expect(ref).toBeDefined()
    expect(reactive).toBeDefined()
    expect(computed).toBeDefined()
    expect(watch).toBeDefined()
    expect(onMounted).toBeDefined()
  })

  it('Vue 可正常创建实例', () => {
    const app = createApp({ template: '<div>test</div>' })
    expect(app).toBeDefined()
    expect(typeof app.use).toBe('function')
    expect(typeof app.mount).toBe('function')
  })

  it('ref 响应式正常', () => {
    const count = ref(0)
    expect(count.value).toBe(0)
    count.value = 1
    expect(count.value).toBe(1)
  })

  it('computed 计算属性正常', () => {
    const count = ref(2)
    const doubled = computed(() => count.value * 2)
    expect(doubled.value).toBe(4)
    count.value = 5
    expect(doubled.value).toBe(10)
  })

  it('axios 可正常导入', async () => {
    const axios = await import('axios')
    expect(axios.default).toBeDefined()
    expect(typeof axios.default.get).toBe('function')
    expect(typeof axios.default.post).toBe('function')
  })
})

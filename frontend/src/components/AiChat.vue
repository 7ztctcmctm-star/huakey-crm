<template>
  <div>
    <div class="ai-fab" @click="open = !open" :class="{ hide: open }">
      <el-icon :size="22"><ChatDotSquare /></el-icon>
    </div>

    <Transition name="slide">
      <div v-if="open" class="ai-panel">
        <div class="ai-header">
          <span>AI 助手 · {{ modelName }}</span>
          <div>
            <span class="ai-status" :class="{ on: online }">{{ online ? '在线' : '离线' }}</span>
            <el-button link @click="open = false"><el-icon><Close /></el-icon></el-button>
          </div>
        </div>

        <div class="ai-body" ref="bodyRef">
          <div v-if="msgs.length === 0" class="ai-welcome">
            <el-icon :size="28"><ChatDotSquare /></el-icon>
            <p>我可以帮你分析CRM数据</p>
            <div class="ai-hints">
              <span v-for="h in hints" :key="h" @click="input = h; send()">{{ h }}</span>
            </div>
          </div>
          <div v-for="(m, i) in msgs" :key="i" :class="['ai-bubble', m.role]">{{ m.content }}</div>
          <div v-if="loading" class="ai-bubble assistant thinking">...</div>
        </div>

        <div class="ai-foot">
          <el-input v-model="input" placeholder="输入问题，回车发送" @keyup.enter="send" :disabled="loading" size="default" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { ChatDotSquare, Close } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { getAiStatus, aiQuery, aiChat } from '@/api/ai'

const route = useRoute()
const open = ref(false)
const input = ref('')
const msgs = ref([])
const loading = ref(false)
const online = ref(false)
const modelName = ref('AI')
const bodyRef = ref(null)

const hints = ['最近7天新增了多少线索', '各等级的客户数量', '本月成交合同总额', '如何跟进逾期客户']

function getCtx() {
  const m = {
    '/dashboard': '仪表盘页面，可看到销售数据、客户统计、业绩排行',
    '/leads': '线索管理页面，管理潜在客户线索',
    '/customer/list': '客户列表，管理正式成交客户',
    '/customer/pool': '客户公海，无负责人的客户资源池'
  }
  return m[route.path] || '铧旗CRM系统'
}

function scroll() { nextTick(() => { if (bodyRef.value) bodyRef.value.scrollTop = 99999 }) }

function isDataQuery(text) {
  return /多少|几个|统计|最近|哪些|查询|总数|数量|排行|分布|对比|占比|金额|今天|本周|本月/.test(text)
}

async function send() {
  const t = input.value.trim()
  if (!t || loading.value) return
  input.value = ''
  msgs.value.push({ role: 'user', content: t })
  loading.value = true
  scroll()
  try {
    let r
    if (isDataQuery(t)) {
      r = await aiQuery({ question: t }, { timeout: 60000 })
      if (r.code === 200) {
        const d = r.data
        msgs.value.push({ role: 'assistant', content: d.answer + '\n\n查询到 ' + d.total + ' 条记录' })
      }
    } else {
      r = await aiChat({
        messages: msgs.value.map(m => ({ role: m.role, content: m.content })),
        context: getCtx()
      }, { timeout: 60000 })
      if (r.code === 200) {
        msgs.value.push({ role: 'assistant', content: r.data.reply })
      }
    }
    if (r?.code !== 200) {
      msgs.value.push({ role: 'assistant', content: r?.message || '调用失败' })
    }
  } catch (e) {
    msgs.value.push({ role: 'assistant', content: '连接失败' })
  }
  loading.value = false
  scroll()
}

onMounted(async () => {
  try {
    const r = await getAiStatus()
    if (r.data) {
      online.value = r.data.online
      const label = r.data.model || r.data.models?.[0] || 'AI'
      modelName.value = r.data.provider ? `${r.data.provider}/${label}` : label
    }
  } catch { online.value = false }
})
</script>

<style scoped>
.ai-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 2000;
  width: 44px; height: 44px; border-radius: 50%;
  background: #1a56db; color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; box-shadow: 0 2px 8px rgba(26,86,219,0.3);
  transition: opacity 0.2s;
}
.ai-fab:hover { opacity: 0.85; }
.ai-fab.hide { opacity: 0; pointer-events: none; }

.ai-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 1999;
  width: 360px; background: #fff; border-left: 1px solid #e5e7eb;
  display: flex; flex-direction: column; box-shadow: 0 4px 16px rgba(0,0,0,0.06);
}
.ai-header {
  height: 48px; padding: 0 16px; display: flex; align-items: center;
  justify-content: space-between; border-bottom: 1px solid #e5e7eb;
  font-weight: 600; font-size: 14px; flex-shrink: 0;
}
.ai-status { font-size: 11px; color: #9ca3af; margin-right: 8px; }
.ai-status.on { color: #22c55e; }
.ai-body { flex: 1; overflow-y: auto; padding: 16px; }
.ai-welcome { text-align: center; color: #9ca3af; padding-top: 48px; }
.ai-welcome p { margin: 12px 0 16px; font-size: 13px; }
.ai-hints { display: flex; flex-direction: column; gap: 6px; padding: 0 24px; }
.ai-hints span {
  padding: 8px 12px; background: #f3f4f6; border-radius: 8px;
  font-size: 13px; cursor: pointer; color: #374151;
}
.ai-hints span:hover { background: #e5e7eb; }
.ai-bubble {
  max-width: 85%; padding: 8px 12px; border-radius: 10px;
  font-size: 13px; line-height: 1.5; margin-bottom: 10px; white-space: pre-wrap;
}
.ai-bubble.user { background: #1a56db; color: #fff; margin-left: auto; border-bottom-right-radius: 4px; }
.ai-bubble.assistant { background: #f3f4f6; color: #111827; border-bottom-left-radius: 4px; }
.ai-bubble.thinking { color: #9ca3af; }
.ai-foot { padding: 12px 16px; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
.slide-enter-active, .slide-leave-active { transition: transform 0.2s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
</style>

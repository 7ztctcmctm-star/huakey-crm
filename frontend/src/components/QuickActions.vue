<template>
  <el-popover placement="bottom-end" :width="200" trigger="click" popper-class="quick-actions-popover">
    <template #reference>
      <el-button link class="quick-create-btn" title="快速创建 (Ctrl+N)">
        <el-icon :size="20"><Plus /></el-icon>
      </el-button>
    </template>
    <div class="quick-menu">
      <div class="quick-menu-item" @click="openCreate('customer')">
        <el-icon><UserFilled /></el-icon>
        <span>新建客户</span>
        <kbd>Ctrl+N</kbd>
      </div>
      <div class="quick-menu-item" @click="openCreate('opportunity')">
        <el-icon><TrendCharts /></el-icon>
        <span>新建商机</span>
        <kbd>Ctrl+Shift+N</kbd>
      </div>
      <div class="quick-menu-item" @click="openCreate('followup')">
        <el-icon><ChatDotRound /></el-icon>
        <span>添加跟进</span>
      </div>
      <div class="quick-menu-item" @click="openCreate('contract')">
        <el-icon><Document /></el-icon>
        <span>新建合同</span>
      </div>
      <el-divider style="margin: 8px 0" />
      <div class="quick-menu-item" @click="showShortcuts = true">
        <el-icon><QuestionFilled /></el-icon>
        <span>快捷键列表</span>
        <kbd>?</kbd>
      </div>
    </div>
  </el-popover>

  <el-dialog v-model="showShortcuts" title="快捷键" width="400px" :append-to-body="true">
    <div class="shortcuts-list">
      <div class="shortcut-group">
        <h4>导航</h4>
        <div class="shortcut-item"><kbd>Ctrl</kbd> + <kbd>K</kbd><span>全局搜索</span></div>
        <div class="shortcut-item"><kbd>Ctrl</kbd> + <kbd>B</kbd><span>切换侧边栏</span></div>
      </div>
      <div class="shortcut-group">
        <h4>快速创建</h4>
        <div class="shortcut-item"><kbd>Ctrl</kbd> + <kbd>N</kbd><span>新建客户</span></div>
        <div class="shortcut-item"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd><span>新建商机</span></div>
        <div class="shortcut-item"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd><span>添加跟进</span></div>
      </div>
      <div class="shortcut-group">
        <h4>通用</h4>
        <div class="shortcut-item"><kbd>Esc</kbd><span>关闭弹窗</span></div>
        <div class="shortcut-item"><kbd>?</kbd><span>显示快捷键帮助</span></div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { UserFilled, TrendCharts, ChatDotRound, Document, Plus, QuestionFilled } from '@element-plus/icons-vue'

const router = useRouter()
const showShortcuts = ref(false)

const openCreate = (type) => {
  switch (type) {
    case 'customer':
      router.push('/customer/list?action=add')
      break
    case 'opportunity':
      router.push('/opportunity?action=add')
      break
    case 'followup':
      router.push('/customer/list?action=followup')
      break
    case 'contract':
      router.push('/contract?action=add')
      break
  }
}

const handleKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const searchInput = document.querySelector('.global-search-input input')
    if (searchInput) { searchInput.focus(); searchInput.select() }
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey) {
    e.preventDefault()
    openCreate('customer')
  }

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
    e.preventDefault()
    openCreate('opportunity')
  }

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
    e.preventDefault()
    openCreate('followup')
  }

  if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault()
    showShortcuts.value = !showShortcuts.value
  }

  if (e.key === 'Escape') {
    showShortcuts.value = false
  }
}

onMounted(() => { document.addEventListener('keydown', handleKeydown) })
onUnmounted(() => { document.removeEventListener('keydown', handleKeydown) })
</script>

<style scoped>
.quick-create-btn {
  padding: 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
}
.quick-create-btn:hover {
  background-color: var(--color-bg-secondary);
}

.quick-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.quick-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
  font-size: 14px;
}
.quick-menu-item:hover {
  background-color: var(--color-bg-secondary);
}
.quick-menu-item .el-icon {
  color: var(--color-text-secondary);
}
.quick-menu-item span {
  flex: 1;
}
.quick-menu-item kbd {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-family: monospace;
}

.shortcuts-list {
  max-height: 400px;
  overflow-y: auto;
}
.shortcut-group {
  margin-bottom: 20px;
}
.shortcut-group h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: var(--color-text);
}
.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
}
.shortcut-item kbd {
  font-size: 12px;
  padding: 3px 8px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: monospace;
}
.shortcut-item span {
  color: var(--color-text-secondary);
}
</style>

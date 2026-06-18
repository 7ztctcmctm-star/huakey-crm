<template>
  <div class="batch-actions" v-if="selectedCount > 0">
    <span class="selected-count">已选择 {{ selectedCount }} 项</span>
    <el-button type="primary" size="small" @click="$emit('batch-assign')">批量分配</el-button>
    <el-button type="warning" size="small" @click="$emit('batch-tag')">批量标签</el-button>
    <el-button type="danger" size="small" @click="$emit('batch-delete')">批量删除</el-button>
    <el-button size="small" @click="$emit('clear-selection')">取消选择</el-button>
  </div>
</template>

<script setup>
defineProps({
  selectedCount: { type: Number, default: 0 }
})

defineEmits(['batch-assign', 'batch-tag', 'batch-delete', 'clear-selection'])
</script>

<style scoped>
.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
}

.selected-count {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-right: 8px;
}
</style>

<template>
  <div class="pagination">
    <el-pagination
      :model-value="page"
      @update:model-value="$emit('update:page', $event)"
      :model-value:page-size="pageSize"
      @update:page-size="$emit('update:pageSize', $event)"
      :page-sizes="[10, 20, 50, 100]"
      :total="total"
      layout="total, sizes, prev, pager, next, jumper"
      @size-change="$emit('size-change')"
      @current-change="$emit('current-change')"
    />
  </div>
</template>

<script setup>
defineProps({
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 }
})

defineEmits(['update:page', 'update:pageSize', 'size-change', 'current-change'])
</script>

<style scoped>
.pagination {
  margin-top: var(--space-5);
  display: flex;
  justify-content: flex-end;
  padding: var(--space-4) 0;
}
</style>

<template>
  <div class="state-wrapper" role="status">
    <!-- 加载态：默认 el-skeleton，可通过 #loading 插槽自定义（如 TableSkeleton） -->
    <div v-if="loading" class="state-wrapper__loading">
      <slot name="loading">
        <el-skeleton :rows="5" animated />
      </slot>
    </div>

    <!-- 错误态：EmptyState 在 type="error" 时自带「重新加载」按钮，接上 retry 即可。
         曾在此再塞一个同名按钮，导致页面上出现两个「重新加载」，且靠上的那个不接事件（死按钮） -->
    <div v-else-if="error" class="state-wrapper__error">
      <EmptyState type="error" :title="errorTitle" :description="error" @retry="$emit('retry')" />
    </div>

    <!-- 空白态 -->
    <div v-else-if="empty" class="state-wrapper__empty">
      <slot name="empty">
        <EmptyState :type="emptyType" :title="emptyText" :description="emptyDescription">
          <slot name="empty-action" />
        </EmptyState>
      </slot>
    </div>

    <!-- 正常态 -->
    <div v-else class="state-wrapper__content">
      <slot />
    </div>
  </div>
</template>

<script setup>
/**
 * 统一状态容器 —— 加载 / 错误 / 空 / 正常 四态切换。
 *
 * 用法一（最简）：
 * <StateWrapper :loading="loading" :error="errorMsg" :empty="data.length === 0" @retry="fetchData">
 *   <el-table :data="data" />
 * </StateWrapper>
 *
 * 用法二（表格页，自定义骨架）：
 * <StateWrapper :loading="loading" :error="errorMsg" :empty="data.length === 0" @retry="fetchList">
 *   <template #loading>
 *     <TableSkeleton :rows="8" :cols="6" />
 *   </template>
 *   <template #empty-action>
 *     <el-button type="primary" size="small" @click="handleAdd">新增</el-button>
 *   </template>
 *   <el-table :data="data" />
 * </StateWrapper>
 */
import EmptyState from '@/components/common/EmptyState.vue'

defineProps({
  /** 是否加载中 */
  loading: { type: Boolean, default: false },
  /** 错误信息字符串（真值 = 显示错误态） */
  error: { type: String, default: '' },
  /** 是否显示空白态 */
  empty: { type: Boolean, default: false },
  /** 空白态类型：data | search | permission | error */
  emptyType: { type: String, default: 'data' },
  /** 空白态提示文字 */
  emptyText: { type: String, default: '暂无数据' },
  /** 空白态辅助说明 */
  emptyDescription: { type: String, default: '' },
  /** 错误态标题 */
  errorTitle: { type: String, default: '加载失败' },
})

defineEmits(['retry'])
</script>

<style scoped>
.state-wrapper {
  width: 100%;
}

.state-wrapper__loading,
.state-wrapper__error,
.state-wrapper__empty,
.state-wrapper__content {
  width: 100%;
}
</style>

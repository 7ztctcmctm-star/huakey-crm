<template>
  <div class="state-wrapper">
    <!-- 加载态 -->
    <el-skeleton v-if="loading" :rows="5" animated />

    <!-- 错误态 -->
    <el-result
      v-else-if="error"
      icon="error"
      :title="errorTitle"
      :sub-title="error"
    >
      <template #extra>
        <el-button type="primary" @click="$emit('retry')">重试</el-button>
      </template>
    </el-result>

    <!-- 空白态 -->
    <el-empty v-else-if="empty" :description="emptyText || '暂无数据'" />

    <!-- 正常态 -->
    <slot v-else />
  </div>
</template>

<script setup>
defineProps({
  /** 是否加载中 */
  loading: { type: Boolean, default: false },
  /** 错误信息字符串（真值 = 显示错误态） */
  error: { type: String, default: '' },
  /** 是否显示空白态 */
  empty: { type: Boolean, default: false },
  /** 空白态提示文字 */
  emptyText: { type: String, default: '暂无数据' },
  /** 错误态标题 */
  errorTitle: { type: String, default: '加载失败' },
});

defineEmits(['retry']);
</script>
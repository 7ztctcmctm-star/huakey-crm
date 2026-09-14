<template>
  <div class="page-toolbar">
    <!-- 筛选/搜索区：默认可见的筛选项 -->
    <div class="page-toolbar__filters">
      <slot />

      <!-- 超出 maxVisible 的筛选项：折叠区 -->
      <div v-if="hasCollapsible && hasExtra" v-show="expanded" class="page-toolbar__filters-extra">
        <slot name="extra" />
      </div>

      <!-- 展开/收起 与 查询/重置：作为筛选区的尾部动作，与筛选项同行 -->
      <div class="page-toolbar__filter-actions">
        <slot name="filter-actions" />
        <el-button
          v-if="hasCollapsible && hasExtra"
          link
          type="primary"
          class="page-toolbar__toggle"
          @click="toggle"
        >
          {{ expanded ? '收起' : '展开' }}
          <el-icon class="page-toolbar__toggle-icon" :class="{ 'is-expanded': expanded }">
            <ArrowDown />
          </el-icon>
        </el-button>
      </div>
    </div>

    <!-- 主操作按钮区：始终靠右 -->
    <div v-if="$slots.actions" class="page-toolbar__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
/**
 * 列表页统一工具栏 —— 左侧筛选/搜索，右侧主操作按钮。
 *
 * 规范（对应路线图 v2 §P1-1）：
 *  1. 左侧放筛选/搜索，右侧放主操作按钮（`el-button--primary`）
 *  2. 筛选项超过 `maxVisible` 个时，自动折叠，带「展开/收起」
 *  3. 统一间距、圆角、高度（样式集中在 apple.css 的 .page-toolbar）
 *
 * 用法（筛选项 ≤ 3 个）：
 * <PageToolbar>
 *   <el-form-item label="关键词">
 *     <el-input v-model="search.keyword" />
 *   </el-form-item>
 *   <template #filter-actions>
 *     <el-button type="primary" native-type="submit">查询</el-button>
 *     <el-button @click="resetSearch">重置</el-button>
 *   </template>
 *   <template #actions>
 *     <el-button type="primary" :icon="Plus" @click="handleAdd">新增</el-button>
 *   </template>
 * </PageToolbar>
 *
 * 用法（筛选项 > 3 个，前 3 个常驻，其余折叠）：
 * <PageToolbar :collapsible="true" :max-visible="3">
 *   <el-form-item label="关键词">…</el-form-item>   <!-- 常驻 -->
 *   <template #extra>
 *     <el-form-item label="类型">…</el-form-item>    <!-- 折叠 -->
 *   </template>
 *   …
 * </PageToolbar>
 */
import { ref, computed, useSlots } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'

const props = defineProps({
  /** 是否启用折叠（筛选项多于 maxVisible 时才有意义） */
  collapsible: { type: Boolean, default: false },
  /** 常驻可见的筛选项数量，超出部分需放进 #extra 插槽 */
  maxVisible: { type: Number, default: 3 },
  /** 初始是否展开 */
  defaultExpanded: { type: Boolean, default: false },
})

const slots = useSlots()
const expanded = ref(props.defaultExpanded)

/** 是否提供了折叠槽（无 extra 槽则不做折叠，避免出现「展开」点了没反应） */
const hasExtra = computed(() => Boolean(slots.extra))

/** 折叠能力是否生效：需同时满足「开启折叠」且「确实有额外筛选项」 */
const hasCollapsible = computed(() => props.collapsible && hasExtra.value)

function toggle() {
  expanded.value = !expanded.value
}

/** 供父组件在需要时收起折叠区（如查询/重置后） */
defineExpose({ collapse: () => { expanded.value = false } })
</script>

<style scoped>
.page-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  row-gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.page-toolbar__filters {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  row-gap: var(--space-3);
  flex: 1 1 auto;
  min-width: 0;
}

.page-toolbar__filters-extra {
  display: contents;
}

.page-toolbar__filter-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.page-toolbar__toggle {
  gap: 2px;
}

.page-toolbar__toggle-icon {
  transition: transform 0.15s var(--ease-out);
}

.page-toolbar__toggle-icon.is-expanded {
  transform: rotate(180deg);
}

.page-toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
  margin-left: auto;
}

@media (max-width: 768px) {
  .page-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .page-toolbar__actions {
    margin-left: 0;
    justify-content: flex-end;
  }
}
</style>

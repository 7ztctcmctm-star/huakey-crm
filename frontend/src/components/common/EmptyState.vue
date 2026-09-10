<template>
  <div class="empty-state" :class="{ 'empty-state--compact': compact }" role="status">
    <!-- 无数据：空托盘 -->
    <svg v-if="type === 'data'" class="empty-state__art" viewBox="0 0 120 88" aria-hidden="true">
      <ellipse cx="60" cy="72" rx="34" ry="6" fill="var(--skeleton-base)" />
      <path d="M26 40h20l6 10h32l6-10h-4V30H30v10h-4z" fill="var(--color-bg-secondary)" stroke="var(--color-border-strong)" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M26 40l10 22h48l10-22" fill="none" stroke="var(--color-border-strong)" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M46 44l3 12M60 44v12M74 44l-3 12" fill="none" stroke="var(--color-border)" stroke-width="1.5" stroke-linecap="round" />
    </svg>

    <!-- 无搜索结果：放大镜 -->
    <svg v-else-if="type === 'search'" class="empty-state__art" viewBox="0 0 120 88" aria-hidden="true">
      <circle cx="54" cy="40" r="22" fill="var(--color-bg-secondary)" stroke="var(--color-border-strong)" stroke-width="2" />
      <path d="M70 56l16 16" fill="none" stroke="var(--color-border-strong)" stroke-width="3" stroke-linecap="round" />
      <path d="M44 34h20M44 42h14" fill="none" stroke="var(--color-border)" stroke-width="2" stroke-linecap="round" />
      <ellipse cx="60" cy="76" rx="30" ry="5" fill="var(--skeleton-base)" />
    </svg>

    <!-- 无权限：锁 -->
    <svg v-else-if="type === 'permission'" class="empty-state__art" viewBox="0 0 120 88" aria-hidden="true">
      <rect x="38" y="42" width="44" height="32" rx="8" fill="var(--color-bg-secondary)" stroke="var(--color-border-strong)" stroke-width="2" />
      <path d="M48 42v-8a12 12 0 0 1 24 0v8" fill="none" stroke="var(--color-border-strong)" stroke-width="2" stroke-linecap="round" />
      <circle cx="60" cy="56" r="4" fill="var(--color-text-tertiary)" />
      <path d="M60 60v6" fill="none" stroke="var(--color-text-tertiary)" stroke-width="2" stroke-linecap="round" />
      <ellipse cx="60" cy="78" rx="28" ry="4" fill="var(--skeleton-base)" />
    </svg>

    <!-- 加载失败：断链 -->
    <svg v-else class="empty-state__art" viewBox="0 0 120 88" aria-hidden="true">
      <path d="M42 54l-8 8a12 12 0 0 1-17-17l10-10" fill="none" stroke="var(--color-border-strong)" stroke-width="2.5" stroke-linecap="round" />
      <path d="M78 34l8-8a12 12 0 0 1 17 17l-10 10" fill="none" stroke="var(--color-border-strong)" stroke-width="2.5" stroke-linecap="round" />
      <path d="M52 44l16 16M68 44L52 60" fill="none" stroke="var(--color-danger)" stroke-width="2.5" stroke-linecap="round" />
      <ellipse cx="60" cy="78" rx="28" ry="4" fill="var(--skeleton-base)" />
    </svg>

    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>

    <el-button v-if="type === 'error'" size="small" class="empty-state__action" @click="$emit('retry')">
      重新加载
    </el-button>

    <!-- 自定义操作（如「新增第一个客户」）。包一层容器：插槽内容在父作用域编译，
         直接给 slot 内的按钮加 scoped class 不生效，间距必须由本组件提供 -->
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<script setup>
/**
 * 统一空状态 —— 视觉优化规范 §7.4 / 第三阶段。
 * 用内联 SVG 插画替代 el-empty 默认图，四种场景共用同一套视觉语言。
 */
import { computed } from 'vue'

const DEFAULT_TITLE = {
  data: '暂无数据',
  search: '没有找到匹配的结果',
  permission: '没有访问权限',
  error: '加载失败'
}

const props = defineProps({
  /** data | search | permission | error */
  type: { type: String, default: 'data' },
  /** 主标题，留空则用各类型的默认文案 */
  title: { type: String, default: '' },
  /** 辅助说明，14px 灰色 */
  description: { type: String, default: '' },
  /** 插画尺寸（px） */
  size: { type: Number, default: 96 },
  /** 紧凑模式：用于卡片内嵌、下拉面板等小空间（对应原 image-size <= 60 的场景） */
  compact: { type: Boolean, default: false }
})

defineEmits(['retry'])

// 必须用 computed：title 会随外部状态变化（如客户列表「我的 / 全部」视图切换），
// 写成普通常量会导致切换视图后标题不更新。
const title = computed(() => props.title || DEFAULT_TITLE[props.type] || DEFAULT_TITLE.data)
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-7) var(--space-5);
  text-align: center;
}

.empty-state__art {
  width: 96px;
  height: 70px;
  margin-bottom: var(--space-1);
}

.empty-state__title {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary);
  letter-spacing: -0.01em;
}

.empty-state__desc {
  margin: 0;
  max-width: 320px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-tertiary);
}

.empty-state__action {
  margin-top: var(--space-2);
}

.empty-state__actions {
  margin-top: var(--space-3);
}

.empty-state--compact {
  padding: var(--space-4);
  gap: var(--space-1);
}

.empty-state--compact .empty-state__art {
  width: 60px;
  height: 44px;
  margin-bottom: 0;
}

.empty-state--compact .empty-state__title {
  font-size: 14px;
}

.empty-state--compact .empty-state__desc {
  font-size: 13px;
}
</style>

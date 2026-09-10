<template>
  <div class="table-skeleton" role="status" :aria-label="ariaLabel">
    <div class="skeleton-head">
      <div
        v-for="c in cols"
        :key="`h-${c}`"
        class="skeleton-bar skeleton-bar--head"
        :style="{ width: headWidth(c) }"
      />
    </div>
    <div v-for="r in rows" :key="`r-${r}`" class="skeleton-row">
      <div
        v-for="c in cols"
        :key="`c-${r}-${c}`"
        class="skeleton-bar"
        :style="{ width: cellWidth(r, c) }"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * 表格加载骨架屏 —— 替代 v-loading 全屏转圈（视觉优化规范 §8.4）。
 * 尺寸对齐 apple.css 表格规范：表头 48px、行高 56px、圆角 16px。
 */
defineProps({
  /** 骨架行数 */
  rows: { type: Number, default: 6 },
  /** 骨架列数 */
  cols: { type: Number, default: 6 },
  ariaLabel: { type: String, default: '数据加载中' }
})

// 用行/列序号推导稳定宽度，避免每次渲染跳动
const WIDTH_POOL = ['72%', '84%', '58%', '90%', '66%', '78%']
const cellWidth = (r, c) => WIDTH_POOL[(r * 3 + c) % WIDTH_POOL.length]
const headWidth = (c) => WIDTH_POOL[(c * 5) % WIDTH_POOL.length]
</script>

<style scoped>
.table-skeleton {
  width: 100%;
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.skeleton-head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 48px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border-strong);
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 56px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.skeleton-row:last-child {
  border-bottom: none;
}

.skeleton-bar {
  flex: none;
  height: 12px;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--skeleton-base) 25%,
    var(--skeleton-highlight) 37%,
    var(--skeleton-base) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s var(--ease-out) infinite;
}

.skeleton-bar--head {
  height: 10px;
  background: var(--skeleton-base);
  animation: none;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-bar {
    animation: none;
  }
}
</style>

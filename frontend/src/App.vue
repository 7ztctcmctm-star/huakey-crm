<template>
  <GlobalErrorBoundary>
    <router-view />
  </GlobalErrorBoundary>
</template>

<script setup>
import GlobalErrorBoundary from '@/components/common/GlobalErrorBoundary.vue';
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
}
</style>

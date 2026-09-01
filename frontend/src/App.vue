<template>
  <el-config-provider :locale="zhCn">
    <GlobalErrorBoundary>
      <router-view />
    </GlobalErrorBoundary>
  </el-config-provider>
</template>

<script setup>
import GlobalErrorBoundary from '@/components/common/GlobalErrorBoundary.vue';
// Element Plus 中文 locale：修复表格空状态 "No Data"、分页 "Total/Go to" 等英文默认文案
import zhCn from 'element-plus/es/locale/lang/zh-cn';
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

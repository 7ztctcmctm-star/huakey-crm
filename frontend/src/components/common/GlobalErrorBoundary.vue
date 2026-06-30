<template>
  <slot v-if="!hasError" />
  <el-result v-else icon="error" title="页面出现异常" :sub-title="errorMessage">
    <template #extra>
      <el-button type="primary" @click="handleRetry">刷新页面</el-button>
      <el-button @click="handleGoHome">返回首页</el-button>
    </template>
  </el-result>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue';
import { useRouter } from 'vue-router';

const hasError = ref(false);
const errorMessage = ref('');
const router = useRouter();

onErrorCaptured((err, instance, info) => {
  console.error('[ErrorBoundary]', err.message, info);
  hasError.value = true;
  errorMessage.value = err?.message || '未知错误';
  return false;
});

function handleRetry() { window.location.reload(); }
function handleGoHome() { hasError.value = false; errorMessage.value = ''; router.push('/'); }
</script>

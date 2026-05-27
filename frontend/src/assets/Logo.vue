<template>
  <div class="logo-container">
    <div class="logo-icon">
      <span class="logo-text">H</span>
    </div>
    <span class="logo-title">铧旗CRM</span>
  </div>
</template>

<script setup>
</script>

<style scoped>
.logo-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #409EFF, #67C23A);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-text {
  color: #fff;
  font-size: 18px;
  font-weight: bold;
}

.logo-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
</style>

<template>
  <el-dropdown @command="handleCommand">
    <span class="user-info">
      <el-icon><User /></el-icon>
      {{ userInfo.realName || userInfo.username }}
      <el-icon><ArrowDown /></el-icon>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="profile">个人中心</el-dropdown-item>
        <el-dropdown-item command="settings">系统设置</el-dropdown-item>
        <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, ArrowDown } from '@element-plus/icons-vue'
import { logout } from '@/api/auth'
import { useUser } from '@/composables/useUser'
import { disconnectSSE } from '@/utils/sse'

const props = defineProps({
  userInfo: { type: Object, default: () => ({}) }
})

const router = useRouter()
const { clearUser } = useUser()

const handleCommand = (command) => {
  switch (command) {
    case 'profile':
      router.push('/profile')
      break
    case 'settings':
      router.push('/settings')
      break
    case 'logout':
      handleLogout()
      break
  }
}

const handleLogout = () => {
  ElMessageBox.confirm('确定要退出登录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await logout()
    } catch (e) { /* 即使后端请求失败也继续登出 */ }
    clearUser()
    disconnectSSE()
    ElMessage.success('退出登录成功')
    router.push('/login')
  }).catch(() => {})
}
</script>

<style scoped>
.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #303133;
}

.user-info:hover {
  color: #409eff;
}
</style>

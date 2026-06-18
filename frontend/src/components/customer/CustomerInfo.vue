<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span class="card-title">基本信息</span>
        <el-button v-if="!isEditing" type="primary" link @click="startEdit">编辑</el-button>
        <div v-else>
          <el-button size="small" @click="cancelEdit">取消</el-button>
          <el-button type="primary" size="small" @click="saveEdit">保存</el-button>
        </div>
      </div>
    </template>

    <el-descriptions :column="2" border>
      <el-descriptions-item label="公司名称">{{ customer.company_name }}</el-descriptions-item>
      <el-descriptions-item label="客户来源">{{ customer.source || '-' }}</el-descriptions-item>
      <el-descriptions-item label="客户等级">
        <el-tag :type="getLevelTag(customer.level)" size="small">{{ customer.level || '-' }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="客户状态">
        <el-tag :type="getStatusTag(customer.status)" size="small">{{ getStatusText(customer.status) }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="客户类型">{{ customer.customer_type === 'prospect' ? '潜客' : '正式客户' }}</el-descriptions-item>
      <el-descriptions-item label="生命周期">{{ getLifecycleText(customer.lifecycle_status) }}</el-descriptions-item>
      <el-descriptions-item label="负责人">{{ customer.owner_name || '-' }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ formatTime(customer.create_time) }}</el-descriptions-item>
      <el-descriptions-item label="最后跟进">{{ customer.last_follow_time ? formatTime(customer.last_follow_time) : '从未跟进' }}</el-descriptions-item>
      <el-descriptions-item label="地址" :span="2">{{ customer.address || '-' }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ customer.remark || '-' }}</el-descriptions-item>
    </el-descriptions>
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { formatTime } from '@/composables/useFormat'

const props = defineProps({
  customer: { type: Object, required: true }
})

const emit = defineEmits(['update'])

const isEditing = ref(false)
const editForm = ref({})

const startEdit = () => {
  editForm.value = { ...props.customer }
  isEditing.value = true
}

const cancelEdit = () => {
  isEditing.value = false
}

const saveEdit = () => {
  emit('update', editForm.value)
  isEditing.value = false
}

const getLevelTag = (level) => {
  const map = { 'A': 'danger', 'B': 'warning', 'C': '', 'D': 'info' }
  return map[level] || 'info'
}

const getStatusTag = (status) => {
  const map = { 1: 'primary', 2: 'success', 3: 'danger', 0: 'info' }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = { 1: '潜客', 2: '成交', 3: '流失', 0: '已删除' }
  return map[status] || '-'
}

const getLifecycleText = (status) => {
  const map = { 'new': '新导入', 'nurturing': '培育中', 'intent': '意向合作', 'active': '正在合作', 'lost': '流失', 'inactive': '无效' }
  return map[status] || '-'
}
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}
</style>

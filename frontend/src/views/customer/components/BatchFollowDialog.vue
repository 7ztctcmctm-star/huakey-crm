<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="批量跟进"
    width="480px"
    @closed="resetForm"
  >
    <div style="margin-bottom: 16px; color: var(--color-text-secondary); font-size: 13px">
      将对选中的 <strong style="color: var(--color-accent)">{{ selectedRows.length }}</strong> 个客户记录相同的跟进内容
    </div>
    <el-form ref="formRef" :model="formData" :rules="formRules" label-width="90px">
      <el-form-item label="跟进方式">
        <el-select v-model="formData.follow_type" style="width:100%">
          <el-option label="电话" value="电话" />
          <el-option label="微信" value="微信" />
          <el-option label="拜访" value="拜访" />
          <el-option label="邮件" value="邮件" />
          <el-option label="其他" value="其他" />
        </el-select>
      </el-form-item>
      <el-form-item label="跟进内容" prop="content">
        <el-input v-model="formData.content" type="textarea" :rows="3" placeholder="请输入跟进内容（将应用于所有选中客户）" />
      </el-form-item>
      <el-form-item label="下次跟进">
        <el-date-picker v-model="formData.next_time" type="datetime" placeholder="选择时间" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">提交</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { post } from '@/utils/request'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  selectedRows: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'success'])

const formRef = ref(null)
const loading = ref(false)
const formData = ref({
  follow_type: '电话',
  content: '',
  next_time: null
})

const formRules = {
  content: [{ required: true, message: '请输入跟进内容', trigger: 'blur' }]
}

const resetForm = () => {
  formData.value = { follow_type: '电话', content: '', next_time: null }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const items = props.selectedRows.map(row => ({
      customer_id: row.id,
      follow_type: formData.value.follow_type,
      content: formData.value.content,
      next_time: formData.value.next_time || null
    }))
    const res = await post('/follow-up/batch-add', { items })
    if (res.code === 200) {
      ElMessage.success(res.message)
      emit('update:modelValue', false)
      emit('success')
    }
  } catch (e) {
    ElMessage.error('批量跟进失败')
  } finally {
    loading.value = false
  }
}

defineExpose({ formRef })
</script>

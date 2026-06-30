<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="'快速跟进 - ' + (customer?.company_name || '')"
    width="480px"
    @closed="resetForm"
  >
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
        <el-input v-model="formData.content" type="textarea" :rows="3" placeholder="请输入跟进内容" />
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
  customer: { type: Object, default: null }
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
    const res = await post('/follow-up/add', {
      customer_id: props.customer.id,
      follow_type: formData.value.follow_type,
      content: formData.value.content,
      next_time: formData.value.next_time || null
    })
    if (res.code === 200) {
      ElMessage.success('跟进记录已保存')
      emit('update:modelValue', false)
      emit('success')
    }
  } catch (e) {
    ElMessage.error('提交失败')
  } finally {
    loading.value = false
  }
}

defineExpose({ formRef })
</script>

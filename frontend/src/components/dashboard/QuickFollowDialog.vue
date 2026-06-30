<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="快速跟进"
    width="500px"
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="formData" :rules="formRules" label-width="90px">
      <el-form-item label="客户" prop="customer_id">
        <el-select
          v-model="formData.customer_id"
          filterable
          placeholder="选择我的客户（可输入筛选）"
          :loading="customerLoading"
          style="width: 100%"
        >
          <el-option
            v-for="item in customerOptions"
            :key="item.id"
            :label="item.company_name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="跟进方式" prop="follow_type">
        <el-select v-model="formData.follow_type" style="width: 100%">
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
        <el-date-picker
          v-model="formData.next_time"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
          placeholder="选择日期时间"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleSubmit">提交</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getCustomerList } from '@/api/customer'
import { addFollowUp } from '@/api/customer'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'success'])

const formRef = ref(null)
const customerLoading = ref(false)
const submitLoading = ref(false)
const customerOptions = ref([])

const defaultForm = { customer_id: null, follow_type: '电话', content: '', next_time: '' }
const formData = ref({ ...defaultForm })

const formRules = {
  customer_id: [{ required: true, message: '请选择客户', trigger: 'change' }],
  content: [{ required: true, message: '请填写跟进内容', trigger: 'blur' }]
}

const loadMyCustomers = async () => {
  customerLoading.value = true
  try {
    const stored = localStorage.getItem('userInfo')
    const userId = stored ? JSON.parse(stored).id : null
    const res = await getCustomerList({ page: 1, pageSize: 50, owner_id: userId || undefined })
    if (res.code === 200) customerOptions.value = res.data.list || []
  } catch { /* ignore */ }
  finally { customerLoading.value = false }
}

const resetForm = () => {
  formData.value = { ...defaultForm }
  formRef.value?.resetFields()
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitLoading.value = true
  try {
    const body = {
      customer_id: formData.value.customer_id,
      follow_type: formData.value.follow_type,
      content: formData.value.content,
      next_time: formData.value.next_time || undefined
    }
    await addFollowUp(body)
    ElMessage.success('跟进记录已保存')
    emit('update:modelValue', false)
    emit('success')
  } catch { /* error handled by interceptor */ }
  finally { submitLoading.value = false }
}

watch(() => props.modelValue, (visible) => {
  if (visible) loadMyCustomers()
})
</script>

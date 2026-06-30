<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="批量跟进"
    width="680px"
    @closed="resetForm"
  >
    <div v-for="(row, index) in rows" :key="index" class="batch-row">
      <el-select
        v-model="row.customer_id"
        filterable remote reserve-keyword
        placeholder="搜索客户"
        :remote-method="searchCustomer"
        :loading="customerSearchLoading"
        style="width: 200px"
      >
        <el-option v-for="c in customerOptions" :key="c.id" :label="c.company_name" :value="c.id" />
      </el-select>
      <el-select v-model="row.follow_type" style="width: 90px">
        <el-option label="电话" value="电话" />
        <el-option label="微信" value="微信" />
        <el-option label="拜访" value="拜访" />
        <el-option label="邮件" value="邮件" />
        <el-option label="其他" value="其他" />
      </el-select>
      <el-input v-model="row.content" placeholder="跟进内容" style="flex: 1" />
      <el-button type="danger" link :icon="Delete" @click="removeRow(index)" v-if="rows.length > 1" />
    </div>
    <el-button type="primary" link @click="addRow" style="margin-top: 8px;">+ 添加一行</el-button>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleSubmit">批量提交</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { getCustomerList } from '@/api/customer'
import { batchAddFollowUp } from '@/api/customer'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'success'])

const defaultRow = { customer_id: null, follow_type: '电话', content: '' }

const rows = ref([{ ...defaultRow }])
const customerOptions = ref([])
const customerSearchLoading = ref(false)
const submitLoading = ref(false)

const searchCustomer = async (query) => {
  if (!query || query.length < 1) { customerOptions.value = []; return }
  customerSearchLoading.value = true
  try {
    const res = await getCustomerList({ page: 1, pageSize: 10, company_name: query })
    if (res.code === 200) customerOptions.value = res.data.list || []
  } catch { /* ignore */ }
  finally { customerSearchLoading.value = false }
}

const addRow = () => {
  if (rows.value.length >= 10) return ElMessage.warning('单次最多10条')
  rows.value.push({ ...defaultRow })
}

const removeRow = (index) => {
  if (rows.value.length <= 1) return
  rows.value.splice(index, 1)
}

const resetForm = () => {
  rows.value = [{ ...defaultRow }]
}

const handleSubmit = async () => {
  const items = rows.value.filter(r => r.customer_id && r.content)
  if (items.length === 0) return ElMessage.warning('请至少填写一条完整的跟进记录')
  submitLoading.value = true
  try {
    const res = await batchAddFollowUp(items)
    if (res.code === 200) {
      ElMessage.success(res.message)
      emit('update:modelValue', false)
      emit('success')
    }
  } catch { /* error handled by interceptor */ }
  finally { submitLoading.value = false }
}

watch(() => props.modelValue, (visible) => {
  if (visible) resetForm()
})
</script>

<style scoped>
.batch-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
</style>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="assignUserId === '' ? '回收客户到待分配池' : '分配客户负责人'"
    width="420px"
  >
    <div v-if="assignCustomer" style="margin-bottom:16px">
      <p><strong>客户：</strong>{{ assignCustomer.company_name }}</p>
      <p><strong>当前负责人：</strong>{{ assignCustomer.owner_name || '待分配（无负责人）' }}</p>
    </div>
    <el-form label-width="80px">
      <el-form-item label="新负责人">
        <el-select v-model="assignUserId" placeholder="请选择" clearable style="width:100%">
          <el-option value="" label="无负责人（回收待分配）" />
          <el-option v-for="u in salesUsers" :key="u.id" :label="u.real_name + ' (' + u.username + ')'" :value="u.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button :type="assignUserId === '' ? 'warning' : 'primary'" :loading="loading" @click="confirmAssign">
        {{ assignUserId === '' ? '确认回收' : '确认分配' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { assignCustomer as assignCustomerApi } from '@/api/customer'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  assignCustomer: { type: Object, default: null },
  salesUsers: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'success'])

const assignUserId = ref('')
const loading = ref(false)

watch(() => props.assignCustomer, (customer) => {
  assignUserId.value = customer ? (customer.owner_id || '') : ''
}, { immediate: true })

const confirmAssign = async () => {
  const isRecycle = assignUserId.value === ''
  loading.value = true
  try {
    const res = await assignCustomerApi({
      customer_id: props.assignCustomer.id,
      to_user_id: assignUserId.value || null,
      remark: isRecycle ? '回收为待分配' : '手动分配'
    })
    if (res.code === 200) {
      ElMessage.success(res.message)
      emit('update:modelValue', false)
      emit('success')
    }
  } catch (e) {
    ElMessage.error(isRecycle ? '回收失败' : '分配失败')
  } finally {
    loading.value = false
  }
}
</script>

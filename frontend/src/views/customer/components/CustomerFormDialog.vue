<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="dialogTitle"
    width="600px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="100px"
    >
      <el-row :gutter="24">
        <el-col :span="24">
          <el-form-item label="公司名称" prop="company_name">
            <el-input v-model="formData.company_name" placeholder="请输入公司名称" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="联系人" prop="contact_name">
            <el-input v-model="formData.contact_name" placeholder="请输入联系人" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="电话" prop="phone">
            <el-input v-model="formData.phone" placeholder="请输入电话" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="formData.email" placeholder="请输入邮箱" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="所属行业" prop="industry">
            <el-input v-model="formData.industry" placeholder="请输入行业" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="客户来源" prop="source">
            <el-select v-model="formData.source" placeholder="请选择来源" filterable style="width: 100%">
              <el-option v-for="s in flatSourceOptions" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="客户等级" prop="level">
            <el-select v-model="formData.level" placeholder="请选择等级" style="width: 100%">
              <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row v-if="isEdit" :gutter="24">
        <el-col :span="12">
          <el-form-item label="客户状态" prop="status">
            <el-select v-model="formData.status" placeholder="请选择状态" style="width: 100%">
              <el-option v-for="item in editStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="24">
        <el-col :span="24">
          <el-form-item label="地址" prop="address">
            <el-input v-model="formData.address" placeholder="请输入地址" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="24">
        <el-col :span="24">
          <el-form-item label="备注" prop="remark">
            <el-input v-model="formData.remark" type="textarea" :rows="3" placeholder="请输入备注" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ALL_SOURCE_VALUES } from '@/constants/source'
import { addCustomer, updateCustomer } from '@/api/customer'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  customer: { type: Object, default: null },
  levelOptions: { type: Array, default: () => [] },
  editStatusOptions: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'success', 'closed'])

const formRef = ref(null)
const submitLoading = ref(false)
const isEdit = computed(() => !!props.customer)
const dialogTitle = computed(() => isEdit.value ? '编辑客户' : '新增客户')

const flatSourceOptions = computed(() => ALL_SOURCE_VALUES.map(v => ({ label: v, value: v })))

const defaultForm = {
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  industry: '',
  source: '',
  level: 'C',
  status: 1,
  address: '',
  remark: ''
}

const formData = ref({ ...defaultForm })

const formRules = {
  company_name: [
    { required: true, message: '请输入公司名称', trigger: 'blur' }
  ]
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    if (props.customer) {
      formData.value = {
        company_name: props.customer.company_name || '',
        contact_name: props.customer.contact_name || '',
        phone: props.customer.phone || '',
        email: props.customer.email || '',
        industry: props.customer.industry || '',
        source: props.customer.source || '',
        level: props.customer.level || 'C',
        status: props.customer.status || 1,
        address: props.customer.address || '',
        remark: props.customer.remark || ''
      }
    } else {
      formData.value = { ...defaultForm }
    }
  }
})

const handleSubmit = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const data = {
      company_name: formData.value.company_name,
      contact_name: formData.value.contact_name,
      phone: formData.value.phone,
      email: formData.value.email,
      industry: formData.value.industry,
      source: formData.value.source,
      level: formData.value.level,
      address: formData.value.address,
      remark: formData.value.remark
    }

    let res
    if (isEdit.value) {
      data.id = props.customer.id
      data.status = formData.value.status
      res = await updateCustomer(data)
    } else {
      res = await addCustomer(data)
    }

    if (res.code === 200) {
      ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
      emit('update:modelValue', false)
      emit('success')
    }
  } catch (error) {
    console.error('提交失败:', error)
  } finally {
    submitLoading.value = false
  }
}

const handleClosed = () => {
  formData.value = { ...defaultForm }
  emit('closed')
}

defineExpose({ formRef })
</script>

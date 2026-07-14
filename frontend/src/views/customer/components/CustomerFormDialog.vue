<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="dialogTitle"
    width="680px"
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

      <!-- 新增模式：联系人子表单 -->
      <template v-if="!isEdit">
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="联系人" prop="contacts">
              <div class="contact-list">
                <div
                  v-for="(contact, index) in formData.contacts"
                  :key="index"
                  class="contact-item"
                >
                  <el-row :gutter="12">
                    <el-col :span="7">
                      <el-input v-model="contact.name" placeholder="姓名 *" />
                    </el-col>
                    <el-col :span="7">
                      <el-input v-model="contact.position" placeholder="职位" />
                    </el-col>
                    <el-col :span="7">
                      <el-input v-model="contact.phone" placeholder="电话" />
                    </el-col>
                    <el-col :span="3" class="contact-actions">
                      <el-button
                        v-if="formData.contacts.length > 1"
                        type="danger"
                        link
                        :icon="Delete"
                        @click="removeContact(index)"
                      />
                    </el-col>
                  </el-row>
                  <el-row :gutter="12" style="margin-top: 8px">
                    <el-col :span="7">
                      <el-input v-model="contact.email" placeholder="邮箱" />
                    </el-col>
                    <el-col :span="7">
                      <el-input v-model="contact.wechat" placeholder="微信" />
                    </el-col>
                    <el-col :span="10">
                      <el-checkbox v-model="contact.is_decision">决策人</el-checkbox>
                      <el-tag v-if="index === 0" type="primary" size="small" effect="plain" style="margin-left: 8px">主联系人</el-tag>
                    </el-col>
                  </el-row>
                </div>
                <el-button type="primary" link :icon="Plus" @click="addContact">添加联系人</el-button>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </template>

      <!-- 编辑模式：提示去联系人标签页 -->
      <template v-else>
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="联系人">
              <el-alert
                title="联系人信息已迁移至「联系人」标签页，请前往客户详情页管理"
                type="info"
                :closable="false"
                show-icon
              />
            </el-form-item>
          </el-col>
        </el-row>
      </template>

      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="所属行业" prop="industry">
            <el-input v-model="formData.industry" placeholder="请输入行业" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="客户来源" prop="source">
            <el-select v-model="formData.source" placeholder="请选择来源" filterable style="width: 100%">
              <el-option v-for="s in flatSourceOptions" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="客户等级" prop="level">
            <el-select v-model="formData.level" placeholder="请选择等级" style="width: 100%">
              <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col v-if="isEdit" :span="12">
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
import { Plus, Delete } from '@element-plus/icons-vue'
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

const createEmptyContact = () => ({
  name: '',
  position: '',
  phone: '',
  email: '',
  wechat: '',
  is_decision: false
})

const defaultForm = {
  company_name: '',
  contacts: [createEmptyContact()],
  industry: '',
  source: '',
  level: 'C',
  status: 'following',
  address: '',
  remark: ''
}

const formData = ref({ ...defaultForm })

const validateContacts = (rule, value, callback) => {
  if (!Array.isArray(value) || value.length === 0) {
    callback(new Error('请至少添加一个联系人'))
    return
  }
  const valid = value.some(c => c && String(c.name).trim() !== '')
  if (!valid) {
    callback(new Error('请至少填写一个联系人的姓名'))
    return
  }
  callback()
}

const formRules = {
  company_name: [
    { required: true, message: '请输入公司名称', trigger: 'blur' }
  ],
  contacts: [
    { required: true, validator: validateContacts, trigger: 'change' }
  ]
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    if (props.customer) {
      formData.value = {
        company_name: props.customer.company_name || '',
        contacts: [createEmptyContact()],
        industry: props.customer.industry || '',
        source: props.customer.source || '',
        level: props.customer.level || 'C',
        status: props.customer.status || 'following',
        address: props.customer.address || '',
        remark: props.customer.remark || ''
      }
    } else {
      formData.value = { ...defaultForm }
    }
  }
})

const addContact = () => {
  formData.value.contacts.push(createEmptyContact())
}

const removeContact = (index) => {
  formData.value.contacts.splice(index, 1)
}

const handleSubmit = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    let res
    if (isEdit.value) {
      const data = {
        id: props.customer.id,
        company_name: formData.value.company_name,
        industry: formData.value.industry,
        source: formData.value.source,
        level: formData.value.level,
        status: formData.value.status,
        address: formData.value.address,
        remark: formData.value.remark
      }
      res = await updateCustomer(data)
    } else {
      const contacts = formData.value.contacts
        .filter(c => String(c.name).trim() !== '')
        .map((c) => ({
          name: c.name,
          position: c.position,
          phone: c.phone,
          email: c.email,
          wechat: c.wechat,
          is_decision: !!c.is_decision
        }))
      const data = {
        company_name: formData.value.company_name,
        contacts,
        industry: formData.value.industry,
        source: formData.value.source,
        level: formData.value.level,
        address: formData.value.address,
        remark: formData.value.remark
      }
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

<style scoped>
.contact-list {
  width: 100%;
}
.contact-item {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.contact-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>{{ isEdit ? '编辑采购申请' : '新建采购申请' }}</h2>
    </div>

    <el-card shadow="never" style="max-width: 720px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="申请标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入申请标题" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="申请部门" prop="dept_id">
          <el-select v-model="form.dept_id" placeholder="请选择部门" clearable style="width: 100%">
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="预计金额" prop="expected_amount">
          <el-input-number v-model="form.expected_amount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="申请理由" prop="reason">
          <el-input v-model="form.reason" type="textarea" :rows="5" placeholder="请输入申请理由" maxlength="2000" show-word-limit />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submitForm" :loading="submitting">保存</el-button>
          <el-button @click="handleCancel">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createPurchaseRequest } from '@/api/purchaseRequest'
import { getDeptList } from '@/api/system'

const props = defineProps({
  isEdit: { type: Boolean, default: false },
  requestData: { type: Object, default: null }
})

const router = useRouter()
const route = useRoute()
const formRef = ref(null)
const submitting = ref(false)
const deptOptions = ref([])

const form = reactive({
  title: '',
  dept_id: null,
  expected_amount: 0,
  reason: ''
})

const rules = {
  title: [{ required: true, message: '请输入申请标题', trigger: 'blur' }],
  expected_amount: [{ required: true, message: '请输入预计金额', trigger: 'blur' }]
}

const requestId = computed(() => route.params.id || props.requestData?.id)

const fetchDepts = async () => {
  try {
    const res = await getDeptList()
    if (res.code === 200) {
      deptOptions.value = res.data || []
    }
  } catch (error) {
    console.error('获取部门失败:', error)
  }
}

const submitForm = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const res = await createPurchaseRequest(form)
    if (res.code === 201 || res.code === 200) {
      ElMessage.success('创建成功')
      router.push('/purchase/requests')
    }
  } catch (error) {
    console.error('创建采购申请失败:', error)
    ElMessage.error(error?.response?.data?.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  router.back()
}

onMounted(() => {
  fetchDepts()
  if (props.isEdit && props.requestData) {
    Object.assign(form, props.requestData)
  }
})
</script>

<template>
  <div class="page-container">
    <div class="page-header"><h2>标签管理</h2></div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增标签</el-button>
      </div>
      <StateWrapper
        :loading="loading"
        :error="errorMsg"
        :empty="!loading && tableData.length === 0"
        empty-text="暂无标签"
        empty-description="新增标签后即可在此管理"
        @retry="fetchList"
      >
        <template #loading>
          <TableSkeleton :rows="8" :cols="5" />
        </template>
        <template #empty-action>
          <el-button type="primary" size="small" @click="handleAdd">新增标签</el-button>
        </template>

        <el-table
        :data="tableData"
        stripe
        border>
        <el-table-column prop="name" label="标签名称" min-width="180">
          <template #default="{ row }">
            <el-tag :color="row.color" style="color:var(--color-text-on-accent);border:none;">{{ row.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="color" label="颜色" width="120" align="center">
          <template #default="{ row }">
            <span :style="{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '4px', backgroundColor: row.color, verticalAlign: 'middle' }"></span>
            <span style="margin-left:8px;font-size:12px;color:var(--color-text-secondary);">{{ row.color }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      </StateWrapper>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑标签' : '新增标签'" width="450px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="标签名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入标签名称" maxlength="30" />
        </el-form-item>
        <el-form-item label="标签颜色">
          <el-color-picker v-model="form.color" :predefine="presetColors" />
          <span style="margin-left:12px;font-size:13px;color:var(--color-text-secondary);">{{ form.color }}</span>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import StateWrapper from '@/components/common/StateWrapper.vue'
import { reportError } from '@/utils/error'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { getTagList, manageTag } from '@/api/system'
import { chartColors, presetColors as getPresetColors } from '@/utils/chartTheme'

const presetColors = getPresetColors()

// onMounted 无条件取数，loading 初值 true 消除首帧「暂无标签」闪现
const loading = ref(true)
const errorMsg = ref('')
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const editId = ref(null)
const submitLoading = ref(false)
const form = reactive({ name: '', color: chartColors.primary, sort: 0 })
const rules = { name: [{ required: true, message: '请输入标签名称', trigger: 'blur' }] }

const fetchList = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await getTagList()
    if (res.code === 200) {
      tableData.value = res.data
    } else {
      errorMsg.value = res.message || '加载标签列表失败，请稍后重试'
      reportError('获取标签列表失败:', res.message)
    }
  } catch (error) {
    errorMsg.value = error?.response?.data?.message || '加载标签列表失败，请稍后重试'
    reportError('获取标签列表失败:', error)
  } finally { loading.value = false }
}

const handleAdd = () => {
  isEdit.value = false
  editId.value = null
  Object.assign(form, { name: '', color: chartColors.primary, sort: 0 })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, { name: row.name, color: row.color || chartColors.primary, sort: row.sort || 0 })
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除标签 "${row.name}" 吗？删除后客户身上的该标签也会被移除。`, '提示', { type: 'warning' }).then(async () => {
    const res = await manageTag({ action: 'delete', id: row.id })
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      if (isEdit.value) {
        const res = await manageTag({ action: 'update', id: editId.value, name: form.name, color: form.color })
        if (res.code === 200) { ElMessage.success('修改成功'); dialogVisible.value = false; fetchList() }
      } else {
        const res = await manageTag({ action: 'add', name: form.name, color: form.color })
        if (res.code === 200) { ElMessage.success('新增成功'); dialogVisible.value = false; fetchList() }
      }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.toolbar { margin-bottom: var(--space-4); }
</style>

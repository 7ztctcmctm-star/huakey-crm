<template>
  <div class="page-container">
    <div class="page-header"><h2>部门管理</h2></div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增部门</el-button>
      </div>
      <StateWrapper
        :loading="loading"
        :error="errorMsg"
        :empty="!loading && tableData.length === 0"
        empty-text="暂无部门"
        @retry="fetchList"
      >
        <template #loading>
          <TableSkeleton :rows="6" :cols="4" />
        </template>
        <template #empty-action>
          <el-button type="primary" size="small" @click="handleAdd">新增部门</el-button>
        </template>
      <el-table
        :data="tableData"
        row-key="id"
        stripe
        border
        default-expand-all
        :tree-props="{ children: 'children' }">
        <el-table-column prop="name" label="部门名称" min-width="180" />
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

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑部门' : '新增部门'" width="450px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入部门名称" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="form.parent_id" placeholder="顶级部门" clearable style="width:100%">
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
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
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getDeptList, deleteDept, saveDept } from '@/api/system'
import { reportError } from '@/utils/error'

// onMounted 无条件取数，初值 true 消除首帧空态闪现
const loading = ref(true)
const errorMsg = ref('')
const tableData = ref([])
const deptOptions = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const editId = ref(null); const submitLoading = ref(false)
const form = reactive({ name: '', parent_id: null, sort: 0 })
const rules = { name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }] }

function buildTree(list) {
  const map = {}
  const roots = []
  list.forEach(item => { map[item.id] = { ...item, children: [] } })
  list.forEach(item => {
    const pid = item.parent_id || 0
    if (map[pid] && pid !== item.id) {
      map[pid].children.push(map[item.id])
    } else {
      roots.push(map[item.id])
    }
  })
  return roots
}

const fetchList = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await getDeptList({})
    if (res.code === 200) {
      tableData.value = buildTree(res.data.list)
      deptOptions.value = res.data.list
    } else {
      // 业务码非 200：原先会静默停在空表，用户无法区分「无数据」与「加载失败」
      errorMsg.value = res.message || '加载部门列表失败，请稍后重试'
      reportError('获取部门列表失败:', res.message)
    }
  } catch (error) {
    errorMsg.value = error?.response?.data?.message || '加载部门列表失败，请稍后重试'
    reportError('获取部门列表失败:', error)
  } finally { loading.value = false }
}

const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { name: '', parent_id: null, sort: 0 }); dialogVisible.value = true }
const handleEdit = (row) => { isEdit.value = true; editId.value = row.id; Object.assign(form, { name: row.name, parent_id: row.parent_id || null, sort: row.sort || 0 }); dialogVisible.value = true }

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除部门 "${row.name}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteDept(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    const data = isEdit.value ? { id: editId.value, name: form.name, parent_id: form.parent_id, sort: form.sort } : { name: form.name, parent_id: form.parent_id, sort: form.sort }
    const res = await saveDept(data, isEdit.value)
    if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList() }
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

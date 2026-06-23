<template>
  <div class="page-container">
    <div class="page-header"><h2>部门管理</h2></div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增部门</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" row-key="id" stripe border default-expand-all :tree-props="{ children: 'children' }">
        <el-table-column prop="name" label="部门名称" min-width="180" />
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
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
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getDeptList, deleteDept, saveDept } from '@/api/system'

const loading = ref(false)
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
  try {
    const res = await getDeptList({})
    if (res.code === 200) {
      tableData.value = buildTree(res.data.list)
      deptOptions.value = res.data.list
    }
  } catch (e) { /* */ }
  finally { loading.value = false }
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

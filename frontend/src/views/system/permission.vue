<template>
  <div class="page-container">
    <div class="page-header">
      <h2>权限管理</h2>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd(0)">新增权限</el-button>
      </div>

      <el-table v-loading="loading" :data="treeData" row-key="id" stripe border default-expand-all :tree-props="{ children: 'children' }">
        <el-table-column prop="name" label="权限名称" width="200" />
        <el-table-column prop="code" label="权限编码" width="220" />
        <el-table-column prop="type" label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.type)" size="small">{{ typeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路径" min-width="160" show-overflow-tooltip />
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button v-if="row.type !== 'button'" type="success" link @click="handleAdd(row.id)">新增子权限</el-button>
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑权限' : '新增权限'" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="权限名称" prop="name">
          <el-input v-model="form.name" placeholder="如：新增客户" />
        </el-form-item>
        <el-form-item label="权限编码" prop="code">
          <el-input v-model="form.code" placeholder="如：customer:add" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="菜单" value="menu" />
            <el-option label="按钮" value="button" />
            <el-option label="接口" value="api" />
          </el-select>
        </el-form-item>
        <el-form-item label="父权限">
          <el-select v-model="form.parent_id" clearable style="width: 100%">
            <el-option label="无（顶级）" :value="0" />
            <el-option v-for="p in flatPermissions" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="路径">
          <el-input v-model="form.path" placeholder="菜单路径或API路径" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="Element Plus 图标名" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
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
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getPermissionList, deletePermissionNode, savePermission } from '@/api/system'

const loading = ref(false)
const treeData = ref([])
const flatPermissions = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const submitLoading = ref(false)
const editId = ref(null)

const form = reactive({ name: '', code: '', type: 'button', parent_id: 0, path: '', icon: '', sort: 0 })
const rules = {
  name: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入权限编码', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
}

const typeTag = (t) => ({ menu: '', button: 'success', api: 'warning' }[t] || 'info')
const typeText = (t) => ({ menu: '菜单', button: '按钮', api: '接口' }[t] || t)

function flattenTree(nodes) {
  const result = []
  for (const n of nodes) {
    result.push({ id: n.id, name: n.name })
    if (n.children && n.children.length) {
      result.push(...flattenTree(n.children))
    }
  }
  return result
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getPermissionList()
    if (res.code === 200) {
      treeData.value = res.data
      flatPermissions.value = flattenTree(res.data)
    }
  } finally {
    loading.value = false
  }
}

const handleAdd = (parentId) => {
  isEdit.value = false
  editId.value = null
  Object.assign(form, { name: '', code: '', type: 'button', parent_id: parentId || 0, path: '', icon: '', sort: 0 })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, { name: row.name, code: row.code, type: row.type, parent_id: row.parent_id || 0, path: row.path || '', icon: row.icon || '', sort: row.sort || 0 })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      const url = isEdit.value ? '/permission/update-node' : '/permission/add'
      const payload = isEdit.value ? { id: editId.value, ...form } : { ...form }
      const res = await savePermission(payload)
      if (res.code === 200) {
        ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
        dialogVisible.value = false
        fetchList()
      } else {
        ElMessage.error(res.message || '操作失败')
      }
    } finally {
      submitLoading.value = false
    }
  })
}

const handleDelete = (row) => {
  if (row.children && row.children.length > 0) {
    ElMessage.warning('存在子权限，请先删除子权限')
    return
  }
  ElMessageBox.confirm(`确定删除权限 "${row.name}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deletePermissionNode(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.toolbar { margin-bottom: var(--space-4); }
</style>

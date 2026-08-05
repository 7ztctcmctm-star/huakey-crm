<template>
  <div class="page-container">
    <div class="page-header"><h2>角色管理</h2></div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增角色</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="name" label="角色名称" width="140" />
        <el-table-column prop="code" label="角色编码" width="160" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="success" link :icon="Setting" @click="handlePermission(row)">权限配置</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑角色' : '新增角色'" width="450px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入角色编码" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="角色描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="permDialogVisible" :title="`权限配置 — ${permRoleName}`" width="500px">
      <div style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: #86868b; margin-bottom: 6px;">快速设置：</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <el-button size="small" @click="applyPreset('sales')">销售默认</el-button>
          <el-button size="small" @click="applyPreset('finance')">财务默认</el-button>
          <el-button size="small" @click="applyPreset('purchase')">采购默认</el-button>
          <el-button size="small" @click="applyPreset('service')">售后默认</el-button>
          <el-button size="small" @click="applyPreset('readonly')">只读权限</el-button>
        </div>
      </div>
      <el-tree
        ref="permTreeRef"
        :data="permTree"
        :props="{ label: 'name', children: 'children' }"
        show-checkbox
        node-key="id"
        :default-checked-keys="checkedPermIds"
        check-strictly
        style="max-height: 400px; overflow: auto;"
      />
      <template #footer>
        <el-button @click="permDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="permLoading" @click="handleSavePermission">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Setting } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getRoleList, deleteRole, getPermissionList, updateRolePermission, saveRole, getRolePermissions } from '@/api/system'

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const editId = ref(null); const submitLoading = ref(false)

const permDialogVisible = ref(false)
const permTreeRef = ref(null)
const permTree = ref([])
const checkedPermIds = ref([])
const permRoleId = ref(null)
const permRoleName = ref('')
const permLoading = ref(false)

const form = reactive({ name: '', code: '', description: '' })
const rules = { name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }], code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }] }

const fetchList = async () => {
  loading.value = true
  try { const res = await getRoleList({}); if (res.code === 200) tableData.value = res.data.list } catch (e) { /* */ }
  finally { loading.value = false }
}

const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { name: '', code: '', description: '' }); dialogVisible.value = true }
const handleEdit = (row) => { isEdit.value = true; editId.value = row.id; Object.assign(form, { name: row.name, code: row.code, description: row.description || '' }); dialogVisible.value = true }

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除角色 "${row.name}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteRole(row.id)
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    const data = isEdit.value ? { id: editId.value, ...form } : { ...form }
    if (!valid) return; submitLoading.value = true; try { const res = await saveRole(data, isEdit.value)
    if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList() }
    } finally { submitLoading.value = false }
  })
}

const handlePermission = async (row) => {
  permRoleId.value = row.id
  permRoleName.value = row.name
  permDialogVisible.value = true
  try {
    const [treeRes, roleRes] = await Promise.all([
      getPermissionList(),
      getRolePermissions(row.id)
    ])
    if (treeRes.code === 200) permTree.value = treeRes.data
    if (roleRes.code === 200) checkedPermIds.value = roleRes.data
  } catch {
    ElMessage.error('加载权限数据失败')
  }
}

const handleSavePermission = async () => {
  if (!permTreeRef.value) return
  const checkedKeys = permTreeRef.value.getCheckedKeys()
  permLoading.value = true
  try {
    const res = await updateRolePermission({ role_id: permRoleId.value, permission_ids: checkedKeys })
    if (res.code === 200) { ElMessage.success('权限配置成功'); permDialogVisible.value = false }
    else { ElMessage.error(res.message || '保存失败') }
  } catch {
    ElMessage.error('保存失败')
  } finally { permLoading.value = false }
}

// 权限预设包
const permissionPresets = {
  sales: ['dashboard', 'customer', 'customer:list', 'pool', 'pool:view', 'pool:claim', 'leads', 'followup:calendar', 'opportunity', 'quotation', 'knowledge', 'scoring'],
  finance: ['dashboard', 'contract', 'payment', 'invoice', 'report'],
  purchase: ['dashboard', 'supplier', 'purchase', 'inventory', 'product'],
  service: ['dashboard', 'service', 'customer:list', 'knowledge'],
  readonly: ['dashboard']
}

const applyPreset = (presetKey) => {
  if (!permTreeRef.value) return
  const presetCodes = permissionPresets[presetKey] || []
  // 遍历权限树，找到匹配的节点
  const matchIds = []
  const walkTree = (nodes) => {
    for (const node of nodes) {
      if (presetCodes.some(code => node.code === code || node.name?.includes(code))) {
        matchIds.push(node.id)
      }
      if (node.children?.length) walkTree(node.children)
    }
  }
  walkTree(permTree.value)
  // 取消所有，勾选匹配的
  permTreeRef.value.setCheckedKeys(matchIds)
}

onMounted(() => { fetchList() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.toolbar { margin-bottom: var(--space-4); }
</style>

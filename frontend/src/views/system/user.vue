<template>
  <div class="page-container">
    <div class="page-header"><h2>用户管理</h2></div>
    <el-card>
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增用户</el-button>
      </div>
      <el-table v-loading="loading" :data="tableData" stripe border>
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="real_name" label="真实姓名" width="120" />
        <el-table-column prop="dept_name" label="所属部门" width="120" />
        <el-table-column prop="role_name" label="角色" width="120" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑用户' : '新增用户'" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="用户名" prop="username" v-if="!isEdit">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password" v-if="!isEdit">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" />
        </el-form-item>
        <el-form-item label="真实姓名">
          <el-input v-model="form.real_name" placeholder="请输入姓名" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="部门">
              <el-select v-model="form.dept_id" placeholder="选择部门" style="width:100%">
                <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色">
              <el-select v-model="form.role_id" placeholder="选择角色" style="width:100%">
                <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
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
import { post } from '@/utils/request'

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const editId = ref(null)
const submitLoading = ref(false)
const depts = ref([])
const roles = ref([])

const form = reactive({ username: '', password: '', real_name: '', phone: '', email: '', dept_id: null, role_id: null })
const rules = { username: [{ required: true, message: '请输入用户名', trigger: 'blur' }], password: [{ required: true, message: '请输入密码', trigger: 'blur' }] }

const fetchList = async () => {
  loading.value = true
  try { const res = await post('/user/list', { page: 1, pageSize: 100 }); if (res.code === 200) tableData.value = res.data.list } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchDepts = async () => { try { const res = await post('/dept/list', {}); if (res.code === 200) depts.value = res.data.list } catch (e) { /* */ } }
const fetchRoles = async () => { try { const res = await post('/role/list', {}); if (res.code === 200) roles.value = res.data.list } catch (e) { /* */ } }

const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { username: '', password: '', real_name: '', phone: '', email: '', dept_id: null, role_id: null }); dialogVisible.value = true }

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, { real_name: row.real_name || '', phone: row.phone || '', email: row.email || '', dept_id: row.dept_id, role_id: row.role_id })
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除用户 "${row.username}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await post('/user/delete', { id: row.id })
    if (res.code === 200) { ElMessage.success('已删除'); fetchList() }
  }).catch(() => {})
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitLoading.value = true
    try {
      const data = isEdit.value ? { id: editId.value, real_name: form.real_name, phone: form.phone, email: form.email, dept_id: form.dept_id, role_id: form.role_id } : { ...form }
      const url = isEdit.value ? '/user/update' : '/user/add'
      const res = await post(url, data)
      if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList() }
    } finally { submitLoading.value = false }
  })
}

onMounted(() => { fetchList(); fetchDepts(); fetchRoles() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); letter-spacing: -0.02em; }
.toolbar { margin-bottom: var(--space-4); }
</style>

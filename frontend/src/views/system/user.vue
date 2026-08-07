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
        <el-table-column label="操作" width="230">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">编辑</el-button>
            <el-button type="warning" link :icon="Key" @click="handleReset(row)">重置密码</el-button>
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

    <!-- [v1.0.1 安全补丁] 重置密码对话框 -->
    <el-dialog v-model="resetVisible" title="重置密码" width="460px">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px">
        重置后用户「{{ resetTarget.username }}」下次登录需立即修改密码
      </el-alert>
      <el-form ref="resetFormRef" :model="resetForm" :rules="resetRules" label-width="100px">
        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="resetForm.new_password" type="password" show-password placeholder="至少8位，含大小写字母和数字" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm_password">
          <el-input v-model="resetForm.confirm_password" type="password" show-password placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetLoading" @click="handleResetSubmit">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Key } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { getUserList, deleteUser, getDeptList, getRoleList, saveUser, resetUserPassword } from '@/api/system'

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
const passwordValidator = (rule, value, callback) => {
  if (!value) return callback(new Error('请输入密码'))
  if (value.length < 8) return callback(new Error('密码至少8位'))
  if (!/[a-z]/.test(value)) return callback(new Error('需包含小写字母'))
  if (!/[A-Z]/.test(value)) return callback(new Error('需包含大写字母'))
  if (!/\d/.test(value)) return callback(new Error('需包含数字'))
  callback()
}
const rules = { username: [{ required: true, message: '请输入用户名', trigger: 'blur' }], password: [{ required: true, validator: passwordValidator, trigger: 'blur' }] }

// [v1.0.1 安全补丁] 重置密码相关状态
const resetVisible = ref(false)
const resetLoading = ref(false)
const resetFormRef = ref(null)
const resetTarget = ref({ id: null, username: '' })
const resetForm = reactive({ new_password: '', confirm_password: '' })
const resetRules = {
  new_password: [{ required: true, validator: passwordValidator, trigger: 'blur' }],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== resetForm.new_password) return callback(new Error('两次输入的密码不一致'))
        callback()
      },
      trigger: 'blur'
    }
  ]
}

const fetchList = async () => {
  loading.value = true
  try { const res = await getUserList({ page: 1, pageSize: 100 }); if (res.code === 200) tableData.value = res.data.list } catch (e) { /* */ }
  finally { loading.value = false }
}

const fetchDepts = async () => { try { const res = await getDeptList({}); if (res.code === 200) depts.value = res.data.list } catch (e) { /* */ } }
const fetchRoles = async () => { try { const res = await getRoleList({}); if (res.code === 200) roles.value = res.data.list } catch (e) { /* */ } }

const handleAdd = () => { isEdit.value = false; editId.value = null; Object.assign(form, { username: '', password: '', real_name: '', phone: '', email: '', dept_id: null, role_id: null }); dialogVisible.value = true }

const handleEdit = (row) => {
  isEdit.value = true; editId.value = row.id
  Object.assign(form, { real_name: row.real_name || '', phone: row.phone || '', email: row.email || '', dept_id: row.dept_id, role_id: row.role_id })
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定删除用户 "${row.username}" 吗？`, '提示', { type: 'warning' }).then(async () => {
    const res = await deleteUser(row.id)
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
      const res = await saveUser(data, isEdit.value ? editId.value : null)
      if (res.code === 200) { ElMessage.success(isEdit.value ? '修改成功' : '新增成功'); dialogVisible.value = false; fetchList() }
    } finally { submitLoading.value = false }
  })
}

// [v1.0.1 安全补丁] 重置密码
const handleReset = (row) => {
  resetTarget.value = { id: row.id, username: row.username }
  resetForm.new_password = ''
  resetForm.confirm_password = ''
  resetVisible.value = true
}

const handleResetSubmit = async () => {
  if (!resetFormRef.value) return
  await resetFormRef.value.validate(async (valid) => {
    if (!valid) return
    resetLoading.value = true
    try {
      const res = await resetUserPassword({ id: resetTarget.value.id, new_password: resetForm.new_password })
      if (res.code === 200) { ElMessage.success(res.message || '重置成功'); resetVisible.value = false }
    } finally { resetLoading.value = false }
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

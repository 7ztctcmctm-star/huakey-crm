<template>
  <div class="page-container">
    <el-card class="table-card">
      <template #header>
        <div class="card-header">
          <span>货币管理</span>
          <div class="header-actions">
            <el-button @click="fetchList" :icon="Refresh" circle />
          </div>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" stripe border :header-cell-style="{ background: '#fafafa' }">
        <el-table-column prop="code" label="货币代码" width="100" />
        <el-table-column prop="name" label="货币名称" width="120" />
        <el-table-column prop="symbol" label="符号" width="80" align="center">
          <template #default="{ row }">
            <span style="font-size: 18px;">{{ row.symbol }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="exchange_rate" label="对人民币汇率" width="140" align="right">
          <template #default="{ row }">
            {{ parseFloat(row.exchange_rate).toFixed(4) }}
          </template>
        </el-table-column>
        <el-table-column label="默认" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEdit(row)">编辑汇率</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑汇率弹窗 -->
    <el-dialog v-model="dialogVisible" title="编辑汇率" width="420px" destroy-on-close>
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="货币">
          <span>{{ editForm.code }} - {{ editForm.name }} {{ editForm.symbol }}</span>
        </el-form-item>
        <el-form-item label="对人民币汇率">
          <el-input-number v-model="editForm.exchange_rate" :min="0.0001" :max="99999" :step="0.01" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="editForm.is_default" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { getCurrencyList, updateCurrency } from '@/api/system'

const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const editForm = ref({})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getCurrencyList()
    if (res.code === 200) list.value = res.data
  } finally {
    loading.value = false
  }
}

const handleEdit = (row) => {
  editForm.value = { ...row }
  dialogVisible.value = true
}

const handleSave = async () => {
  saving.value = true
  try {
    const res = await updateCurrency(editForm.value.id, {
      exchange_rate: editForm.value.exchange_rate,
      is_default: editForm.value.is_default
    })
    if (res.code === 200) {
      ElMessage.success('更新成功')
      dialogVisible.value = false
      fetchList()
    }
  } finally {
    saving.value = false
  }
}

onMounted(fetchList)
</script>

<style scoped>
.page-container { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>

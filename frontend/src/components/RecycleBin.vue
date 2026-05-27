<template>
  <el-drawer v-model="visible" title="回收站" size="700px">
    <div class="recycle-bin">
      <!-- 模块选择 -->
      <div class="module-tabs">
        <el-radio-group v-model="currentModule" @change="handleModuleChange">
          <el-radio-button v-for="item in moduleStats" :key="item.module" :value="item.module">
            {{ item.label }} ({{ item.count }})
          </el-radio-button>
        </el-radio-group>
      </div>

      <!-- 搜索 -->
      <div class="search-bar" v-if="currentModule">
        <el-input v-model="keyword" placeholder="搜索名称" clearable style="width: 240px" @keyup.enter="fetchList">
          <template #append>
            <el-button :icon="Search" @click="fetchList" />
          </template>
        </el-input>
      </div>

      <!-- 已删除列表 -->
      <el-table v-loading="loading" :data="deletedList" stripe border style="margin-top: 12px;">
        <el-table-column :prop="nameColumn" label="名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="deleted_at" label="删除时间" width="170" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleRestore(row)">恢复</el-button>
            <el-button type="danger" link @click="handlePermanentDelete(row)">彻底删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination" v-if="total > 0">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import request from '@/utils/request'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const currentModule = ref('')
const keyword = ref('')
const loading = ref(false)
const deletedList = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const moduleStats = ref([])

const NAME_COLUMN_MAP = {
  customer: 'company_name',
  opportunity: 'name',
  contract: 'contract_no',
  quote: 'quote_no',
  supplier: 'name',
  purchase: 'title',
  service: 'title',
  product: 'name'
}

const nameColumn = ref('name')

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) fetchStats()
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const fetchStats = async () => {
  try {
    const res = await request.post('/recycle/list', {})
    if (res.code === 200) {
      moduleStats.value = res.data.stats || []
      if (!currentModule.value && moduleStats.value.length > 0) {
        const first = moduleStats.value.find(s => s.count > 0) || moduleStats.value[0]
        currentModule.value = first.module
        nameColumn.value = NAME_COLUMN_MAP[first.module] || 'name'
        fetchList()
      }
    }
  } catch (e) { /* ignore */ }
}

const handleModuleChange = (val) => {
  currentModule.value = val
  nameColumn.value = NAME_COLUMN_MAP[val] || 'name'
  page.value = 1
  keyword.value = ''
  fetchList()
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await request.post('/recycle/list', {
      module: currentModule.value,
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined
    })
    if (res.code === 200) {
      deletedList.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (e) { /* ignore */ }
  finally { loading.value = false }
}

const handleRestore = async (row) => {
  try {
    await ElMessageBox.confirm('确定要恢复该记录吗？', '提示', { type: 'warning' })
    const res = await request.post('/recycle/restore', { module: currentModule.value, id: row.id })
    if (res.code === 200) {
      ElMessage.success(res.message)
      fetchList()
      fetchStats()
    }
  } catch (e) { if (e !== 'cancel') console.error(e) }
}

const handlePermanentDelete = async (row) => {
  try {
    await ElMessageBox.confirm('彻底删除后无法恢复，确定要继续吗？', '警告', { type: 'error' })
    const res = await request.post('/recycle/permanent-delete', { module: currentModule.value, id: row.id })
    if (res.code === 200) {
      ElMessage.success(res.message)
      fetchList()
      fetchStats()
    }
  } catch (e) { if (e !== 'cancel') console.error(e) }
}
</script>

<style scoped>
.module-tabs { margin-bottom: 12px; }
.search-bar { margin-bottom: 12px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

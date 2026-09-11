<template>
  <div class="page-container">
    <div class="page-header">
      <h2>库存变动记录</h2>
      <el-button @click="$router.push('/inventory')">返回库存</el-button>
    </div>

    <el-card class="search-card">
      <el-form :model="search" inline @keyup.enter="fetchList">
        <el-form-item>
          <el-select v-model="search.product_id" placeholder="全部产品" filterable clearable style="width:200px">
            <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="search.movement_type" placeholder="全部类型" clearable style="width:120px">
            <el-option label="入库" value="in" /><el-option label="出库" value="out" /><el-option label="调整" value="adjust" /><el-option label="退货" value="return" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-date-picker v-model="search.dateRange" type="daterange" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" style="width:260px" />
        </el-form-item>
        <el-form-item><el-button type="primary" @click="fetchList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <StateWrapper
        :loading="loading"
        :error="errorMsg"
        :empty="!loading && list.length === 0"
        empty-text="暂无出入库记录"
        @retry="fetchList"
      >
        <template #loading>
          <TableSkeleton :rows="8" :cols="6" />
        </template>

      <el-table
        :data="list">
        <el-table-column prop="product_name" label="产品" min-width="160" show-overflow-tooltip />
        <el-table-column prop="movement_type" label="类型" width="80" align="center">
          <template #default="{ row }"><el-tag :type="typeTag[row.movement_type]" size="small">{{ typeName[row.movement_type] }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="80" align="center">
          <template #default="{ row }"><span :class="row.quantity > 0 ? 'text-success' : 'text-danger'">{{ row.quantity > 0 ? '+' : '' }}{{ row.quantity }}</span></template>
        </el-table-column>
        <el-table-column prop="before_qty" label="变动前" width="80" align="center" />
        <el-table-column prop="after_qty" label="变动后" width="80" align="center" />
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column prop="operator_name" label="操作人" width="100" />
        <el-table-column prop="create_time" label="时间" width="160" />
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" @size-change="fetchList" @current-change="fetchList" /></div>
      </StateWrapper>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import StateWrapper from '@/components/common/StateWrapper.vue'
import { reportError } from '@/utils/error'
import request from '@/utils/request'
import { getInventoryList, getInventoryMovements } from '@/api/product'

const typeName = { in: '入库', out: '出库', adjust: '调整', return: '退货' }
const typeTag = { in: 'success', out: 'danger', adjust: '', return: 'warning' }

// onMounted 无条件取数，初值 true 消除首帧空态闪现
const loading = ref(true)
const errorMsg = ref('')
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const products = ref([])
const search = reactive({ product_id: '', movement_type: '', dateRange: null })

const fetchList = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const params = { page: page.value, pageSize: pageSize.value, product_id: search.product_id, movement_type: search.movement_type }
    if (search.dateRange && search.dateRange.length === 2) { params.start_date = search.dateRange[0]; params.end_date = search.dateRange[1] }
    const res = await getInventoryMovements(params)
    if (res.code === 200) { list.value = res.data.list; total.value = res.data.total }
    else {
      // 业务码非 200：原先静默停在空表，用户无法区分「无数据」与「加载失败」
      errorMsg.value = res.message || '加载出入库记录失败，请稍后重试'
      reportError('获取出入库记录失败:', res.message)
    }
  } catch (error) {
    errorMsg.value = error?.response?.data?.message || '加载出入库记录失败，请稍后重试'
    reportError('获取出入库记录失败:', error)
  }
  finally { loading.value = false }
}

const fetchProducts = async () => {
  try { const res = await getInventoryList({ pageSize: 200 }); if (res.code === 200) products.value = res.data.list } catch (e) { /* */ }
}

onMounted(() => { fetchList(); fetchProducts() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.search-card { margin-bottom: var(--space-4); }
.search-card .el-form-item { margin-bottom: 0; }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
</style>

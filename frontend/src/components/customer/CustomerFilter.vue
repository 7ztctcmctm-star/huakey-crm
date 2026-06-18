<template>
  <el-card class="search-card" shadow="never">
    <el-form :model="searchForm" inline @keyup.enter="$emit('search')">
      <el-form-item label="公司名称">
        <el-input v-model="searchForm.company_name" placeholder="请输入公司名称" clearable />
      </el-form-item>
      <el-form-item label="联系人">
        <el-input v-model="searchForm.contact_name" placeholder="请输入联系人" clearable />
      </el-form-item>
      <el-form-item label="电话">
        <el-input v-model="searchForm.phone" placeholder="请输入电话" clearable />
      </el-form-item>
      <el-form-item label="客户来源">
        <el-select v-model="searchForm.source" placeholder="全部来源" clearable style="width: 160px">
          <template v-for="item in sourceOptions" :key="item.value || item.label">
            <el-option-group v-if="item.options" :label="item.label">
              <el-option v-for="child in item.options" :key="child.value" :label="child.label" :value="child.value" />
            </el-option-group>
            <el-option v-else :label="item.label" :value="item.value" />
          </template>
        </el-select>
      </el-form-item>
      <el-form-item label="客户等级">
        <el-select v-model="searchForm.level" placeholder="请选择等级" clearable>
          <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="客户类型">
        <el-select v-model="searchForm.customer_type" placeholder="全部类型" clearable>
          <el-option label="潜客" value="prospect" />
          <el-option label="正式客户" value="customer" />
        </el-select>
      </el-form-item>
      <el-form-item label="生命周期">
        <el-select v-model="searchForm.lifecycle_status" placeholder="全部阶段" clearable>
          <el-option label="新导入" value="new" />
          <el-option label="培育中" value="nurturing" />
          <el-option label="意向合作" value="intent" />
          <el-option label="正在合作" value="active" />
          <el-option label="流失" value="lost" />
          <el-option label="无效" value="inactive" />
        </el-select>
      </el-form-item>
      <el-form-item label="标签">
        <el-select v-model="searchForm.tag_id" placeholder="全部标签" clearable style="width:140px" @change="$emit('search')">
          <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker v-model="searchForm.dateRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 240px" />
      </el-form-item>
      <el-form-item label="排序">
        <el-select v-model="searchForm.sort" placeholder="默认排序" clearable style="width: 180px" @change="$emit('search')">
          <el-option label="最后跟进 ↑ 久未跟进优先" value="last_follow_time_asc" />
          <el-option label="最后跟进 ↓ 最近跟进优先" value="last_follow_time_desc" />
          <el-option label="创建时间 ↓ 最新优先" value="create_time_desc" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="$emit('search')">搜索</el-button>
        <el-button :icon="Refresh" @click="$emit('reset')">重置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { Search, Refresh } from '@element-plus/icons-vue'

defineProps({
  searchForm: { type: Object, required: true },
  sourceOptions: { type: Array, default: () => [] },
  levelOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  tagOptions: { type: Array, default: () => [] }
})

defineEmits(['search', 'reset'])
</script>

<style scoped>
.search-card {
  margin-bottom: 12px;
}
</style>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span class="card-title">联系人</span>
        <el-button type="primary" size="small" @click="$emit('add-contact')">添加联系人</el-button>
      </div>
    </template>

    <el-table :data="contacts" stripe border size="small">
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column prop="email" label="邮箱" min-width="150" show-overflow-tooltip />
      <el-table-column prop="position" label="职位" width="100" />
      <el-table-column prop="is_primary" label="主联系人" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_primary" type="success" size="small">是</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="$emit('edit-contact', row)">编辑</el-button>
          <el-button type="danger" link size="small" @click="$emit('delete-contact', row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
defineProps({
  contacts: { type: Array, default: () => [] }
})

defineEmits(['add-contact', 'edit-contact', 'delete-contact'])
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}
</style>

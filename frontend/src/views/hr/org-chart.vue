<template>
  <div class="page-container">
    <div class="page-header"><h2>组织架构</h2></div>

    <!-- 统计 -->
    <div class="stat-row">
      <div class="stat-item">部门总数：<strong>{{ treeData.total_depts || 0 }}</strong></div>
      <div class="stat-item">员工总数：<strong>{{ treeData.total_employees || 0 }}</strong></div>
    </div>

    <el-row :gutter="20">
      <!-- 左侧：组织树 -->
      <el-col :span="14">
        <el-card shadow="never" class="tree-card">
          <template #header><span class="card-title">组织架构</span></template>
          <div v-if="treeData.tree && treeData.tree.length > 0" class="org-tree">
            <OrgNode v-for="node in treeData.tree" :key="node.id" :node="node" :depth="0" :selected-id="selectedDeptId" @select="handleSelectDept" />
          </div>
          <el-empty v-else description="暂无部门数据" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 右侧：部门员工 -->
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">{{ selectedDeptName || '选择部门' }} {{ selectedDeptEmployees.length > 0 ? `(${selectedDeptEmployees.length}人)` : '' }}</span>
            </div>
          </template>
          <div v-if="selectedDeptId">
            <div v-if="selectedDeptEmployees.length > 0">
              <div v-for="emp in selectedDeptEmployees" :key="emp.id" class="emp-item">
                <div class="emp-avatar">{{ emp.real_name?.charAt(0) || '?' }}</div>
                <div class="emp-info">
                  <div class="emp-name">{{ emp.real_name }}</div>
                  <div class="emp-meta">{{ emp.position || '未设置职位' }} · {{ emp.phone || '' }}</div>
                </div>
              </div>
            </div>
            <el-empty v-else description="该部门暂无员工" :image-size="60" />
          </div>
          <el-empty v-else description="点击左侧部门查看员工" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, h, defineComponent } from 'vue'
import request from '@/utils/request'
import { getOrgTree, getOrgTreeEmployees } from '@/api/hr'

// 递归节点组件
const OrgNode = defineComponent({
  name: 'OrgNode',
  props: { node: Object, depth: Number, selectedId: Number },
  emits: ['select'],
  setup(props, { emit }) {
    const expanded = ref(props.depth < 2)
    const toggle = () => { if (props.node.children?.length) expanded.value = !expanded.value }
    const select = () => emit('select', props.node)

    return () => {
      const hasChildren = props.node.children && props.node.children.length > 0
      const isSelected = props.selectedId === props.node.id

      return h('div', { class: 'org-node' }, [
        h('div', {
          class: `org-node-content ${isSelected ? 'selected' : ''}`,
          style: `margin-left: ${props.depth * 24}px`,
          onClick: select
        }, [
          hasChildren ? h('span', {
            class: 'org-toggle',
            onClick: (e) => { e.stopPropagation(); toggle() }
          }, expanded.value ? '▼' : '▶') : h('span', { class: 'org-leaf' }, '•'),
          h('span', { class: 'org-name' }, props.node.name),
          h('span', { class: 'org-count' }, `${props.node.employee_count || 0}人`),
          props.node.manager_name ? h('span', { class: 'org-manager' }, `主管: ${props.node.manager_name}`) : null
        ]),
        hasChildren && expanded.value
          ? h('div', { class: 'org-children' },
              props.node.children.map(child =>
                h(OrgNode, { node: child, depth: props.depth + 1, selectedId: props.selectedId, onSelect: (n) => emit('select', n) })
              )
            )
          : null
      ])
    }
  }
})

const treeData = ref({ tree: [], total_depts: 0, total_employees: 0 })
const selectedDeptId = ref(null)
const selectedDeptName = ref('')
const selectedDeptEmployees = ref([])

const fetchTree = async () => {
  try { const res = await getOrgTree(); if (res.code === 200) treeData.value = res.data } catch (e) { /* */ }
}

const handleSelectDept = async (node) => {
  selectedDeptId.value = node.id
  selectedDeptName.value = node.name
  try {
    const res = await getOrgTreeEmployees(node.id)
    if (res.code === 200) selectedDeptEmployees.value = res.data
  } catch (e) { /* */ }
}

onMounted(() => { fetchTree() })
</script>

<style scoped>
.page-container { padding: 0; }
.page-header { margin-bottom: var(--space-4); }
.page-header h2 { margin: 0; font-size: 28px; font-weight: 600; color: var(--color-text); }
.card-title { font-size: 15px; font-weight: 600; }

.stat-row { display: flex; gap: 32px; margin-bottom: var(--space-4); font-size: 14px; color: var(--color-text-secondary); }
.stat-item strong { font-size: 20px; color: var(--color-text); margin-left: 4px; }

.tree-card { min-height: 500px; }

/* 组织树节点 */
.org-tree { font-size: 14px; }
.org-node-content {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s;
}
.org-node-content:hover { background: var(--color-bg-secondary); }
.org-node-content.selected { background: #f0f7ff; border-left: 3px solid #0071e3; }
.org-toggle { width: 16px; font-size: 10px; color: var(--color-text-tertiary); cursor: pointer; user-select: none; }
.org-leaf { width: 16px; text-align: center; color: var(--color-text-tertiary); }
.org-name { font-weight: 600; color: var(--color-text); }
.org-count { font-size: 12px; color: var(--color-text-tertiary); background: var(--color-bg-secondary); padding: 1px 6px; border-radius: 4px; }
.org-manager { font-size: 12px; color: var(--color-text-tertiary); margin-left: auto; }
.org-children { border-left: 1px solid var(--color-border); margin-left: 8px; }

/* 员工列表 */
.card-header { display: flex; justify-content: space-between; align-items: center; }
.emp-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.emp-item:last-child { border-bottom: none; }
.emp-avatar { width: 36px; height: 36px; border-radius: 50%; background: #0071e3; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; flex-shrink: 0; }
.emp-name { font-size: 14px; font-weight: 600; color: var(--color-text); }
.emp-meta { font-size: 12px; color: var(--color-text-tertiary); margin-top: 2px; }
</style>

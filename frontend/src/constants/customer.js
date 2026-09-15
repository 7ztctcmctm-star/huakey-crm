/**
 * 客户状态常量 — 统一引用，避免各模块重复定义
 *
 * status 字段：客户生命周期流水线状态（8 值）
 *   流水线: lead → sea → following → quoted → negotiating → signed
 *   终态:   lost / paused
 *
 * business_status 字段：tab 筛选别名（过渡期保留，待后端确认后废弃）
 *
 * 数据库 crm_customer.status 字段为 varchar，存储上述字符串值。
 */

// ---- 状态枚举（冻结，禁止修改值）----

export const CustomerStatus = Object.freeze({
  LEAD: 'lead',
  SEA: 'sea',
  FOLLOWING: 'following',
  QUOTED: 'quoted',
  NEGOTIATING: 'negotiating',
  SIGNED: 'signed',
  LOST: 'lost',
  PAUSED: 'paused',
})

/**
 * 流水线序列（不含终态/挂起态）
 * 用于 canForward / canBackward 流转判断
 */
export const PIPELINE = Object.freeze([
  CustomerStatus.LEAD,
  CustomerStatus.SEA,
  CustomerStatus.FOLLOWING,
  CustomerStatus.QUOTED,
  CustomerStatus.NEGOTIATING,
  CustomerStatus.SIGNED,
])

/**
 * 状态元数据表 — 中文标签 + el-tag 类型 + 分组
 * 所有组件统一引用此表，禁止本地重复定义
 *
 * tagType 值与原代码 CustomerTable.vue 保持一致（视觉回归保护）：
 *   lead: '', sea: 'info', following: 'warning', quoted: '',
 *   negotiating: 'primary', signed: 'success', lost: 'danger', paused: 'info'
 */
export const STATUS_META = Object.freeze({
  [CustomerStatus.LEAD]:       { label: '线索',     tagType: '',          group: 'pre'  },
  [CustomerStatus.SEA]:        { label: '公海',     tagType: 'info',      group: 'pre'  },
  [CustomerStatus.FOLLOWING]:  { label: '跟进中',   tagType: 'warning',   group: 'active' },
  [CustomerStatus.QUOTED]:     { label: '已报价',   tagType: '',          group: 'active' },
  [CustomerStatus.NEGOTIATING]:{ label: '谈判中',   tagType: 'primary',   group: 'active' },
  [CustomerStatus.SIGNED]:     { label: '已签约',   tagType: 'success',   group: 'done' },
  [CustomerStatus.LOST]:       { label: '已流失',   tagType: 'danger',    group: 'end' },
  [CustomerStatus.PAUSED]:     { label: '已暂停',   tagType: 'info',      group: 'end' },
})

/**
 * 状态分组
 * pre:    线索/公海（尚未进入正式跟进）
 * active: 跟进中/已报价/谈判中（活跃跟进）
 * done:   已签约（成交）
 * end:    已流失/已暂停（终止/挂起）
 */
export const STATUS_GROUPS = Object.freeze({
  PRE: 'pre',
  ACTIVE: 'active',
  DONE: 'done',
  END: 'end',
})

/**
 * 完整状态选项（8 值），用于筛选下拉框
 */
export const STATUS_OPTIONS = Object.freeze(
  Object.values(CustomerStatus).map(value => ({
    value,
    label: STATUS_META[value].label,
  }))
)

/**
 * 编辑表单状态选项 — 不含 lead/sea
 * （线索和公海状态不应在编辑表单中手动选择）
 */
export const EDIT_STATUS_OPTIONS = Object.freeze(
  Object.values(CustomerStatus)
    .filter(s => s !== CustomerStatus.LEAD && s !== CustomerStatus.SEA)
    .map(value => ({
      value,
      label: STATUS_META[value].label,
    }))
)

/**
 * 筛选 tab 状态选项 — 用于 CustomerFilter 状态筛选 Tabs
 * 不含 lead/sea（正式客户页面不展示线索和公海）
 */
export const FILTER_TAB_OPTIONS = Object.freeze([
  { label: '全部', value: 'all' },
  { label: '跟进中', value: 'following' },
  { label: '已报价', value: 'quoted' },
  { label: '谈判中', value: 'negotiating' },
  { label: '已签约', value: 'signed' },
  { label: '已流失', value: 'lost' },
  { label: '暂停跟进', value: 'paused' },
])

/**
 * 筛选下拉状态选项 — 用于 CustomerFilter 状态下拉框
 * 不含 lead/sea（与原 statusOptions 保持一致）
 */
export const FILTER_STATUS_OPTIONS = Object.freeze(
  Object.values(CustomerStatus)
    .filter(s => s !== CustomerStatus.LEAD && s !== CustomerStatus.SEA)
    .map(value => ({
      value,
      label: STATUS_META[value].label,
    }))
)

// ---- 映射函数（替代各组件本地 statusMap / statusTagType / statusLabel） ----

/**
 * 获取状态中文标签
 * @param {string} status
 * @returns {string}
 */
export function getStatusLabel(status) {
  return STATUS_META[status]?.label ?? '未知'
}

/**
 * 获取状态 el-tag 类型
 * @param {string} status
 * @returns {string} el-tag type: primary / success / warning / danger / info / ''
 */
export function getStatusTagType(status) {
  return STATUS_META[status]?.tagType ?? 'info'
}

// ---- 流转判断函数 ----

/**
 * 是否可以向前流转（进入下一流水线阶段）
 * 终态(lost/paused)不在 PIPELINE 中，自动返回 false
 * @param {string} status
 * @returns {boolean}
 */
export function canForward(status) {
  const index = PIPELINE.indexOf(status)
  return index !== -1 && index < PIPELINE.length - 1
}

/**
 * 是否可以向后流转（退回上一流水线阶段）
 * 终态(lost/paused)不在 PIPELINE 中，自动返回 false
 * @param {string} status
 * @returns {boolean}
 */
export function canBackward(status) {
  const index = PIPELINE.indexOf(status)
  return index > 0
}

/**
 * 获取下一流水线状态
 * @param {string} status
 * @returns {string|null}
 */
export function getNextStatus(status) {
  const index = PIPELINE.indexOf(status)
  if (index === -1 || index >= PIPELINE.length - 1) return null
  return PIPELINE[index + 1]
}

/**
 * 获取上一流水线状态
 * @param {string} status
 * @returns {string|null}
 */
export function getPrevStatus(status) {
  const index = PIPELINE.indexOf(status)
  if (index <= 0) return null
  return PIPELINE[index - 1]
}

// ---- business_status 兼容映射层 ----

/**
 * business_status 到 status 的映射
 * 如果后端仍需 business_status 参数，前端通过此映射从 status 推导
 *
 * 当前 business_status 的实际值需要与后端确认后补充
 * 过渡期：前端发送筛选请求时，优先使用 status 参数
 */
export const BUSINESS_STATUS_MAP = Object.freeze({
  // 待后端确认后补充完整映射
  // 例如：following -> 'active', quoted -> 'active', signed -> 'done'
})

/**
 * 将 status 转换为 business_status（如果后端需要）
 * @param {string} status
 * @returns {string|undefined}
 */
export function statusToBusinessStatus(status) {
  return BUSINESS_STATUS_MAP[status]
}

/**
 * P0-13：备份恢复必须「先取确认码，再带 confirm_code 提交」，且失败不得被当成取消吞掉。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'

vi.mock('@/api/system', () => ({
  getBackupList: vi.fn().mockResolvedValue({
    code: 200,
    data: { list: [{ id: 7, status: 'success', backup_type: 'full', file_size: 1024 }], total: 1 }
  }),
  createBackup: vi.fn(),
  deleteBackup: vi.fn().mockResolvedValue({ code: 200 }),
  getRestoreConfirmCode: vi.fn().mockResolvedValue({ code: 200, data: { confirm_code: 'abc123' } }),
  restoreBackup: vi.fn().mockResolvedValue({ code: 200 })
}))

import { getRestoreConfirmCode, restoreBackup } from '@/api/system'
import Backup from '@/views/system/backup.vue'

const mountPage = () =>
  mount(Backup, {
    global: {
      stubs: {
        StateWrapper: { template: '<div><slot /></div>' },
        TableSkeleton: true,
        'el-card': { template: '<div><slot /></div>' },
        'el-button': { template: '<button><slot /></button>' },
        'el-table': { template: '<div><slot /></div>' },
        'el-table-column': true,
        'el-tag': true,
        'el-pagination': true
      }
    }
  })

const getHandler = (wrapper, name) => wrapper.vm[name] || wrapper.vm.$?.setupState?.[name]

describe('备份恢复（P0-13）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ElMessageBox.confirm.mockResolvedValue('confirm')
    ElMessage.success.mockClear()
    ElMessage.error.mockClear()
  })

  it('确认后先取确认码，再带 confirm_code 提交恢复', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await getHandler(wrapper, 'handleRestore')({ id: 7 })
    await flushPromises()

    expect(getRestoreConfirmCode).toHaveBeenCalledWith(7)
    expect(restoreBackup).toHaveBeenCalledWith(7, 'abc123')
    expect(ElMessage.success).toHaveBeenCalledWith('恢复任务已执行')
    wrapper.unmount()
  })

  it('用户取消时不得发起任何请求，也不弹错误', async () => {
    ElMessageBox.confirm.mockRejectedValueOnce('cancel')
    const wrapper = mountPage()
    await flushPromises()

    await getHandler(wrapper, 'handleRestore')({ id: 7 })
    await flushPromises()

    expect(getRestoreConfirmCode).not.toHaveBeenCalled()
    expect(restoreBackup).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('取码失败必须提示错误，且不得继续提交恢复', async () => {
    getRestoreConfirmCode.mockRejectedValueOnce(new Error('forbidden'))
    const wrapper = mountPage()
    await flushPromises()

    await getHandler(wrapper, 'handleRestore')({ id: 7 })
    await flushPromises()

    expect(restoreBackup).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('恢复请求失败必须提示错误（不再被空 catch 吞掉）', async () => {
    restoreBackup.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPage()
    await flushPromises()

    await getHandler(wrapper, 'handleRestore')({ id: 7 })
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalled()
    wrapper.unmount()
  })
})

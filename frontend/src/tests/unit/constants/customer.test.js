import { describe, it, expect } from 'vitest'
import {
  CustomerStatus,
  PIPELINE,
  STATUS_META,
  STATUS_GROUPS,
  STATUS_OPTIONS,
  EDIT_STATUS_OPTIONS,
  FILTER_STATUS_OPTIONS,
  FILTER_TAB_OPTIONS,
  getStatusLabel,
  getStatusTagType,
  canForward,
  canBackward,
  getNextStatus,
  getPrevStatus,
} from '@/constants/customer'

describe('constants/customer', () => {
  describe('CustomerStatus', () => {
    it('应该包含 8 个状态值', () => {
      expect(Object.keys(CustomerStatus)).toHaveLength(8)
    })

    it('值应该是字符串且不可变', () => {
      expect(CustomerStatus.LEAD).toBe('lead')
      expect(CustomerStatus.SEA).toBe('sea')
      expect(CustomerStatus.FOLLOWING).toBe('following')
      expect(CustomerStatus.QUOTED).toBe('quoted')
      expect(CustomerStatus.NEGOTIATING).toBe('negotiating')
      expect(CustomerStatus.SIGNED).toBe('signed')
      expect(CustomerStatus.LOST).toBe('lost')
      expect(CustomerStatus.PAUSED).toBe('paused')
    })
  })

  describe('PIPELINE', () => {
    it('应该包含 6 个流水线状态（不含终态）', () => {
      expect(PIPELINE).toHaveLength(6)
    })

    it('不应该包含 lost 和 paused', () => {
      expect(PIPELINE).not.toContain(CustomerStatus.LOST)
      expect(PIPELINE).not.toContain(CustomerStatus.PAUSED)
    })

    it('顺序应该是 lead → sea → following → quoted → negotiating → signed', () => {
      expect(PIPELINE[0]).toBe('lead')
      expect(PIPELINE[1]).toBe('sea')
      expect(PIPELINE[2]).toBe('following')
      expect(PIPELINE[3]).toBe('quoted')
      expect(PIPELINE[4]).toBe('negotiating')
      expect(PIPELINE[5]).toBe('signed')
    })
  })

  describe('STATUS_META', () => {
    it('每个状态都有 label 和 tagType', () => {
      Object.values(CustomerStatus).forEach(status => {
        const meta = STATUS_META[status]
        expect(meta).toBeDefined()
        expect(typeof meta.label).toBe('string')
        expect(meta.label.length).toBeGreaterThan(0)
        expect(typeof meta.tagType).toBe('string')
      })
    })

    // tagType 视觉回归保护 — 确保与原代码一致
    it('tagType 与原 CustomerTable.vue 一致', () => {
      expect(STATUS_META[CustomerStatus.LEAD].tagType).toBe('')
      expect(STATUS_META[CustomerStatus.SEA].tagType).toBe('info')
      expect(STATUS_META[CustomerStatus.FOLLOWING].tagType).toBe('warning')
      expect(STATUS_META[CustomerStatus.QUOTED].tagType).toBe('')
      expect(STATUS_META[CustomerStatus.NEGOTIATING].tagType).toBe('primary')
      expect(STATUS_META[CustomerStatus.SIGNED].tagType).toBe('success')
      expect(STATUS_META[CustomerStatus.LOST].tagType).toBe('danger')
      expect(STATUS_META[CustomerStatus.PAUSED].tagType).toBe('info')
    })

    it('label 与原代码一致', () => {
      expect(STATUS_META[CustomerStatus.LEAD].label).toBe('线索')
      expect(STATUS_META[CustomerStatus.FOLLOWING].label).toBe('跟进中')
      expect(STATUS_META[CustomerStatus.QUOTED].label).toBe('已报价')
      expect(STATUS_META[CustomerStatus.NEGOTIATING].label).toBe('谈判中')
      expect(STATUS_META[CustomerStatus.SIGNED].label).toBe('已签约')
      expect(STATUS_META[CustomerStatus.LOST].label).toBe('已流失')
      expect(STATUS_META[CustomerStatus.PAUSED].label).toBe('已暂停')
    })
  })

  describe('getStatusLabel', () => {
    it('返回正确的中文标签', () => {
      expect(getStatusLabel('following')).toBe('跟进中')
      expect(getStatusLabel('signed')).toBe('已签约')
    })

    it('未知状态返回"未知"', () => {
      expect(getStatusLabel('unknown')).toBe('未知')
    })

    it('空值返回"未知"', () => {
      expect(getStatusLabel(null)).toBe('未知')
      expect(getStatusLabel(undefined)).toBe('未知')
    })
  })

  describe('getStatusTagType', () => {
    it('返回正确的 el-tag type', () => {
      expect(getStatusTagType('following')).toBe('warning')
      expect(getStatusTagType('signed')).toBe('success')
      expect(getStatusTagType('lost')).toBe('danger')
    })

    it('未知状态返回 info', () => {
      expect(getStatusTagType('unknown')).toBe('info')
    })
  })

  describe('canForward', () => {
    it('流水线中间状态可以前进', () => {
      expect(canForward('lead')).toBe(true)
      expect(canForward('following')).toBe(true)
      expect(canForward('negotiating')).toBe(true)
    })

    it('流水线最后一个状态不能前进', () => {
      expect(canForward('signed')).toBe(false)
    })

    it('终态不能前进', () => {
      expect(canForward('lost')).toBe(false)
      expect(canForward('paused')).toBe(false)
    })
  })

  describe('canBackward', () => {
    it('流水线中间状态可以后退', () => {
      expect(canBackward('sea')).toBe(true)
      expect(canBackward('following')).toBe(true)
      expect(canBackward('signed')).toBe(true)
    })

    it('流水线第一个状态不能后退', () => {
      expect(canBackward('lead')).toBe(false)
    })

    it('终态不能后退', () => {
      expect(canBackward('lost')).toBe(false)
      expect(canBackward('paused')).toBe(false)
    })
  })

  describe('getNextStatus / getPrevStatus', () => {
    it('返回正确的下一状态', () => {
      expect(getNextStatus('lead')).toBe('sea')
      expect(getNextStatus('following')).toBe('quoted')
      expect(getNextStatus('negotiating')).toBe('signed')
    })

    it('最后一个状态返回 null', () => {
      expect(getNextStatus('signed')).toBeNull()
    })

    it('终态返回 null', () => {
      expect(getNextStatus('lost')).toBeNull()
      expect(getNextStatus('paused')).toBeNull()
    })

    it('返回正确的上一状态', () => {
      expect(getPrevStatus('sea')).toBe('lead')
      expect(getPrevStatus('signed')).toBe('negotiating')
    })

    it('第一个状态返回 null', () => {
      expect(getPrevStatus('lead')).toBeNull()
    })
  })

  describe('STATUS_OPTIONS / EDIT_STATUS_OPTIONS', () => {
    it('STATUS_OPTIONS 包含全部 8 个状态', () => {
      expect(STATUS_OPTIONS).toHaveLength(8)
    })

    it('EDIT_STATUS_OPTIONS 不包含 lead 和 sea', () => {
      const values = EDIT_STATUS_OPTIONS.map(o => o.value)
      expect(values).not.toContain('lead')
      expect(values).not.toContain('sea')
      expect(EDIT_STATUS_OPTIONS).toHaveLength(6)
    })
  })

  describe('FILTER_TAB_OPTIONS', () => {
    it('第一项是"全部"', () => {
      expect(FILTER_TAB_OPTIONS[0]).toEqual({ label: '全部', value: 'all' })
    })

    it('不含 lead 和 sea', () => {
      const values = FILTER_TAB_OPTIONS.map(o => o.value)
      expect(values).not.toContain('lead')
      expect(values).not.toContain('sea')
    })

    it('包含 7 项（全部 + 6 个状态）', () => {
      expect(FILTER_TAB_OPTIONS).toHaveLength(7)
    })
  })

  describe('FILTER_STATUS_OPTIONS', () => {
    it('不含 lead 和 sea', () => {
      const values = FILTER_STATUS_OPTIONS.map(o => o.value)
      expect(values).not.toContain('lead')
      expect(values).not.toContain('sea')
    })

    it('包含 6 个状态', () => {
      expect(FILTER_STATUS_OPTIONS).toHaveLength(6)
    })
  })
})

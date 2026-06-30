import { describe, it, expect } from 'vitest'

describe('XSS 防护', () => {
  it('DOMPurify 应能正常加载', async () => {
    const DOMPurify = await import('dompurify')
    expect(DOMPurify.default).toBeDefined()
    expect(typeof DOMPurify.default.sanitize).toBe('function')
  })

  it('DOMPurify 应能过滤 script 标签', async () => {
    const DOMPurify = (await import('dompurify')).default
    const dirty = '<img src=x onerror=alert(1)>'
    const clean = DOMPurify.sanitize(dirty)
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('alert')
  })

  it('DOMPurify 应能过滤 javascript: 协议', async () => {
    const DOMPurify = (await import('dompurify')).default
    const dirty = '<a href="javascript:alert(1)">click</a>'
    const clean = DOMPurify.sanitize(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('DOMPurify 应保留安全的 HTML', async () => {
    const DOMPurify = (await import('dompurify')).default
    const safe = '<p>Hello <strong>World</strong></p>'
    const clean = DOMPurify.sanitize(safe)
    expect(clean).toContain('<p>')
    expect(clean).toContain('<strong>')
  })

  it('DOMPurify 应能过滤 iframe', async () => {
    const DOMPurify = (await import('dompurify')).default
    const dirty = '<iframe src="http://evil.com"></iframe>'
    const clean = DOMPurify.sanitize(dirty)
    expect(clean).not.toContain('<iframe')
  })
})

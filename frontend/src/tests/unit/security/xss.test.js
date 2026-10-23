import { describe, it, expect } from 'vitest'
import { sanitize, sanitizeSvg } from '@/utils/sanitize'

// 生产接口实际返回的验证码 SVG 结构样本（svg-captcha 输出）
const CAPTCHA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0,0,150,50"><rect width="100%" height="100%" fill="#f5f5f7"/><path d="M2 15 C54 48,89 11,141 18" stroke="#5cbfdf" fill="none"/><path fill="#e4957b" d="M30.99 31.00L30.83 30.83"/></svg>'

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

describe('sanitize 文本通道（邮件正文等不可信 HTML）', () => {
  it('应保留白名单文本标签', async () => {
    const clean = await sanitize('<p>Hello <strong>World</strong></p>')
    expect(clean).toContain('<p>')
    expect(clean).toContain('<strong>')
  })

  it('应剥除脚本与事件属性', async () => {
    const clean = await sanitize('<p onclick="alert(1)">x</p><script>alert(2)</script>')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('<script')
  })

  it('SVG 在文本通道应被剥空（回归锚点：验证码不可用此通道）', async () => {
    const clean = await sanitize(CAPTCHA_SVG)
    expect(clean).not.toContain('<svg')
  })
})

describe('sanitizeSvg 图形通道（验证码等服务端可信 SVG）', () => {
  it('验证码 SVG 应完整保留（修复回归：此前被文本白名单剥空）', async () => {
    const clean = await sanitizeSvg(CAPTCHA_SVG)
    expect(clean).toContain('<svg')
    expect(clean).toContain('viewBox')
    expect(clean).toContain('<path')
    expect(clean).toContain('d=')
  })

  it('应剥除 SVG 内嵌 script 与事件属性', async () => {
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><path d="M1 1"/></svg>'
    const clean = await sanitizeSvg(dirty)
    expect(clean).not.toContain('onload')
    expect(clean).not.toContain('<script')
    expect(clean).toContain('<path')
  })

  it('应剥除 foreignObject / use / 外链 image', async () => {
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>evil</div></foreignObject><use xlink:href="http://evil.com"/><image href="http://evil.com/x.png"/><path d="M1 1"/></svg>'
    const clean = await sanitizeSvg(dirty)
    expect(clean).not.toContain('foreignObject')
    expect(clean).not.toContain('<use')
    expect(clean).not.toContain('<image')
    expect(clean).toContain('<path')
  })

  it('空输入返回空串', async () => {
    expect(await sanitizeSvg('')).toBe('')
    expect(await sanitizeSvg(null)).toBe('')
  })
})

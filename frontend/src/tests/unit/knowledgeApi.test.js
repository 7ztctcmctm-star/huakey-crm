import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 底层 axios 实例，验证 api/knowledge.js 调用的 METHOD + URL 与后端 RESTful 路由一致
const request = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ code: 200, data: {} })),
  post: vi.fn(() => Promise.resolve({ code: 200, data: {} })),
  put: vi.fn(() => Promise.resolve({ code: 200, data: {} })),
  delete: vi.fn(() => Promise.resolve({ code: 200, data: {} }))
}))
vi.mock('@/utils/request', () => ({ default: request, ...request }))

import {
  addKnowledgeScript,
  updateKnowledgeScript,
  deleteKnowledgeScript,
  addKnowledgeFaq,
  updateKnowledgeFaq,
  deleteKnowledgeFaq,
  getKnowledgeDocuments
} from '@/api/knowledge'

describe('api/knowledge.js - 端点必须与后端 RESTful 路由一致', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('话术 create 走 POST /knowledge/scripts（非 /scripts/add）', async () => {
    await addKnowledgeScript({ title: 't', content: 'c' })
    expect(request.post).toHaveBeenCalledWith('/knowledge/scripts', expect.anything())
    expect(request.post).not.toHaveBeenCalledWith('/knowledge/scripts/add', expect.anything())
  })

  it('话术 update 走 PUT /knowledge/scripts/:id（非 /scripts/update）', async () => {
    await updateKnowledgeScript(11, { title: 't' })
    expect(request.put).toHaveBeenCalledWith('/knowledge/scripts/11', { title: 't' })
    expect(request.post).not.toHaveBeenCalledWith('/knowledge/scripts/update', expect.anything())
  })

  it('话术 delete 走 DELETE /knowledge/scripts/:id（非 /scripts/delete）', async () => {
    await deleteKnowledgeScript(11)
    expect(request.delete).toHaveBeenCalledWith('/knowledge/scripts/11')
  })

  it('FAQ create 走 POST /knowledge/faqs', async () => {
    await addKnowledgeFaq({ question: 'q', answer: 'a' })
    expect(request.post).toHaveBeenCalledWith('/knowledge/faqs', expect.anything())
  })

  it('FAQ update 走 PUT /knowledge/faqs/:id，且 id 作为路径参数', async () => {
    await updateKnowledgeFaq(7, { question: 'q' })
    expect(request.put).toHaveBeenCalledWith('/knowledge/faqs/7', { question: 'q' })
  })

  it('FAQ delete 走 DELETE /knowledge/faqs/:id', async () => {
    await deleteKnowledgeFaq(7)
    expect(request.delete).toHaveBeenCalledWith('/knowledge/faqs/7')
  })

  it('文档检索走 GET /knowledge/documents 并透传 keyword/type', async () => {
    await getKnowledgeDocuments({ keyword: '合同', type: 'contract' })
    expect(request.get).toHaveBeenCalledWith('/knowledge/documents', { params: { keyword: '合同', type: 'contract' } })
  })
})

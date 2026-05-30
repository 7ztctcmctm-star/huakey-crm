/**
 * 统一 LLM 调用：使用 Ollama（本地）
 *
 * 环境变量：
 *   OLLAMA_URL - Ollama服务地址，默认 http://127.0.0.1:11434
 *   OLLAMA_MODEL - 模型名称，默认 qwen2.5:3b
 */

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ maxTokens?: number, temperature?: number, signal?: AbortSignal, system?: string }} options
 * @returns {Promise<string>}
 */
async function chatCompletion(messages, options = {}) {
  const maxTokens = options.maxTokens ?? 200;
  const temperature = options.temperature ?? 0.7;
  const signal = options.signal;

  // 如传入system参数，拼入messages数组首位（Ollama支持system角色）
  const finalMessages = options.system
    ? [{ role: 'system', content: options.system }, ...messages]
    : messages;

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: finalMessages,
      stream: false,
      options: { num_predict: maxTokens, temperature }
    }),
    signal
  });

  if (!response.ok) {
    throw new Error(`Ollama 返回错误 (${response.status})`);
  }

  const data = await response.json();
  return (data.message?.content || '').trim();
}

/**
 * @returns {Promise<{ online: boolean, provider: string, model: string, models: string[] }>}
 */
async function getProviderStatus() {
  const model = OLLAMA_MODEL;
  
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    const d = await r.json();
    const models = (d.models || []).map((m) => m.name);
    return {
      online: true,
      provider: 'ollama',
      model,
      models: models.length ? models : [model]
    };
  } catch {
    return { online: false, provider: 'ollama', model, models: [model] };
  }
}

module.exports = {
  chatCompletion,
  getProviderStatus
};

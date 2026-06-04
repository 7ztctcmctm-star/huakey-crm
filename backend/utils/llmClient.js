/**
 * 统一 LLM 调用：支持 OpenAI / MiMo / Ollama
 *
 * 环境变量：
 *   AI_PROVIDER - AI 提供商，可选 openai / mimo / ollama，默认 ollama
 *   OPENAI_API_KEY - OpenAI API 密钥
 *   OPENAI_BASE_URL - OpenAI API 地址，默认 https://api.openai.com/v1
 *   OPENAI_MODEL - 模型名称，默认 gpt-3.5-turbo
 *   MIMO_API_KEY - MiMo API 密钥
 *   MIMO_BASE_URL - MiMo API 地址，默认 https://api.xiaomimimo.com/v1
 *   MIMO_MODEL - 模型名称，默认 mimo-v2.5-flash
 *   OLLAMA_URL - Ollama 服务地址，默认 http://127.0.0.1:11434
 *   OLLAMA_MODEL - 模型名称，默认 qwen2.5:3b
 */

const AI_PROVIDER = (process.env.AI_PROVIDER || 'ollama').toLowerCase();

// OpenAI 配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

// MiMo 配置
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';
const MIMO_BASE_URL = (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/$/, '');
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2.5-flash';

// Ollama 配置
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

/**
 * 获取当前 AI 提供商配置
 */
function getProviderConfig() {
  switch (AI_PROVIDER) {
    case 'openai':
      return {
        apiKey: OPENAI_API_KEY,
        baseUrl: OPENAI_BASE_URL,
        model: OPENAI_MODEL,
        provider: 'openai'
      };
    case 'mimo':
      return {
        apiKey: MIMO_API_KEY,
        baseUrl: MIMO_BASE_URL,
        model: MIMO_MODEL,
        provider: 'mimo'
      };
    case 'ollama':
    default:
      return {
        apiKey: '',
        baseUrl: OLLAMA_URL,
        model: OLLAMA_MODEL,
        provider: 'ollama'
      };
  }
}

/**
 * 检查并验证当前配置
 */
function validateConfig() {
  const config = getProviderConfig();
  
  if (config.provider === 'mimo') {
    if (!config.apiKey) {
      console.warn('[LLM Client] MiMo 未配置 API Key，建议配置或切换到 Ollama');
    }
    if (config.model === 'mimo-v2.5-pro') {
      console.warn('[LLM Client] mimo-v2.5-pro 模型可能不可用，建议使用 mimo-v2.5-flash');
    }
  }
  
  return config;
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ maxTokens?: number, temperature?: number, signal?: AbortSignal, system?: string }} options
 * @returns {Promise<string>}
 */
async function chatCompletion(messages, options = {}) {
  const maxTokens = options.maxTokens ?? 200;
  const temperature = options.temperature ?? 0.7;
  const signal = options.signal;
  const config = validateConfig();

  // 如传入system参数，拼入messages数组首位
  const finalMessages = options.system
    ? [{ role: 'system', content: options.system }, ...messages]
    : messages;

  // 检查是否包含图片内容
  const hasImageContent = finalMessages.some(msg => 
    typeof msg.content === 'object' && msg.content.type === 'image_url'
  );
  
  if (hasImageContent && config.provider === 'ollama') {
    throw new Error('Ollama 不支持图片输入，请使用支持图片的模型（如 GPT-4 Vision）');
  }

  // Ollama 使用不同的 API 格式
  if (config.provider === 'ollama') {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: finalMessages,
        stream: false,
        options: { num_predict: maxTokens, temperature }
      }),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Ollama 返回错误 (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return (data.message?.content || '').trim();
  }

  // OpenAI / MiMo 使用 OpenAI 兼容格式
  if (!config.apiKey) {
    throw new Error(`${config.provider} API Key 未配置`);
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: finalMessages,
      max_tokens: maxTokens,
      temperature,
      stream: false
    }),
    signal
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`${config.provider} API 返回错误 (${response.status}): ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

/**
 * @returns {Promise<{ online: boolean, provider: string, model: string, models: string[], supportsImage: boolean }>}
 */
async function getProviderStatus() {
  const config = getProviderConfig();

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);

    let r;
    if (config.provider === 'ollama') {
      r = await fetch(`${config.baseUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);

      if (!r.ok) {
        throw new Error('Ollama 无法访问');
      }

      const d = await r.json();
      const models = (d.models || []).map((m) => m.name);
      return {
        online: true,
        provider: config.provider,
        model: config.model,
        models: models.length ? models : [config.model],
        supportsImage: false
      };
    } else {
      r = await fetch(`${config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
        signal: ctrl.signal
      });
      clearTimeout(t);

      if (!r.ok) {
        throw new Error(`${config.provider} API 无法访问`);
      }

      const d = await r.json();
      const models = (d.data || []).map((m) => m.id);
      return {
        online: true,
        provider: config.provider,
        model: config.model,
        models: models.length ? models : [config.model],
        supportsImage: config.provider === 'openai' && config.model.startsWith('gpt-4')
      };
    }
  } catch (err) {
    console.error('[LLM Client] 状态检查失败:', err.message);
    return { 
      online: false, 
      provider: config.provider, 
      model: config.model, 
      models: [config.model],
      supportsImage: config.provider === 'openai' && config.model.startsWith('gpt-4')
    };
  }
}

module.exports = {
  chatCompletion,
  getProviderStatus,
  getProviderConfig
};

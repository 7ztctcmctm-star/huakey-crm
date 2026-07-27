/**
 * llmClient 单元测试
 * 覆盖 getProviderConfig / validateConfig / chatCompletion / getProviderStatus
 */

function loadClient(envOverrides = {}) {
  jest.resetModules();
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return require('../../utils/llmClient');
}

function mockFetch(returns) {
  const calls = [];
  global.fetch = jest.fn(async (url, options) => {
    calls.push({ url, options });
    const item = returns.shift();
    if (item instanceof Error) throw item;
    return item;
  });
  return calls;
}

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body))
  };
}

function failResponse(status, bodyOrText = {}) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(bodyOrText),
    text: jest.fn().mockResolvedValue(typeof bodyOrText === 'string' ? bodyOrText : JSON.stringify(bodyOrText))
  };
}

describe('llmClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
    delete process.env.MIMO_API_KEY;
    delete process.env.MIMO_BASE_URL;
    delete process.env.MIMO_MODEL;
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_MODEL;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore && console.warn.mockRestore();
    console.error.mockRestore && console.error.mockRestore();
  });

  describe('getProviderConfig', () => {
    it('默认返回 ollama 配置', () => {
      const { getProviderConfig } = loadClient();
      const config = getProviderConfig();
      expect(config.provider).toBe('ollama');
      expect(config.model).toBe('qwen2.5:3b');
      expect(config.baseUrl).toBe('http://127.0.0.1:11434');
      expect(config.apiKey).toBe('');
    });

    it('openai 配置应包含 apiKey/model/baseUrl', () => {
      const { getProviderConfig } = loadClient({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai',
        OPENAI_BASE_URL: 'https://api.openai.com/v1/',
        OPENAI_MODEL: 'gpt-4o'
      });
      const config = getProviderConfig();
      expect(config.provider).toBe('openai');
      expect(config.apiKey).toBe('sk-openai');
      expect(config.baseUrl).toBe('https://api.openai.com/v1');
      expect(config.model).toBe('gpt-4o');
    });

    it('mimo 配置应包含 apiKey/model/baseUrl', () => {
      const { getProviderConfig } = loadClient({
        AI_PROVIDER: 'mimo',
        MIMO_API_KEY: 'sk-mimo',
        MIMO_BASE_URL: 'https://api.xiaomimimo.com/v1/',
        MIMO_MODEL: 'mimo-v2.5-flash'
      });
      const config = getProviderConfig();
      expect(config.provider).toBe('mimo');
      expect(config.apiKey).toBe('sk-mimo');
      expect(config.baseUrl).toBe('https://api.xiaomimimo.com/v1');
      expect(config.model).toBe('mimo-v2.5-flash');
    });

    it('未知 provider 应回退到 ollama', () => {
      const { getProviderConfig } = loadClient({ AI_PROVIDER: 'unknown' });
      const config = getProviderConfig();
      expect(config.provider).toBe('ollama');
    });
  });

  describe('validateConfig (通过 chatCompletion 间接触发)', () => {
    it('mimo 未配置 apiKey 时 chatCompletion 应警告并抛错', async () => {
      const { chatCompletion } = loadClient({ AI_PROVIDER: 'mimo' });
      mockFetch([]);

      await expect(chatCompletion([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow('mimo API Key 未配置');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('MiMo 未配置 API Key'));
    });

    it('mimo 使用 mimo-v2.5-pro 时 chatCompletion 应警告', async () => {
      const { chatCompletion } = loadClient({
        AI_PROVIDER: 'mimo',
        MIMO_API_KEY: 'sk-mimo',
        MIMO_MODEL: 'mimo-v2.5-pro'
      });
      mockFetch([failResponse(400)]);

      await expect(chatCompletion([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('mimo-v2.5-pro'));
    });

    it('ollama chatCompletion 不应警告', async () => {
      const { chatCompletion } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([okResponse({ message: { content: 'ok' } })]);

      await chatCompletion([{ role: 'user', content: 'hi' }]);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('chatCompletion', () => {
    it('ollama 成功时应返回 content', async () => {
      const { chatCompletion } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([okResponse({ message: { content: '  hello ollama  ' } })]);

      const result = await chatCompletion([{ role: 'user', content: 'hi' }]);
      expect(result).toBe('hello ollama');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"model":"qwen2.5:3b"')
        })
      );
    });

    it('ollama 失败时应抛出带状态码的错误', async () => {
      const { chatCompletion } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([failResponse(500, 'internal error')]);

      await expect(chatCompletion([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow('Ollama 返回错误 (500)');
    });

    it('ollama 遇到图片内容时应抛错', async () => {
      const { chatCompletion } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([]);

      await expect(chatCompletion([
        { role: 'user', content: { type: 'image_url', image_url: 'http://x.png' } }
      ])).rejects.toThrow('Ollama 不支持图片输入');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('openai 成功时应返回 choices 内容', async () => {
      const { chatCompletion } = loadClient({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai'
      });
      mockFetch([okResponse({ choices: [{ message: { content: '  hello openai  ' } }] })]);

      const result = await chatCompletion([{ role: 'user', content: 'hi' }]);
      expect(result).toBe('hello openai');
      const call = global.fetch.mock.calls[0];
      expect(call[0]).toBe('https://api.openai.com/v1/chat/completions');
      expect(call[1].headers.Authorization).toBe('Bearer sk-openai');
      expect(call[1].body).toContain('"max_tokens":200');
    });

    it('openai 未配置 apiKey 时应抛错', async () => {
      const { chatCompletion } = loadClient({ AI_PROVIDER: 'openai' });
      mockFetch([]);

      await expect(chatCompletion([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow('openai API Key 未配置');
    });

    it('openai 失败时应抛出带错误消息的错误', async () => {
      const { chatCompletion } = loadClient({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai'
      });
      mockFetch([failResponse(400, { error: { message: 'bad request' } })]);

      await expect(chatCompletion([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow('bad request');
    });

    it('mimo 成功时应返回内容', async () => {
      const { chatCompletion } = loadClient({
        AI_PROVIDER: 'mimo',
        MIMO_API_KEY: 'sk-mimo'
      });
      mockFetch([okResponse({ choices: [{ message: { content: 'mimo ok' } }] })]);

      const result = await chatCompletion([{ role: 'user', content: 'hi' }]);
      expect(result).toBe('mimo ok');
      const call = global.fetch.mock.calls[0];
      expect(call[0]).toBe('https://api.xiaomimimo.com/v1/chat/completions');
      expect(call[1].headers.Authorization).toBe('Bearer sk-mimo');
    });

    it('system 参数应拼接到 messages 首位', async () => {
      const { chatCompletion } = loadClient({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai'
      });
      mockFetch([okResponse({ choices: [{ message: { content: 'ok' } }] })]);

      await chatCompletion([{ role: 'user', content: 'hi' }], { system: '你是助手' });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({ role: 'system', content: '你是助手' });
    });

    it('options 应正确传入 maxTokens/temperature', async () => {
      const { chatCompletion } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([okResponse({ message: { content: 'ok' } })]);

      await chatCompletion([{ role: 'user', content: 'hi' }], { maxTokens: 50, temperature: 0.2 });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.options.num_predict).toBe(50);
      expect(body.options.temperature).toBe(0.2);
    });
  });

  describe('getProviderStatus', () => {
    it('ollama 在线时应返回模型列表', async () => {
      const { getProviderStatus } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([okResponse({ models: [{ name: 'qwen2.5:3b' }, { name: 'llama3' }] })]);

      const status = await getProviderStatus();
      expect(status.online).toBe(true);
      expect(status.provider).toBe('ollama');
      expect(status.models).toEqual(['qwen2.5:3b', 'llama3']);
      expect(status.supportsImage).toBe(false);
    });

    it('ollama 离线时应返回 online false', async () => {
      const { getProviderStatus } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([failResponse(503)]);

      const status = await getProviderStatus();
      expect(status.online).toBe(false);
      expect(status.model).toBe('qwen2.5:3b');
    });

    it('ollama 异常时应捕获并返回 offline', async () => {
      const { getProviderStatus } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([new Error('connect refused')]);

      const status = await getProviderStatus();
      expect(status.online).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });

    it('openai 在线时应返回模型列表并标记图片支持', async () => {
      const { getProviderStatus } = loadClient({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai',
        OPENAI_MODEL: 'gpt-4o'
      });
      mockFetch([okResponse({ data: [{ id: 'gpt-4o' }, { id: 'gpt-3.5-turbo' }] })]);

      const status = await getProviderStatus();
      expect(status.online).toBe(true);
      expect(status.provider).toBe('openai');
      expect(status.models).toEqual(['gpt-4o', 'gpt-3.5-turbo']);
      expect(status.supportsImage).toBe(true);
    });

    it('openai 离线时应返回 online false', async () => {
      const { getProviderStatus } = loadClient({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai',
        OPENAI_MODEL: 'gpt-3.5-turbo'
      });
      mockFetch([failResponse(401, { error: { message: 'unauthorized' } })]);

      const status = await getProviderStatus();
      expect(status.online).toBe(false);
      expect(status.supportsImage).toBe(false);
    });

    it('mimo 在线时应返回模型列表', async () => {
      const { getProviderStatus } = loadClient({
        AI_PROVIDER: 'mimo',
        MIMO_API_KEY: 'sk-mimo'
      });
      mockFetch([okResponse({ data: [{ id: 'mimo-v2.5-flash' }] })]);

      const status = await getProviderStatus();
      expect(status.online).toBe(true);
      expect(status.provider).toBe('mimo');
      expect(status.models).toEqual(['mimo-v2.5-flash']);
    });

    it('模型列表为空时应回退到当前 model', async () => {
      const { getProviderStatus } = loadClient({ AI_PROVIDER: 'ollama' });
      mockFetch([okResponse({ models: [] })]);

      const status = await getProviderStatus();
      expect(status.models).toEqual(['qwen2.5:3b']);
    });
  });
});

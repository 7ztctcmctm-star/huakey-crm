require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');

const app = express();

const config = {
  corpId: process.env.WECOM_CORP_ID,
  agentId: Number(process.env.WECOM_AGENT_ID),
  corpSecret: process.env.WECOM_SECRET,
  token: process.env.WECOM_TOKEN,
  aesKey: Buffer.from(process.env.WECOM_AES_KEY + '=', 'base64'),
  deepseekKey: process.env.DEEPSEEK_API_KEY,
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  port: Number(process.env.PORT) || 3000,
};

// ========== 工具函数 ==========

function pkcs7Pad(buf) {
  const n = 32 - (buf.length % 32);
  return Buffer.concat([buf, Buffer.alloc(n, n)]);
}

function pkcs7Unpad(buf) {
  return buf.slice(0, buf.length - buf[buf.length - 1]);
}

function decryptMsg(encrypted) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', config.aesKey, config.aesKey.slice(0, 16));
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  const unpadded = pkcs7Unpad(decrypted);
  const msgLen = unpadded.readUInt32BE(16);
  return unpadded.slice(20, 20 + msgLen).toString('utf8');
}

function encryptMsg(plain) {
  const content = Buffer.from(plain, 'utf8');
  const padded = pkcs7Pad(Buffer.concat([
    crypto.randomBytes(16),
    Buffer.alloc(4),
    content,
  ]));
  padded.writeUInt32BE(content.length, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', config.aesKey, config.aesKey.slice(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function verifySignature(timestamp, nonce, encrypted) {
  const sorted = [config.token, timestamp, nonce, encrypted].sort();
  return crypto.createHash('sha1').update(sorted.join('')).digest('hex');
}

function parseXml(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { explicitArray: false, trim: true }, (err, result) => {
      if (err) reject(err);
      else resolve(result.xml);
    });
  });
}

function replyXml(fromUser, toUser, content) {
  const ts = Math.floor(Date.now() / 1000);
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<xml>
<ToUserName><![CDATA[${toUser}]]></ToUserName>
<FromUserName><![CDATA[${fromUser}]]></FromUserName>
<CreateTime>${ts}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${escaped}]]></Content>
</xml>`;
}

// ========== DeepSeek API ==========

async function chatWithDeepSeek(userMessage) {
  const resp = await axios.post('https://api.deepseek.com/v1/chat/completions', {
    model: config.deepseekModel,
    messages: [
      { role: 'system', content: '你是一个智能助手，用中文简洁明了地回答问题。' },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 2048,
  }, {
    headers: {
      Authorization: `Bearer ${config.deepseekKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });
  return resp.data.choices[0].message.content;
}

// ========== 企业微信 API ==========

let tokenCache = { token: null, expires: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expires) return tokenCache.token;
  const resp = await axios.get(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${config.corpId}&corpsecret=${config.corpSecret}`
  );
  if (resp.data.errcode) throw new Error(`获取 token 失败: ${resp.data.errmsg}`);
  tokenCache = { token: resp.data.access_token, expires: Date.now() + 7000 * 1000 };
  return resp.data.access_token;
}

async function replyViaAPI(toUser, content) {
  const token = await getAccessToken();
  const resp = await axios.post(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
    {
      touser: toUser,
      msgtype: 'text',
      agentid: config.agentId,
      text: { content },
    }
  );
  if (resp.data.errcode) console.error('回复失败:', resp.data.errmsg);
  return resp.data;
}

// ========== 处理消息 ==========

const processing = new Set();

async function handleEncrypted(encrypted, timestamp, nonce, signature) {
  if (verifySignature(timestamp, nonce, encrypted) !== signature) {
    console.error('签名校验失败');
    return null;
  }
  const xml = decryptMsg(encrypted);
  console.log('解密消息:', xml);
  const msg = await parseXml(xml);

  const content = msg.Content;
  const fromUser = msg.FromUserName;
  const msgType = msg.MsgType;

  if (msgType !== 'text' || !content) return encryptMsg(replyXml(config.corpId, fromUser, '目前仅支持文字消息'));
  if (processing.has(fromUser)) return encryptMsg(replyXml(config.corpId, fromUser, '正在处理上一条消息，请稍候...'));

  processing.add(fromUser);
  try {
    console.log(`[收到] ${fromUser}: ${content}`);
    const reply = await chatWithDeepSeek(content);
    console.log(`[回复] ${reply.slice(0, 100)}...`);
    return encryptMsg(replyXml(config.corpId, fromUser, reply));
  } catch (err) {
    console.error('处理消息失败:', err.message);
    return encryptMsg(replyXml(config.corpId, fromUser, '抱歉，处理您的消息时出错了，请稍后重试。'));
  } finally {
    processing.delete(fromUser);
  }
}

// ========== HTTP 路由 ==========

// 回调验证（GET）— 企业微信配置回调 URL 时会发 GET 请求
app.get('/wecom', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query;
  try {
    const decrypted = decryptMsg(echostr);
    console.log('回调验证成功');
    res.send(decrypted);
  } catch (err) {
    console.error('回调验证失败:', err.message);
    res.status(400).send('验证失败');
  }
});

// 接收消息（POST）
app.post('/wecom', express.text({ type: '*/*' }), async (req, res) => {
  const { msg_signature, timestamp, nonce } = req.query;
  try {
    const msg = await parseXml(req.body);
    const encrypted = msg.Encrypt;
    const xml = await handleEncrypted(encrypted, timestamp, nonce, msg_signature);
    if (xml) res.type('application/xml').send(xml);
    else res.send('success');
  } catch (err) {
    console.error('消息处理异常:', err.message);
    res.send('success');
  }
});

// 健康检查
app.get('/', (req, res) => res.send('企业微信 DeepSeek 机器人运行中'));

// ========== 启动 ==========

app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n✅ 服务启动: http://0.0.0.0:${config.port}`);
  console.log(`   回调地址: http://你的公网IP:${config.port}/wecom`);
});

const https = require('https');

// 企业微信 webhook 地址
const WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=aibIdYapN5AKF0cWuHFfwAQsV0vQN6H-OLJtnN7El3Fqh9HWMVEKAx7H9hXIvaCHo3brkuLHce6068';

/**
 * 发送企业微信文本消息
 * @param {string} content - 消息内容
 * @param {string[]} mentionedList - @的成员列表，可选
 */
async function sendText(content, mentionedList = []) {
  const payload = {
    msgtype: 'text',
    text: { content, mentioned_list: mentionedList }
  };
  return sendWebhook(payload);
}

/**
 * 发送企业微信 Markdown 消息
 * @param {string} content - Markdown 内容
 */
async function sendMarkdown(content) {
  const payload = {
    msgtype: 'markdown',
    markdown: { content }
  };
  return sendWebhook(payload);
}

/**
 * 发送跟进提醒通知
 * @param {Object} data - 提醒数据
 */
async function sendFollowupReminder(data) {
  const { customerName, ownerName, type, overdueDays, nextTime } = data;

  let title, content;

  switch (type) {
    case 'overdue':
      title = '⚠️ 逾期跟进提醒';
      content = `客户 ${customerName} 已 ${overdueDays}天 未跟进\n> 请及时安排回访或联系沟通`;
      break;
    case 'today':
      title = '📅 今日待跟进';
      content = `客户 ${customerName} 今天需要跟进\n> 请查看跟进计划并及时处理`;
      break;
    case 'upcoming':
      title = '📆 明日待跟进';
      content = `客户 ${customerName} 明天需要跟进\n> 时间: ${nextTime}`;
      break;
    default:
      return;
  }

  const markdown = `## ${title}\n${content}\n> 负责人: @${ownerName}`;
  return sendMarkdown(markdown);
}

/**
 * 发送回款逾期通知
 * @param {Object} data - 回款数据
 */
async function sendPaymentOverdue(data) {
  const { contractNo, customerName, amount, overdueDays, ownerName } = data;
  const markdown = `## 💰 回款逾期提醒\n合同 ${contractNo} 回款已逾期 ${overdueDays}天\n> 客户: ${customerName}\n> 金额: ¥${amount.toLocaleString()}\n> 负责人: @${ownerName}`;
  return sendMarkdown(markdown);
}

/**
 * 发送商机提醒通知
 * @param {Object} data - 商机数据
 */
async function sendOpportunityReminder(data) {
  const { oppName, customerName, stage, expectedAmount, ownerName } = data;
  const markdown = `## 🎯 商机提醒\n商机 ${oppName} 需要关注\n> 客户: ${customerName}\n> 阶段: ${stage}\n> 预期金额: ¥${expectedAmount.toLocaleString()}\n> 负责人: @${ownerName}`;
  return sendMarkdown(markdown);
}

/**
 * 发送 webhook 请求
 * @param {Object} payload - 请求体
 */
function sendWebhook(payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(WEBHOOK_URL);
    const data = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.errcode === 0) {
            console.log('[企业微信] 消息发送成功');
            resolve(result);
          } else {
            console.error('[企业微信] 发送失败:', result.errmsg);
            reject(new Error(result.errmsg));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[企业微信] 请求失败:', e.message);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

module.exports = {
  sendText,
  sendMarkdown,
  sendFollowupReminder,
  sendPaymentOverdue,
  sendOpportunityReminder
};

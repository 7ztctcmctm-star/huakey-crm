const https = require('https');
const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// 企业微信 webhook 地址
const WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || '';

// 邮件告警配置
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;
const emailEnabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_EMAIL_TO);

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
 * 发送邮件告警
 * @param {Object} context
 * @param {string} context.level - 告警级别
 * @param {string} context.source - 错误来源
 * @param {string} context.message - 错误详情
 * @param {string} [context.traceId] - 追踪 ID
 * @param {string} [context.timestamp] - 时间戳
 */
async function sendEmailAlert(context) {
  if (!emailEnabled) return;

  const { level = 'error', source, message, traceId = 'N/A', timestamp } = context;
  const time = timestamp || new Date().toISOString();

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const subject = `[CRM 告警] ${level === 'critical' ? '[严重]' : '[警告]'} ${source}`;
  const text = [
    `时间: ${time}`,
    `级别: ${level}`,
    `来源: ${source}`,
    `TraceID: ${traceId}`,
    `详情: ${(message || '未知错误').slice(0, 2000)}`
  ].join('\n');

  try {
    await transporter.sendMail({
      from: `"CRM 告警" <${SMTP_USER}>`,
      to: ALERT_EMAIL_TO,
      subject,
      text
    });
  } catch (e) {
    logger.error('[邮件告警] 发送失败:', e.message);
  }
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
            logger.info('[企业微信] 消息发送成功');
            resolve(result);
          } else {
            logger.error('[企业微信] 发送失败:', result.errmsg);
            reject(new Error(result.errmsg));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      logger.error('[企业微信] 请求失败:', e.message);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

module.exports = {
  sendText,
  sendMarkdown,
  sendEmailAlert,
  sendFollowupReminder,
  sendPaymentOverdue,
  sendOpportunityReminder
};

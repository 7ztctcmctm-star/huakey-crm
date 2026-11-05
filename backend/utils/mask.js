const maskPhone = (phone) => {
  if (!phone) return '';
  const str = String(phone);
  if (str.length >= 7) {
    return str.substring(0, 3) + '****' + str.substring(str.length - 4);
  }
  return '****';
};

const maskEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '****@****.***';
  const maskedLocal = local.length > 2 
    ? local[0] + '***' + local[local.length - 1]
    : '***';
  return maskedLocal + '@' + domain;
};

const maskIdCard = (idCard) => {
  if (!idCard) return '';
  const str = String(idCard);
  if (str.length >= 8) {
    return str.substring(0, 4) + '**********' + str.substring(str.length - 4);
  }
  return '**********';
};

const maskBankCard = (cardNo) => {
  if (!cardNo) return '';
  const str = String(cardNo).replace(/\s/g, '');
  if (str.length > 4) {
    return '**** **** **** ' + str.substring(str.length - 4);
  }
  return '**** **** **** ****';
};

const maskBankAccount = (account) => {
  if (!account) return '';
  const str = String(account).replace(/\s/g, '');
  if (str.length > 4) {
    return '*'.repeat(str.length - 4) + str.substring(str.length - 4);
  }
  return '****';
};

const maskTaxId = (taxId) => {
  if (!taxId) return '';
  const str = String(taxId);
  if (str.length > 6) {
    return str.substring(0, 3) + '*'.repeat(str.length - 6) + str.substring(str.length - 3);
  }
  return '*'.repeat(str.length);
};

const maskAddress = (address) => {
  if (!address) return '';
  const str = String(address);
  if (str.length <= 6) return '*'.repeat(str.length);
  return str.substring(0, 3) + '*'.repeat(str.length - 6) + str.substring(str.length - 3);
};

const maskName = (name) => {
  if (!name) return '';
  const str = String(name).trim();
  if (str.length <= 1) return '*';
  if (str.length === 2) return str[0] + '*';
  return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
};

const maskSensitiveData = (data, fields = []) => {
  if (!data || !Array.isArray(fields)) return data;
  
  const result = { ...data };
  
  for (const field of fields) {
    if (result[field]) {
      switch (field.toLowerCase()) {
        case 'phone':
        case 'mobile':
        case 'telephone':
          result[field] = maskPhone(result[field]);
          break;
        case 'email':
          result[field] = maskEmail(result[field]);
          break;
        case 'id_card':
        case 'idcard':
          result[field] = maskIdCard(result[field]);
          break;
        case 'bank_card':
        case 'bankcard':
        case 'account_no':
        case 'credit_card':
        case 'creditcard':
          result[field] = maskBankCard(result[field]);
          break;
        case 'bank_account':
        case 'bankaccount':
          result[field] = maskBankAccount(result[field]);
          break;
        case 'tax_id':
        case 'taxid':
          result[field] = maskTaxId(result[field]);
          break;
        case 'address':
          result[field] = maskAddress(result[field]);
          break;
        case 'contact_phone':
          result[field] = maskPhone(result[field]);
          break;
        case 'contact_email':
          result[field] = maskEmail(result[field]);
          break;
        case 'passport':
          result[field] = maskIdCard(result[field]);
          break;
        case 'ssn':
          result[field] = maskIdCard(result[field]);
          break;
        // 业务敏感字段（与 fieldPermissions.js 对齐）
        case 'cost_price':
        case 'unit_price':
        case 'total_price':
        case 'amount':
          result[field] = '******';
          break;
        case 'password':
        case 'pwd':
          delete result[field];
          break;
      }
    }
  }

  return result;
}

// 日志脱敏：自动识别常见敏感字段并脱敏
const SENSITIVE_FIELDS = {
  password: '******',
  old_password: '******',
  new_password: '******',
  confirm_password: '******',
  pwd: '******',
  token: '******',
  access_token: '******',
  refresh_token: '******',
  authorization: '******',
  cookie: '******',
  api_key: '******',
  apikey: '******',
  secret: '******',
  client_secret: '******',
  app_secret: '******',
  webhook_url: '******',
  webhook_key: '******',
  signature: '******'
};

const MASK_FIELDS = [
  'phone', 'mobile', 'telephone', 'email', 'id_card', 'idcard',
  'bank_card', 'bankcard', 'account_no', 'credit_card', 'creditcard',
  'bank_account', 'bankaccount', 'tax_id', 'taxid', 'address',
  'contact_phone', 'contact_email', 'passport', 'ssn',
  // 业务敏感字段（与 fieldPermissions.js 对齐）
  'cost_price', 'unit_price', 'total_price', 'amount'
];

/**
 * 按字段名对单个值脱敏
 * 用于字段级变更日志（changed_fields 的 old/new 值）和慢查询 params 脱敏
 * @param {string} fieldName - 字段名
 * @param {*} value - 字段值
 * @returns {*} 脱敏后的值
 */
function maskFieldValue(fieldName, value) {
  if (value === null || value === undefined) return value;
  const lowerKey = String(fieldName || '').toLowerCase();

  // 密码/令牌类字段：直接替换为固定占位符
  if (lowerKey in SENSITIVE_FIELDS) {
    return SENSITIVE_FIELDS[lowerKey];
  }

  // 其他敏感字段：部分脱敏（保留部分明文用于排查）
  if (MASK_FIELDS.includes(lowerKey)) {
    return maskSensitiveData({ [fieldName]: value }, [fieldName])[fieldName];
  }

  return value;
}

function maskLogParams(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();

    // 密码类字段：直接替换
    if (lowerKey in SENSITIVE_FIELDS) {
      result[key] = SENSITIVE_FIELDS[lowerKey];
      continue;
    }

    // 其他敏感字段：部分脱敏
    if (MASK_FIELDS.includes(lowerKey)) {
      result[key] = maskSensitiveData({ [key]: result[key] }, [key])[key];
      continue;
    }

    // 嵌套对象：递归处理
    if (result[key] && typeof result[key] === 'object' && !(result[key] instanceof Date)) {
      result[key] = maskLogParams(result[key]);
    }
  }

  return result;
}

// ============ 日志文本脱敏（审计 2026-10-23 · P1-20） ============
// 慢查询参数与操作日志 URL 是位置化的字符串/查询串，拿不到字段名，
// 只能按“可识别模式”兜底脱敏。目标是避免手机号/邮箱/身份证/银行卡/
// JWT/bcrypt 哈希/长 hex 口令进入持久化日志，同时保留排查所需的形态。
const PII_PATTERNS = {
  // local part 允许 *：让已脱敏的 a***e@example.com 整体命中并原样返回，
  // 避免二次脱敏把尾部 e 再当成一个 local part（a******@example.com）。
  email: /[A-Za-z0-9._%+*-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  jwt: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  bcrypt: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g,
  idCard: /(?<!\d)\d{17}[\dXx](?!\d)/g,
  mobile: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  bankCard: /(?<!\d)\d{16,19}(?!\d)/g,
  longHex: /(?<![A-Za-z0-9])[a-fA-F0-9]{32,}(?![A-Za-z0-9])/g
};

/**
 * 对任意文本中的可识别敏感值脱敏。
 * 非字符串按 String() 处理，null/undefined 原样返回。
 */
function maskPIIString(value) {
  if (value === null || value === undefined) return value;
  let str = String(value);
  str = str.replace(PII_PATTERNS.email, (m) => (m.includes('*') ? m : maskEmail(m)));
  str = str.replace(PII_PATTERNS.jwt, '[JWT]');
  str = str.replace(PII_PATTERNS.bcrypt, '[bcrypt]');
  str = str.replace(PII_PATTERNS.idCard, (m) => maskIdCard(m));
  str = str.replace(PII_PATTERNS.mobile, (m) => maskPhone(m));
  str = str.replace(PII_PATTERNS.bankCard, (m) => maskBankCard(m));
  str = str.replace(PII_PATTERNS.longHex, '[redacted]');
  return str;
}

/**
 * 对 URL 查询串按字段名脱敏，再对值做模式兜底。
 * 例：/list?phone=13800138000&email=a%40b.com&keyword=联系我
 *  →  /list?phone=138****8000&email=a***%40b.com&keyword=联系我
 */
function maskUrlQuery(url) {
  if (typeof url !== 'string' || url === '') return url;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return maskPIIString(url);

  const base = url.slice(0, qIndex);
  const hashIndex = url.indexOf('#', qIndex);
  const query = url.slice(qIndex + 1, hashIndex === -1 ? undefined : hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);

  const maskedQuery = query.split('&').map((pair) => {
    if (pair === '') return pair;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);

    let key = rawKey;
    let value = rawValue;
    try { key = decodeURIComponent(rawKey.replace(/\+/g, ' ')); } catch (_) { /* 保留原串 */ }
    try { value = decodeURIComponent(rawValue.replace(/\+/g, ' ')); } catch (_) { /* 保留原串 */ }

    // 兼容 phone[]=... 这类数组参数：按去掉 [] 的字段名判断敏感性
    const lookupKey = key.toLowerCase().replace(/\[\]$/, '');
    const keyIsSensitive = lookupKey in SENSITIVE_FIELDS || MASK_FIELDS.includes(lookupKey);
    // 已知敏感字段按字段规则脱敏后不再二次处理；未知字段按 PII 模式兜底。
    const maskedValue = keyIsSensitive
      ? String(maskFieldValue(lookupKey, value))
      : maskPIIString(value);
    return `${encodeURIComponent(maskPIIString(key))}=${encodeURIComponent(maskedValue)}`;
  }).join('&');

  return `${base}?${maskedQuery}${hash}`;
}

/**
 * 慢查询参数脱敏。
 * - 数组（mysql2 位置参数）：逐项脱敏，数字手机号也处理；
 * - 对象：按字段名脱敏；
 * - 字符串：按可识别模式脱敏。
 */
function maskSqlParams(params) {
  if (params === null || params === undefined) return params;
  if (Array.isArray(params)) return params.map(maskSqlParam);
  if (typeof params === 'object') return maskLogParams(params);
  return maskSqlParam(params);
}

function maskSqlParam(param) {
  if (typeof param === 'string') return maskPIIString(param);
  if (typeof param === 'number' && Number.isInteger(param) && /^1[3-9]\d{9}$/.test(String(param))) {
    return maskPhone(String(param));
  }
  if (param && typeof param === 'object' && !(param instanceof Date) && !Buffer.isBuffer(param)) {
    return maskLogParams(param);
  }
  return param;
}

/**
 * SQL 文本脱敏：兼容 mysql2 的 string 与 { sql, values } 两种入参。
 */
function maskSqlText(sql) {
  if (typeof sql === 'string') return maskPIIString(sql);
  if (sql && typeof sql === 'object') {
    try {
      return maskPIIString(JSON.stringify(maskLogParams(sql)));
    } catch (_) {
      return '[unserializable SQL]';
    }
  }
  return maskPIIString(String(sql));
}

module.exports = {
  maskPhone,
  maskEmail,
  maskIdCard,
  maskBankCard,
  maskBankAccount,
  maskTaxId,
  maskAddress,
  maskName,
  maskSensitiveData,
  maskFieldValue,
  maskLogParams,
  maskPIIString,
  maskUrlQuery,
  maskSqlParams,
  maskSqlText
};

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
  maskLogParams
};

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
          result[field] = maskBankCard(result[field]);
          break;
        case 'password':
        case 'pwd':
          delete result[field];
          break;
      }
    }
  }
  
  return result;
};

module.exports = {
  maskPhone,
  maskEmail,
  maskIdCard,
  maskBankCard,
  maskName,
  maskSensitiveData
};

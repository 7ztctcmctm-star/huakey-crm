/**
 * 日志脱敏工具单元测试
 */

const {
  maskName,
  maskSensitiveData,
  maskLogParams
} = require('../utils/mask');

describe('mask 工具', () => {
  describe('maskLogParams', () => {
    it('应替换密码类字段为 ******', () => {
      const result = maskLogParams({
        username: 'admin',
        password: 'Secret123',
        old_password: 'OldPass1',
        new_password: 'NewPass1',
        confirm_password: 'NewPass1',
        pwd: 'short'
      });

      expect(result.password).toBe('******');
      expect(result.old_password).toBe('******');
      expect(result.new_password).toBe('******');
      expect(result.confirm_password).toBe('******');
      expect(result.pwd).toBe('******');
      expect(result.username).toBe('admin');
    });

    it('应替换 token/secret 类字段为 ******', () => {
      const result = maskLogParams({
        token: 'jwt_token_value',
        access_token: 'access_value',
        refresh_token: 'refresh_value',
        authorization: 'Bearer xxx',
        cookie: 'token=abc',
        api_key: 'key123',
        secret: 'shhh',
        client_secret: 'client_shhh',
        webhook_url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx',
        webhook_key: 'webhook_xxx'
      });

      expect(result.token).toBe('******');
      expect(result.access_token).toBe('******');
      expect(result.refresh_token).toBe('******');
      expect(result.authorization).toBe('******');
      expect(result.cookie).toBe('******');
      expect(result.api_key).toBe('******');
      expect(result.secret).toBe('******');
      expect(result.client_secret).toBe('******');
      expect(result.webhook_url).toBe('******');
      expect(result.webhook_key).toBe('******');
    });

    it('应对手机号/邮箱/身份证/银行卡进行部分脱敏', () => {
      const result = maskLogParams({
        phone: '13800138000',
        mobile: '13800138000',
        email: 'admin@example.com',
        id_card: '110101199001011234',
        bank_card: '6222021234567890123',
        account_no: '1234567890123'
      });

      expect(result.phone).toBe('138****8000');
      expect(result.mobile).toBe('138****8000');
      expect(result.email).toBe('a***n@example.com');
      expect(result.id_card).toBe('1101**********1234');
      expect(result.bank_card).toBe('**** **** **** 0123');
      expect(result.account_no).toBe('**** **** **** 0123');
    });

    it('应对项目敏感字段进行部分脱敏', () => {
      const result = maskLogParams({
        bank_account: '6222021234567890123',
        tax_id: '91110000123456789X',
        contact_phone: '13800138000',
        contact_email: 'supplier@example.com',
        address: '北京市朝阳区建国路88号'
      });

      expect(result.bank_account).toBe('***************0123');
      expect(result.tax_id).toBe('911************89X');
      expect(result.contact_phone).toBe('138****8000');
      expect(result.contact_email).toBe('s***r@example.com');
      expect(result.address).toBe('北京市******88号');
    });

    it('应递归处理嵌套对象和数组', () => {
      const result = maskLogParams({
        user: {
          phone: '13800138000',
          password: 'Secret123',
          profile: {
            email: 'nested@example.com'
          }
        },
        items: [
          { bank_account: '6222021234567890123' }
        ]
      });

      expect(result.user.phone).toBe('138****8000');
      expect(result.user.password).toBe('******');
      expect(result.user.profile.email).toBe('n***d@example.com');
      expect(result.items[0].bank_account).toBe('***************0123');
    });

    it('对非对象输入应原样返回', () => {
      expect(maskLogParams(null)).toBe(null);
      expect(maskLogParams(undefined)).toBe(undefined);
      expect(maskLogParams('string')).toBe('string');
      expect(maskLogParams(123)).toBe(123);
    });
  });

  describe('maskSensitiveData', () => {
    it('应按指定字段脱敏', () => {
      const result = maskSensitiveData(
        { phone: '13800138000', email: 'admin@example.com', name: '张三' },
        ['phone', 'email']
      );

      expect(result.phone).toBe('138****8000');
      expect(result.email).toBe('a***n@example.com');
      expect(result.name).toBe('张三');
    });
  });

  describe('maskName', () => {
    it('应对姓名脱敏', () => {
      expect(maskName('张三')).toBe('张*');
      expect(maskName('张三丰')).toBe('张*丰');
      expect(maskName('欧阳锋')).toBe('欧*锋');
      expect(maskName('A')).toBe('*');
    });
  });
});

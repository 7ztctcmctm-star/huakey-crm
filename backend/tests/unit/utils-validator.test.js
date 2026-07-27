/**
 * DataValidator 单元测试
 */
const DataValidator = require('../../utils/validator');

describe('DataValidator', () => {
  describe('required', () => {
    it('空值应报错', () => {
      const v = new DataValidator([
        { column_name: 'name', rule_type: 'required' }
      ]);
      const r = v.validate({ name: '' });
      expect(r.valid).toBe(false);
      expect(r.errors[0].message).toBe('name 不能为空');
    });

    it('null/undefined 应报错', () => {
      const v = new DataValidator([
        { column_name: 'a', rule_type: 'required' }
      ]);
      const r = v.validate({ a: null });
      expect(r.errors).toHaveLength(1);
      expect(v.validate({}).errors[0].message).toBe('a 不能为空');
    });

    it('有值时应通过', () => {
      const v = new DataValidator([
        { column_name: 'name', rule_type: 'required' }
      ]);
      expect(v.validate({ name: 'X' }).valid).toBe(true);
    });

    it('应使用自定义错误信息', () => {
      const v = new DataValidator([
        { column_name: 'name', rule_type: 'required', error_message: '必填' }
      ]);
      expect(v.validate({}).errors[0].message).toBe('必填');
    });
  });

  describe('format', () => {
    it('缺少 pattern 时应跳过', () => {
      const v = new DataValidator([
        { column_name: 'email', rule_type: 'format', rule_config: {} }
      ]);
      expect(v.validate({ email: 'x' }).valid).toBe(true);
    });

    it('空值时应通过', () => {
      const v = new DataValidator([
        { column_name: 'email', rule_type: 'format', rule_config: { pattern: '^\\S+@\\S+$' } }
      ]);
      expect(v.validate({ email: '' }).valid).toBe(true);
    });

    it('不匹配时应报错', () => {
      const v = new DataValidator([
        { column_name: 'email', rule_type: 'format', rule_config: { pattern: '^\\S+@\\S+$' } }
      ]);
      const r = v.validate({ email: 'not-email' });
      expect(r.valid).toBe(false);
      expect(r.errors[0].message).toBe('email 格式不正确');
    });

    it('匹配时应通过', () => {
      const v = new DataValidator([
        { column_name: 'email', rule_type: 'format', rule_config: { pattern: '^\\S+@\\S+$' } }
      ]);
      expect(v.validate({ email: 'a@b.c' }).valid).toBe(true);
    });

    it('rule_config 为 JSON 字符串时应解析', () => {
      const v = new DataValidator([
        { column_name: 'phone', rule_type: 'format', rule_config: '{"pattern":"^1\\\\d{10}$"}' }
      ]);
      expect(v.validate({ phone: '13800138000' }).valid).toBe(true);
      expect(v.validate({ phone: 'abc' }).valid).toBe(false);
    });

    it('自定义错误信息应生效', () => {
      const v = new DataValidator([
        { column_name: 'code', rule_type: 'format', rule_config: { pattern: '^[A-Z]+$' }, error_message: '必须大写' }
      ]);
      expect(v.validate({ code: 'abc' }).errors[0].message).toBe('必须大写');
    });
  });

  describe('range', () => {
    it('values 不匹配时应报错', () => {
      const v = new DataValidator([
        { column_name: 'level', rule_type: 'range', rule_config: { values: ['A', 'B'] } }
      ]);
      const r = v.validate({ level: 'C' });
      expect(r.valid).toBe(false);
      expect(r.errors[0].message).toBe('level 值不在允许范围内');
    });

    it('min/max 数值范围应生效', () => {
      const v = new DataValidator([
        { column_name: 'age', rule_type: 'range', rule_config: { min: 18, max: 60 } }
      ]);
      expect(v.validate({ age: 17 }).valid).toBe(false);
      expect(v.validate({ age: 61 }).valid).toBe(false);
      expect(v.validate({ age: 30 }).valid).toBe(true);
    });

    it('空值时应跳过范围校验', () => {
      const v = new DataValidator([
        { column_name: 'age', rule_type: 'range', rule_config: { min: 18 } }
      ]);
      expect(v.validate({ age: '' }).valid).toBe(true);
      expect(v.validate({ age: null }).valid).toBe(true);
    });

    it('values 匹配时应通过', () => {
      const v = new DataValidator([
        { column_name: 'level', rule_type: 'range', rule_config: { values: ['A', 'B'] } }
      ]);
      expect(v.validate({ level: 'A' }).valid).toBe(true);
    });
  });

  describe('is_active=0', () => {
    it('应跳过禁用规则', () => {
      const v = new DataValidator([
        { column_name: 'name', rule_type: 'required', is_active: 0 }
      ]);
      expect(v.validate({}).valid).toBe(true);
    });
  });

  describe('validateBatch', () => {
    it('应分离有效和无效记录', () => {
      const v = new DataValidator([
        { column_name: 'name', rule_type: 'required' }
      ]);
      const result = v.validateBatch([
        { name: 'A' },
        { name: '' },
        { name: 'B' }
      ]);
      expect(result.validRecords).toHaveLength(2);
      expect(result.invalidRecords).toHaveLength(1);
    });
  });
});

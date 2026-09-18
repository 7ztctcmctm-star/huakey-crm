/**
 * aiRouteService —— Text-to-SQL 维度白名单 + 图表建议 单元测试
 * 覆盖 R-09：仅允许 商机/客户/合同 维度、SELECT-only 已在 executeReadOnlyQuery 中校验。
 */

const aiRouteService = require('../../services/aiRouteService');

describe('aiRouteService Text-to-SQL 安全与图表', () => {
  describe('validateQueryDimension', () => {
    it('允许 crm_customer', () => {
      expect(aiRouteService.validateQueryDimension('SELECT * FROM crm_customer WHERE status != 0').ok).toBe(true);
    });
    it('允许带别名的 crm_opportunity', () => {
      expect(aiRouteService.validateQueryDimension('SELECT id, name FROM crm_opportunity o LIMIT 10').ok).toBe(true);
    });
    it('允许 crm_contract', () => {
      expect(aiRouteService.validateQueryDimension('SELECT COUNT(*) FROM crm_contract').ok).toBe(true);
    });
    it('拒绝 crm_supplier', () => {
      const r = aiRouteService.validateQueryDimension('SELECT * FROM crm_supplier');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('crm_supplier');
    });
    it('拒绝 crm_product', () => {
      expect(aiRouteService.validateQueryDimension('SELECT * FROM crm_product').ok).toBe(false);
    });
    it('拒绝系统表', () => {
      expect(aiRouteService.validateQueryDimension('SELECT * FROM sys_user').ok).toBe(false);
    });
    it('无表名时拒绝（宁严勿松）', () => {
      expect(aiRouteService.validateQueryDimension('SELECT 1').ok).toBe(false);
    });
  });

  describe('buildChartSuggestion', () => {
    it('空结果 → table', () => {
      const s = aiRouteService.buildChartSuggestion('SELECT * FROM crm_customer', []);
      expect(s.type).toBe('table');
    });

    it('单一汇总值 → table', () => {
      const s = aiRouteService.buildChartSuggestion('SELECT COUNT(*) AS c FROM crm_customer', [{ c: 42 }]);
      expect(s.type).toBe('table');
    });

    it('维度 + 数值（类别少）→ pie', () => {
      const s = aiRouteService.buildChartSuggestion('SELECT status, COUNT(*) c FROM crm_customer GROUP BY status', [
        { status: 'lead', c: 5 }, { status: 'signed', c: 3 }
      ]);
      expect(s.type).toBe('pie');
    });

    it('维度 + 数值（类别多）→ bar', () => {
      const s = aiRouteService.buildChartSuggestion('SELECT owner_id, COUNT(*) c FROM crm_customer GROUP BY owner_id',
        Array.from({ length: 10 }, (_, i) => ({ owner_id: i, c: i + 1 })));
      expect(s.type).toBe('bar');
    });

    it('含时间维度 → line', () => {
      const s = aiRouteService.buildChartSuggestion('SELECT sign_date, SUM(amount) a FROM crm_contract GROUP BY sign_date', [
        { sign_date: '2024-01-01', a: 100 }, { sign_date: '2024-02-01', a: 200 }
      ]);
      expect(s.type).toBe('line');
    });

    it('无数值列 → table', () => {
      const s = aiRouteService.buildChartSuggestion('SELECT company_name FROM crm_customer',
        [{ company_name: 'A' }, { company_name: 'B' }]);
      expect(s.type).toBe('table');
    });
  });
});

/**
 * automationService 单元测试
 */

const automationService = require('../../services/automationService');

jest.mock('../../utils/sseManager', () => ({
  send: jest.fn()
}));

function createMockPool() {
  return { query: jest.fn() };
}

describe('automationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWorkflows', () => {
    it('应返回工作流列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1, name: 'wf' }]]);

      const result = await automationService.getWorkflows(pool);
      expect(result).toHaveLength(1);
      expect(pool.query.mock.calls[0][0]).toContain('crm_workflow_rule');
    });
  });

  describe('createWorkflow', () => {
    it('应插入工作流并序列化条件和动作', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ insertId: 7 }]);

      const result = await automationService.createWorkflow(pool, {
        name: 'n', description: 'd', trigger_event: 'e', conditions: [{ a: 1 }], actions: [{ b: 2 }]
      }, 1);
      expect(result.id).toBe(7);
      const params = pool.query.mock.calls[0][1];
      expect(typeof params[3]).toBe('string');
      expect(typeof params[4]).toBe('string');
    });

    it('字符串条件应直接存入', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ insertId: 8 }]);

      await automationService.createWorkflow(pool, {
        name: 'n', trigger_event: 'e', conditions: '[{}]', actions: '[{}]'
      }, 1);
      expect(pool.query.mock.calls[0][1][3]).toBe('[{}]');
    });
  });

  describe('updateWorkflow', () => {
    it('空更新应返回 false', async () => {
      const result = await automationService.updateWorkflow(createMockPool(), 1, {});
      expect(result).toBe(false);
    });

    it('应动态更新字段', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.updateWorkflow(pool, 1, {
        name: 'n', conditions: [{ a: 1 }], actions: [{ b: 2 }], status: '1'
      });
      expect(result).toBe(true);
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('name = ?');
      expect(sql).toContain('conditions = ?');
      expect(sql).toContain('status = ?');
      expect(pool.query.mock.calls[0][1]).toContain(1);
    });
  });

  describe('toggleWorkflow', () => {
    it('不存在应返回 null', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[undefined]]);
      const result = await automationService.toggleWorkflow(pool, 1);
      expect(result).toBeNull();
    });

    it('应切换状态', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ status: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await automationService.toggleWorkflow(pool, 1);
      expect(result.status).toBe(0);
      expect(pool.query.mock.calls[1][1]).toEqual([0, 1]);
    });
  });

  describe('deleteWorkflow', () => {
    it('应软删除', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await automationService.deleteWorkflow(pool, 1);
      expect(pool.query.mock.calls[0][0]).toContain('deleted_at = NOW()');
    });
  });

  describe('executeWorkflow / executeActions', () => {
    function mockPoolForExecute(actions) {
      const pool = createMockPool();
      // 1. SELECT rule
      pool.query.mockResolvedValueOnce([[{ id: 1, actions: JSON.stringify(actions) }]]);
      return pool;
    }

    function queueActionMocks(pool, count, failFirst = false) {
      for (let i = 0; i < count; i++) {
        if (failFirst && i === 0) {
          pool.query.mockRejectedValueOnce(new Error('db error'));
        } else {
          pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        }
        // workflow log insert
        pool.query.mockResolvedValueOnce([{ insertId: i + 1 }]);
      }
      // update run_count
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    }

    it('assign 动作应更新 owner_id', async () => {
      const pool = mockPoolForExecute([{ type: 'assign', params: { user_id: 5 } }]);
      queueActionMocks(pool, 1);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].result).toBe('success');
      expect(pool.query).toHaveBeenCalledWith('UPDATE crm_customer SET owner_id = ? WHERE id = ?', [5, 10]);
    });

    it('notify 动作应插入通知并推送 SSE', async () => {
      const pool = mockPoolForExecute([{ type: 'notify', params: { title: 't', content: 'c', user_id: 3 } }]);
      queueActionMocks(pool, 1);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].result).toBe('success');
      const sseManager = require('../../utils/sseManager');
      expect(sseManager.send).toHaveBeenCalledWith(3, expect.objectContaining({ type: 'notification' }));
    });

    it('notify 无 user_id 时不推送 SSE', async () => {
      const pool = mockPoolForExecute([{ type: 'notify', params: { title: 't', content: 'c' } }]);
      queueActionMocks(pool, 1);

      await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      const sseManager = require('../../utils/sseManager');
      expect(sseManager.send).not.toHaveBeenCalled();
    });

    it('tag 动作应添加标签', async () => {
      const pool = mockPoolForExecute([{ type: 'tag', params: { tag_id: 9 } }]);
      queueActionMocks(pool, 1);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].result).toBe('success');
      expect(pool.query).toHaveBeenCalledWith('INSERT IGNORE INTO crm_customer_tag (customer_id, tag_id) VALUES (?, ?)', [10, 9]);
    });

    it('update_field 白名单外字段应跳过', async () => {
      const pool = mockPoolForExecute([{ type: 'update_field', params: { field: 'password', value: 'x' } }]);
      queueActionMocks(pool, 1);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].detail).toContain('不在白名单');
      expect(pool.query).not.toHaveBeenCalledWith(expect.stringContaining('password'), expect.anything());
    });

    it('update_field 白名单内字段应更新', async () => {
      const pool = mockPoolForExecute([{ type: 'update_field', params: { field: 'status', value: 'following' } }]);
      queueActionMocks(pool, 1);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].result).toBe('success');
      expect(pool.query).toHaveBeenCalledWith('UPDATE crm_customer SET status = ? WHERE id = ?', ['following', 10]);
    });

    it('update_field 更新 status 时应同步 business_status（防 NI-3 漂移）', async () => {
      const pool = mockPoolForExecute([{ type: 'update_field', params: { field: 'status', value: 'quoted' } }]);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].result).toBe('success');
      // 原 status 更新仍执行
      expect(pool.query).toHaveBeenCalledWith('UPDATE crm_customer SET status = ? WHERE id = ?', ['quoted', 10]);
      // 追加 business_status 同步（CASE 映射，sea/paused 兜底 following）
      const syncCall = pool.query.mock.calls.find(c => c[0].includes('business_status = CASE'));
      expect(syncCall).toBeTruthy();
      expect(syncCall[1]).toEqual(['quoted', 10]);
      expect(syncCall[0]).toContain("WHEN 'quoted' THEN 'quoted'");
    });

    it('update_field 更新非 status 字段不应触发 business_status 同步', async () => {
      const pool = mockPoolForExecute([{ type: 'update_field', params: { field: 'level', value: 'A' } }]);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(pool.query.mock.calls.some(c => c[0].includes('business_status = CASE'))).toBe(false);
    });

    it('create_followup 动作应创建跟进计划', async () => {
      const pool = mockPoolForExecute([{ type: 'create_followup', params: { plan_time: '2026-08-01', content: '跟进', user_id: 2 } }]);
      queueActionMocks(pool, 1);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].result).toBe('success');
    });

    it('未知动作类型应记录未知', async () => {
      const pool = mockPoolForExecute([{ type: 'unknown', params: {} }]);
      queueActionMocks(pool, 1);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].detail).toContain('未知动作类型');
    });

    it('动作异常应记录失败', async () => {
      const pool = mockPoolForExecute([{ type: 'assign', params: { user_id: 5 } }]);
      queueActionMocks(pool, 1, true);

      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result[0].result).toBe('failed');
    });

    it('找不到工作流应返回 null', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[undefined]]);
      const result = await automationService.executeWorkflow(pool, { rule_id: 1, target_type: 'customer', target_id: 10 });
      expect(result).toBeNull();
    });
  });

  describe('triggerWorkflow', () => {
    it('没有匹配规则时应返回 0 触发', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[]]);
      const result = await automationService.triggerWorkflow(pool, { event: 'e', target_type: 'customer', target_id: 1 });
      expect(result.triggered).toBe(0);
    });

    it('条件不满足时不触发', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, conditions: '[{"field":"status","operator":"equals","value":"signed"}]', actions: '[]' }]])
        .mockResolvedValueOnce([[{ status: 'following' }]]);

      const result = await automationService.triggerWorkflow(pool, { event: 'e', target_type: 'customer', target_id: 1 });
      expect(result.triggered).toBe(0);
    });

    it('条件满足时应触发', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, conditions: '[{"field":"status","operator":"equals","value":"following"}]', actions: '[{"type":"notify","params":{"title":"t"}}]' }]])
        .mockResolvedValueOnce([[{ status: 'following' }]]);
      // action notify + log + run_count
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.triggerWorkflow(pool, { event: 'e', target_type: 'customer', target_id: 1 });
      expect(result.triggered).toBe(1);
    });

    it('not_equals 条件不满足时不触发', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, conditions: '[{"field":"status","operator":"not_equals","value":"following"}]', actions: '[]' }]])
        .mockResolvedValueOnce([[{ status: 'following' }]]);

      const result = await automationService.triggerWorkflow(pool, { event: 'e', target_type: 'customer', target_id: 1 });
      expect(result.triggered).toBe(0);
    });

    it('条件解析失败应默认满足', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, conditions: 'invalid json', actions: '[{"type":"notify","params":{"title":"t"}}]' }]]);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.triggerWorkflow(pool, { event: 'e', target_type: 'customer', target_id: 1 });
      expect(result.triggered).toBe(1);
    });

    it('非 customer 目标类型条件分支不执行', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, conditions: '[{"field":"x","operator":"equals","value":"y"}]', actions: '[{"type":"notify","params":{"title":"t"}}]' }]]);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.triggerWorkflow(pool, { event: 'e', target_type: 'opportunity', target_id: 1 });
      expect(result.triggered).toBe(1);
    });
  });

  describe('getWorkflowLogs', () => {
    it('应分页返回日志', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 5 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);

      const result = await automationService.getWorkflowLogs(pool, { rule_id: 2, page: 2, pageSize: 10 });
      expect(result.total).toBe(5);
      expect(pool.query.mock.calls[1][1]).toContain(2);
    });

    it('无 rule_id 时不追加条件', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      await automationService.getWorkflowLogs(pool, {});
      expect(pool.query.mock.calls[0][0]).not.toContain('wl.rule_id = ?');
    });
  });

  describe('分配规则', () => {
    it('getAssignRules 应返回列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);
      const result = await automationService.getAssignRules(pool);
      expect(result).toHaveLength(1);
    });

    it('createAssignRule 应序列化 user_ids', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ insertId: 3 }]);
      await automationService.createAssignRule(pool, { rule_name: 'r', assign_type: 'round_robin', user_ids: [1, 2] });
      expect(typeof pool.query.mock.calls[0][1][4]).toBe('string');
    });

    it('updateAssignRule 空更新返回 false', async () => {
      const result = await automationService.updateAssignRule(createMockPool(), 1, {});
      expect(result).toBe(false);
    });

    it('deleteAssignRule 应物理删除', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await automationService.deleteAssignRule(pool, 1);
      expect(pool.query.mock.calls[0][0]).toContain('DELETE FROM crm_assign_rule');
    });

    it('applyAssignRule 空 ids 返回空数组', async () => {
      const result = await automationService.applyAssignRule(createMockPool(), {});
      expect(result).toEqual([]);
    });

    it('applyAssignRule round_robin 分配', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'round_robin', user_ids: '[10,20]', last_assigned_index: 0, rule_name: 'r' }]])
        .mockResolvedValueOnce([[{ id: 5, source: 'web', address: 'bj' }]]);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.applyAssignRule(pool, { customer_id: 5 });
      expect(result[0].user_id).toBe(10);
    });

    it('applyAssignRule by_source 匹配', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'by_source', source_value: 'web', user_ids: '[30]', last_assigned_index: 0, rule_name: 'r' }]])
        .mockResolvedValueOnce([[{ id: 5, source: 'web' }]]);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.applyAssignRule(pool, { customer_id: 5 });
      expect(result[0].user_id).toBe(30);
    });

    it('applyAssignRule by_region 匹配', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'by_region', region_value: '上海', user_ids: '[40]', last_assigned_index: 0, rule_name: 'r' }]])
        .mockResolvedValueOnce([[{ id: 5, source: 'web', address: '上海市' }]]);
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await automationService.applyAssignRule(pool, { customer_id: 5 });
      expect(result[0].user_id).toBe(40);
    });

    it('applyAssignRule 无匹配规则返回 no_match', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'by_source', source_value: 'offline', user_ids: '[40]', last_assigned_index: 0, rule_name: 'r' }]])
        .mockResolvedValueOnce([[{ id: 5, source: 'web' }]]);

      const result = await automationService.applyAssignRule(pool, { customer_id: 5 });
      expect(result[0].result).toBe('no_match');
    });

    it('applyAssignRule 客户不存在返回 not_found', async () => {
      const pool = createMockPool();
      pool.query
        .mockResolvedValueOnce([[{ id: 1, assign_type: 'round_robin', user_ids: '[10]', last_assigned_index: 0, rule_name: 'r' }]])
        .mockResolvedValueOnce([[undefined]]);

      const result = await automationService.applyAssignRule(pool, { customer_id: 5 });
      expect(result[0].result).toBe('not_found');
    });
  });

  describe('智能提醒', () => {
    it('getSmartReminders 应返回列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);
      const result = await automationService.getSmartReminders(pool);
      expect(result).toHaveLength(1);
    });

    it('createSmartReminder 应序列化 config', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ insertId: 4 }]);
      await automationService.createSmartReminder(pool, { name: 'n', reminder_type: 't', config: { days: 7 } }, 1);
      expect(typeof pool.query.mock.calls[0][1][2]).toBe('string');
    });

    it('updateSmartReminder 空更新返回 false', async () => {
      const result = await automationService.updateSmartReminder(createMockPool(), 1, {});
      expect(result).toBe(false);
    });

    it('deleteSmartReminder 应软删除', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await automationService.deleteSmartReminder(pool, 1);
      expect(pool.query.mock.calls[0][0]).toContain('deleted_at = NOW()');
    });

    function mockRunReminder(pool, reminderType, match) {
      pool.query.mockResolvedValueOnce([[{ id: 1, reminder_type: reminderType, config: JSON.stringify({ days: 7, days_before: 30, days_no_contact: 30 }), name: 'r', notify_to: 'owner' }]]);
      pool.query.mockResolvedValueOnce([[match]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT IGNORE
      pool.query.mockResolvedValueOnce([[{ affected: 1 }]]);   // ROW_COUNT
      pool.query.mockResolvedValueOnce([{ insertId: 1 }]);     // INSERT notification
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE last_run_at
    }

    it('runSmartReminder followup_gap 分支', async () => {
      const pool = createMockPool();
      mockRunReminder(pool, 'followup_gap', { id: 10, company_name: 'A', owner_id: 2, days_gap: 8 });

      const result = await automationService.runSmartReminder(pool);
      expect(result).toBe(1);
    });

    it('runSmartReminder contract_expire 分支', async () => {
      const pool = createMockPool();
      mockRunReminder(pool, 'contract_expire', { id: 10, contract_no: 'C001', customer_id: 5, company_name: 'A', owner_id: 2, days_left: 15 });

      const result = await automationService.runSmartReminder(pool);
      expect(result).toBe(1);
    });

    it('runSmartReminder payment_due 分支', async () => {
      const pool = createMockPool();
      mockRunReminder(pool, 'payment_due', { id: 10, contract_id: 5, plan_date: '2026-07-30', plan_amount: 1000, customer_id: 5, company_name: 'A', owner_id: 2, days_left: 3 });

      const result = await automationService.runSmartReminder(pool);
      expect(result).toBe(1);
    });

    it('runSmartReminder inactive 分支', async () => {
      const pool = createMockPool();
      mockRunReminder(pool, 'inactive', { id: 10, company_name: 'A', owner_id: 2, days_inactive: 31 });

      const result = await automationService.runSmartReminder(pool);
      expect(result).toBe(1);
    });

    it('runSmartReminder 无匹配规则返回 0', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[]]);
      const result = await automationService.runSmartReminder(pool);
      expect(result).toBe(0);
    });

    it('getPendingReminders 应返回列表', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([[{ id: 1 }]]);
      const result = await automationService.getPendingReminders(pool, 2);
      expect(result).toHaveLength(1);
    });

    it('markReminderSeen 应更新状态', async () => {
      const pool = createMockPool();
      pool.query.mockResolvedValue([{ affectedRows: 1 }]);
      await automationService.markReminderSeen(pool, 1, 2);
      expect(pool.query.mock.calls[0][0]).toContain("status = 'seen'");
    });
  });
});

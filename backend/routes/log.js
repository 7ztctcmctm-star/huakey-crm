const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const XLSX = require('xlsx');

const requireAdmin = require('../middleware/admin');

router.post('/list', authenticateToken, checkPermission('system:log'), async (req, res) => {
  try {
  const { page = 1, pageSize = 20, module, action, status, startDate, endDate, actionType, userId } = req.body;
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 200); // 上限200
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * safePageSize;

  let whereClause = '1=1';
  const params = [];

  if (module) {
    whereClause += ' AND l.module = ?';
    params.push(module);
  }

  if (action) {
    whereClause += ' AND l.action LIKE ?';
    params.push(`%${action}%`);
  }

  // 操作类型: delete/edit/add/export/import (支持字符串或数组)
  const ACTION_TYPE_MAP = {
    'delete': ['删除'],
    'edit': ['编辑', '修改'],
    'add': ['新增', '创建', '添加'],
    'export': ['导出'],
    'import': ['导入']
  };
  if (actionType) {
    const types = Array.isArray(actionType) ? actionType : [actionType];
    const allKeywords = [];
    types.forEach(t => {
      if (ACTION_TYPE_MAP[t]) allKeywords.push(...ACTION_TYPE_MAP[t]);
    });
    if (allKeywords.length > 0) {
      const likeClauses = allKeywords.map(() => 'l.action LIKE ?').join(' OR ');
      whereClause += ` AND (${likeClauses})`;
      allKeywords.forEach(k => params.push(`%${k}%`));
    }
  }

  if (status !== undefined && status !== '') {
    whereClause += ' AND l.status = ?';
    params.push(status);
  }

  if (userId) {
    whereClause += ' AND l.user_id = ?';
    params.push(userId);
  }

  if (startDate) {
    whereClause += ' AND l.create_time >= ?';
    params.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND l.create_time <= ?';
    params.push(endDate + ' 23:59:59');
  }

  try {
    const countSql = `SELECT COUNT(*) as total FROM sys_log l WHERE ${whereClause}`;
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0].total;

    const sql = `
      SELECT l.*, u.real_name as user_name
      FROM sys_log l
      LEFT JOIN sys_user u ON l.user_id = u.id
      WHERE ${whereClause}
      ORDER BY l.create_time DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(sql, [...params, safePageSize, parseInt(offset)]);

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        list: rows,
        total,
        page: parseInt(page) || 1,
        pageSize: safePageSize
      }
    });
  } catch (error) {
    console.error('查询日志失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
  } catch (error) {
    console.error('查询日志失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.get('/detail/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT l.*, u.real_name as user_name
      FROM sys_log l
      LEFT JOIN sys_user u ON l.user_id = u.id
      WHERE l.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '日志不存在', data: null });
    }

    res.json({ code: 200, message: '查询成功', data: rows[0] });
  } catch (error) {
    console.error('查询日志详情失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.get('/modules', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT module FROM sys_log ORDER BY module');
    res.json({ code: 200, message: '查询成功', data: rows.map(r => r.module) });
  } catch (error) {
    console.error('查询模块失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/delete', authenticateToken, requireAdmin, async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择要删除的日志', data: null });
  }

  try {
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.query(`DELETE FROM sys_log WHERE id IN (${placeholders})`, ids);
    res.json({ code: 200, message: `成功删除 ${result.affectedRows} 条日志`, data: null });
  } catch (error) {
    console.error('删除日志失败:', error);
    res.status(500).json({ code: 500, message: '删除失败', data: null });
  }
});

router.post('/clear', authenticateToken, requireAdmin, async (req, res) => {
  const { days } = req.body;
  const retentionDays = days || 30;

  try {
    const [result] = await pool.query(
      "DELETE FROM sys_log WHERE create_time < NOW() - INTERVAL ? DAY",
      [retentionDays]
    );
    res.json({ code: 200, message: `成功清理 ${result.affectedRows} 条过期日志`, data: null });
  } catch (error) {
    console.error('清理日志失败:', error);
    res.status(500).json({ code: 500, message: '清理失败', data: null });
  }
});

// 导出日志
router.post('/export', authenticateToken, checkPermission('log:export'), requireAdmin, async (req, res) => {
  try {
  const { module, action, status, startDate, endDate } = req.body;

  let whereClause = '1=1';
  const params = [];

  if (module) { whereClause += ' AND l.module = ?'; params.push(module); }
  if (action) { whereClause += ' AND l.action LIKE ?'; params.push(`%${action}%`); }
  if (status !== undefined && status !== '') { whereClause += ' AND l.status = ?'; params.push(status); }
  if (startDate) { whereClause += ' AND l.create_time >= ?'; params.push(startDate); }
  if (endDate) { whereClause += ' AND l.create_time <= ?'; params.push(endDate + ' 23:59:59'); }

  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.module, l.action, l.method, l.url, l.user_name, l.ip_address, l.status, l.create_time, l.error_msg
       FROM sys_log l WHERE ${whereClause} ORDER BY l.create_time DESC LIMIT 10000`,
      params
    );

    const exportData = rows.map(row => ({
      'ID': row.id,
      '模块': row.module,
      '操作': row.action,
      '方法': row.method,
      'URL': row.url,
      '用户': row.user_name || '',
      'IP地址': row.ip_address,
      '状态': row.status === 1 ? '成功' : '失败',
      '操作时间': row.create_time,
      '错误信息': row.error_msg || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, '操作日志');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=operation_logs.xlsx');
    res.send(buf);
  } catch (error) {
    console.error('导出日志失败:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
  } catch (error) {
    console.error('导出日志失败:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

module.exports = router;
const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const DataCleaner = require('../../utils/dataCleaner');
const DataValidator = require('../../utils/validator');

// [安全修复] 文件上传限制：仅允许Excel/CSV，最大10MB
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv' // .csv
];
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

const upload = multer({
  storage: multer.memoryStorage(), // 内存存储（兼容 Vercel Serverless）
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 xlsx、xls、csv 格式的文件'));
    }
  }
});

const MODULE_NAME = '客户管理';

// Excel 列名 → DB 字段映射
const FIELD_MAP = {
  '公司名称': 'company_name',
  '联系人': 'contact_name',
  '电话': 'phone',
  '联系电话': 'phone',
  '邮箱': 'email',
  '地址': 'address',
  '公司地址': 'address',
  '行业': 'industry',
  '来源': 'source',
  '客户来源': 'source',
  '等级': 'level',
  '客户等级': 'level',
  '状态': 'status',
  '客户状态': 'status',
  '备注': 'remark',
};

const { createRouteLogger } = require('../../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const router = express.Router();

// 下载导入模板
router.get('/template', authenticateToken, (req, res) => {
  try {
    const headers = ['公司名称', '联系人', '电话', '邮箱', '地址', '行业', '来源', '等级', '备注'];
    const example = ['华科科技有限公司', '张三', '13800138000', 'zhangsan@example.com', '北京市朝阳区', '科技', '展会', 'A', '示例客户'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);

    // 设置列宽
    ws['!cols'] = [
      { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 25 },
      { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 8 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '客户导入模板');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customer_import_template.xlsx');
    res.send(buf);
  } catch (error) {
    console.error('生成模板错误:', error);
    res.status(500).json({ code: 500, message: '生成模板失败', data: null });
  }
});

// Excel导入预览
router.post('/import-preview', authenticateToken, checkPermission('customer:import'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      // 内存存储，无需清理临时文件
      return res.status(400).json({ code: 400, message: 'Excel文件为空', data: null });
    }

    const headers = Object.keys(rows[0]);
    const mapped = [];
    const unmapped = [];
    for (const h of headers) {
      if (FIELD_MAP[h]) mapped.push({ excel: h, field: FIELD_MAP[h] });
      else if (h.trim()) unmapped.push(h);
    }

    let preview = rows.map((row, i) => {
      const item = { _row: i + 2 };
      for (const h of headers) {
        if (FIELD_MAP[h]) item[FIELD_MAP[h]] = String(row[h] || '').trim();
      }
      // 没有映射的列拼接进remark
      const extras = [];
      for (const h of headers) {
        if (!FIELD_MAP[h] && String(row[h] || '').trim()) {
          extras.push(h + ': ' + String(row[h]).trim());
        }
      }
      if (extras.length > 0) {
        item.remark = (item.remark ? item.remark + '; ' : '') + extras.join('; ');
      }
      return item;
    });

    // 数据清洗
    preview = DataCleaner.cleanCustomerData(preview);

    // 加载验证规则并验证
    const [rules] = await pool.query(
      'SELECT * FROM sys_validation_rule WHERE table_name = ? AND is_active = 1',
      ['crm_customer']
    );
    const validator = new DataValidator(rules);
    preview = preview.map(item => {
      const result = validator.validate(item);
      return { ...item, valid: result.valid, errors: result.errors };
    });

    // 清理上传文件
    // 内存存储，无需清理临时文件

    res.json({
      code: 200,
      message: '预览成功',
      data: {
        total: preview.length,
        mapped_fields: mapped,
        unmapped_fields: unmapped,
        preview: preview.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('导入预览错误:', error);
    // 内存存储，无需清理临时文件
    res.status(500).json({ code: 500, message: '预览失败', data: null });
  }
});

// Excel导入确认（集成清洗 + 验证 + 去重）
router.post('/import-confirm', authenticateToken, checkPermission('customer:import'), upload.single('file'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传Excel文件', data: null });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const headers = Object.keys(rows[0]);

    // 1. 原始数据映射
    let data = rows.map((row, i) => {
      const item = { _row: i + 2 };
      const extras = [];
      for (const h of headers) {
        const val = String(row[h] || '').trim();
        if (!val) continue;
        if (FIELD_MAP[h]) item[FIELD_MAP[h]] = val;
        else extras.push(h + ': ' + val);
      }
      if (extras.length > 0) {
        item.remark = (item.remark ? item.remark + '; ' : '') + extras.join('; ');
      }
      if (!item.level) item.level = 'C';
      if (!item.status) item.status = 1;
      return item;
    });

    // 2. 数据清洗
    data = DataCleaner.cleanCustomerData(data);

    // 3. 状态映射
    const statusMap = { '潜在客户': 1, '成交客户': 2, '流失客户': 3, '未合作': 1, '已合作': 2 };
    data = data.map(item => ({
      ...item,
      status: (item.status && isNaN(item.status)) ? (statusMap[item.status] || 1) : (parseInt(item.status) || 1)
    }));

    // 4. 数据验证
    const [rules] = await pool.query(
      'SELECT * FROM sys_validation_rule WHERE table_name = ? AND is_active = 1',
      ['crm_customer']
    );
    const validator = new DataValidator(rules);
    const { validRecords, invalidRecords } = validator.validateBatch(data);

    // 5. 批量去重（与数据库已有数据对比）
    const { newRecords, skippedCount } = await DataCleaner.filterExistingDuplicates(
      validRecords, pool, 'crm_customer',
      [{ column: 'company_name' }, { column: 'phone' }]
    );

    // 6. 批量插入
    let success = 0;
    const insertErrors = [];
    const truncate = (val, max) => val && val.length > max ? val.substring(0, max) : val;

    await connection.beginTransaction();

    for (const record of newRecords) {
      try {
        await connection.query(
          `INSERT INTO crm_customer (company_name, contact_name, phone, email, address, industry, source, level, status, remark, owner_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [truncate(record.company_name, 200), truncate(record.contact_name, 50), truncate(record.phone, 20),
           truncate(record.email, 100), truncate(record.address, 500), truncate(record.industry, 50),
           truncate(record.source, 50), truncate(record.level, 20), record.status,
           record.remark ? record.remark.substring(0, 2000) : null, req.user.userId]
        );
        success++;
      } catch (error) {
        insertErrors.push(`第${record._row}行: ${error.message}`);
      }
    }

    await connection.commit();

    await logAction(req, 'import', `批量导入客户: 成功${success}条, 跳过重复${skippedCount}条, 验证失败${invalidRecords.length}条`);

    // 内存存储，无需清理临时文件

    res.json({
      code: 200,
      message: `导入完成: 成功 ${success} 条, 重复 ${skippedCount} 条, 验证失败 ${invalidRecords.length} 条`,
      data: {
        success,
        duplicates: skippedCount,
        invalid: invalidRecords.length,
        fail: insertErrors.length,
        errors: [
          ...invalidRecords.slice(0, 5).map(r => `第${r.record._row}行: ${r.errors.map(e => e.message).join('; ')}`),
          ...insertErrors.slice(0, 5)
        ]
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('导入错误:', error);
    // 内存存储，无需清理临时文件
    res.status(500).json({ code: 500, message: '导入失败', data: null });
  } finally {
    connection.release();
  }
});

// [安全修复] multer错误处理中间件
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 400, message: '文件大小不能超过10MB', data: null });
  }
  if (err.message && err.message.includes('仅支持')) {
    return res.status(400).json({ code: 400, message: err.message, data: null });
  }
  next(err);
});

module.exports = router;

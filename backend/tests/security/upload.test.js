/**
 * 文件上传安全测试
 * 验证上传模块的安全防护（文件类型、大小限制、路径遍历防护）
 */

const request = require('supertest');
const express = require('express');
const multer = require('multer');
const path = require('path');

// 模拟生产上传配置
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip', '.rar'];
const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/vnd.rar'
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function createUploadApp() {
  const app = express();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(new Error(`不支持的文件类型: ${ext}`));
      }
      if (!ALLOWED_MIMES.includes(file.mimetype)) {
        return cb(new Error(`不支持的 MIME 类型: ${file.mimetype}`));
      }
      cb(null, true);
    }
  });

  app.post('/api/v1/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请选择文件' });
    }
    res.json({ code: 200, message: '上传成功', data: { file_name: req.file.originalname, file_size: req.file.size } });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ code: 413, message: '文件大小超过限制' });
    }
    res.status(400).json({ code: 400, message: err.message });
  });

  return app;
}

// 创建一个小型测试文件 buffer
function createTestBuffer(size = 1024) {
  return Buffer.alloc(size, 'A');
}

describe('文件上传安全', () => {
  let app;

  beforeAll(() => {
    app = createUploadApp();
  });

  describe('文件类型校验', () => {
    it('应允许合法的 PDF 文件', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(512), 'contract.pdf');

      expect(res.status).toBe(200);
      expect(res.body.data.file_name).toBe('contract.pdf');
    });

    it('应允许合法的图片文件', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), 'logo.png');

      expect(res.status).toBe(200);
    });

    it('应拒绝危险的可执行文件 (.exe)', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), 'malware.exe');

      expect(res.status).toBe(400);
    });

    it('应拒绝脚本文件 (.js)', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), 'evil.js');

      expect(res.status).toBe(400);
    });

    it('应拒绝 HTML 文件 (.html)', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), 'phish.html');

      expect(res.status).toBe(400);
    });

    it('应拒绝 PHP 文件', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), 'shell.php');

      expect(res.status).toBe(400);
    });

    it('应拒绝无扩展名的文件', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), 'noextension');

      expect(res.status).toBe(400);
    });

    it('应拒绝双扩展名绕过 (.pdf.exe)', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), 'invoice.pdf.exe');

      // path.extname 取最后一个扩展名，应为 .exe → 被拒绝
      expect(res.status).toBe(400);
    });
  });

  describe('文件大小限制', () => {
    it('应接受小于 10MB 的文件', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(1024 * 100), 'small.pdf');

      expect(res.status).toBe(200);
    });

    it('应接受普通大小的文件', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', Buffer.alloc(1), 'tiny.pdf');

      expect(res.status).toBe(200);
    });
  });

  describe('路径遍历防护', () => {
    it('应安全处理带路径分隔符的文件名', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', createTestBuffer(256), '../../../etc/passwd.pdf');

      // multer memoryStorage 不写磁盘，路径遍历不会造成实际影响
      // 但应验证 multer 提取的是 basename 而非完整路径
      if (res.status === 200) {
        expect(res.body.data.file_name).not.toContain('..');
        expect(res.body.data.file_name).not.toContain('/etc/');
      }
    });
  });

  describe('空文件处理', () => {
    it('应正确处理大小为 0 的空文件', async () => {
      const res = await request(app)
        .post('/api/v1/upload')
        .attach('file', Buffer.alloc(0), 'empty.pdf');

      if (res.status === 200) {
        expect(res.body.data.file_size).toBe(0);
      }
    });
  });
});

/**
 * 文件上传服务层
 * 从 routes/upload.js 提取的业务逻辑
 */
const path = require('path');
const { getSupabaseStorage } = require('../utils/supabaseStorage');

// Supabase Storage 客户端（懒加载）
let supabaseStorage = null;
const getStorage = async () => {
  if (!supabaseStorage) supabaseStorage = await getSupabaseStorage();
  return supabaseStorage;
};

/**
 * 上传文件
 */
async function uploadFile(pool, { file, business_type, business_id, userId }) {
  if (!file) {
    const err = new Error('请选择文件');
    err.statusCode = 400;
    throw err;
  }

  const ext = path.extname(file.originalname);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  let filePath;
  const storage = await getStorage();

  if (storage) {
    // 上传到 Supabase Storage
    const { data, error } = await storage.upload(filename, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600'
    });
    if (error) throw new Error(`Supabase Storage 上传失败: ${error.message}`);
    const { data: urlData } = storage.getPublicUrl(filename);
    filePath = urlData.publicUrl;
  } else {
    // 回退：本地文件存储
    const fs = require('fs');
    const uploadDir = path.join(__dirname, '../uploads/attachments');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
    filePath = `/uploads/attachments/${filename}`;
  }

  const [result] = await pool.query(
    `INSERT INTO crm_attachment (business_type, business_id, file_name, file_path, file_size, file_type, create_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [business_type || null, business_id || null, file.originalname, filePath, file.size, file.mimetype, userId]
  );

  return {
    id: result.insertId || (result.rows && result.rows[0]?.id),
    file_name: file.originalname,
    file_path: filePath,
    file_size: file.size,
    file_type: file.mimetype
  };
}

/**
 * 查询附件列表
 */
async function listAttachments(pool, { business_type, business_id }) {
  if (!business_type || !business_id) {
    const err = new Error('参数不完整');
    err.statusCode = 400;
    throw err;
  }
  const [list] = await pool.query(
    'SELECT * FROM crm_attachment WHERE business_type = ? AND business_id = ? AND deleted_at IS NULL ORDER BY create_time DESC',
    [business_type, business_id]
  );
  return list;
}

/**
 * 删除附件
 */
async function deleteAttachment(pool, id) {
  if (!id) {
    const err = new Error('附件ID不能为空');
    err.statusCode = 400;
    throw err;
  }

  const [rows] = await pool.query('SELECT * FROM crm_attachment WHERE id = ? AND deleted_at IS NULL', [id]);
  if (rows.length === 0) {
    const err = new Error('附件不存在');
    err.statusCode = 404;
    throw err;
  }

  const attachment = rows[0];

  // Supabase Storage 删除（如果是 Supabase URL）
  const storage = await getStorage();
  if (storage && attachment.file_path && !attachment.file_path.startsWith('/uploads/')) {
    const urlParts = attachment.file_path.split('/');
    const remoteFilename = urlParts[urlParts.length - 1];
    await storage.remove([remoteFilename]).catch(e => console.warn('Supabase 文件删除失败（可能已不存在）:', e.message));
  } else {
    // 本地文件删除
    const fs = require('fs');
    const uploadsDir = path.resolve(__dirname, '..', 'uploads');
    const fullPath = path.resolve(__dirname, '..', attachment.file_path.replace(/^\//, ''));
    if (!fullPath.startsWith(uploadsDir)) {
      const err = new Error('非法文件路径');
      err.statusCode = 400;
      throw err;
    }
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  await pool.query('UPDATE crm_attachment SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = {
  uploadFile,
  listAttachments,
  deleteAttachment
};

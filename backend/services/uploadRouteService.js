/**
 * 文件上传服务层
 * 从 routes/upload.js 提取的业务逻辑
 */
const path = require('path');
const crypto = require('crypto');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/codes');
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
/**
 * 安全化原始文件名：去除路径与特殊字符，保留基本名称
 */
function sanitizeOriginalName(name) {
  if (!name || typeof name !== 'string') return 'unnamed';
  const base = path.basename(name.replace(/\\/g, '/'));
  const cleaned = base.replace(/[\x00-\x1f\x7f\/:*?"<>|]/g, '_').trim();
  return cleaned || 'unnamed';
}

async function uploadFile(pool, { file, business_type, business_id, userId }) {
  if (!file) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '请选择文件');
  }

  const safeOriginalName = sanitizeOriginalName(file.originalname);
  const ext = path.extname(safeOriginalName);
  const filename = `${crypto.randomUUID()}${ext}`;

  let filePath;
  const storage = await getStorage();

  if (storage) {
    // 上传到 Supabase Storage
    const { error } = await storage.upload(filename, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600'
    });
    if (error) throw new AppError(ErrorCodes.FILE_UPLOAD_FAILED, `Supabase Storage 上传失败: ${error.message}`, 500);
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
    [business_type || null, business_id || null, safeOriginalName, filePath, file.size, file.mimetype, userId]
  );

  return {
    id: result.insertId || (result.rows && result.rows[0]?.id),
    file_name: safeOriginalName,
    file_path: filePath,
    file_size: file.size,
    file_type: file.mimetype
  };
}

/**
 * [P1-08] 附件所属业务 → 客户关联 SQL。
 * 已知业务实体均可回溯到 crm_customer，附件可见性按客户数据范围判定；
 * 未登记的业务类型回退为“仅上传者本人可见/可删”（fail-closed）。
 */
const BUSINESS_CUSTOMER_LINK = {
  customer: 'JOIN crm_customer c ON c.id = a.business_id AND c.deleted_at IS NULL',
  follow_up: 'JOIN crm_follow_up f ON f.id = a.business_id AND f.deleted_at IS NULL JOIN crm_customer c ON c.id = f.customer_id AND c.deleted_at IS NULL',
  service_order: 'JOIN crm_service_order so ON so.id = a.business_id AND so.deleted_at IS NULL JOIN crm_customer c ON c.id = so.customer_id AND c.deleted_at IS NULL',
  quote: 'JOIN crm_quote q ON q.id = a.business_id AND q.deleted_at IS NULL JOIN crm_customer c ON c.id = q.customer_id AND c.deleted_at IS NULL',
  contract: 'JOIN crm_contract ct ON ct.id = a.business_id AND ct.deleted_at IS NULL JOIN crm_customer c ON c.id = ct.customer_id AND c.deleted_at IS NULL',
  opportunity: 'JOIN crm_opportunity o ON o.id = a.business_id AND o.deleted_at IS NULL JOIN crm_customer c ON c.id = o.customer_id AND c.deleted_at IS NULL'
};

/**
 * [P1-11] 按本地存储路径反查附件记录。
 * /uploads/attachments 不再公开静态，访问前必须由该记录回溯业务归属做鉴权。
 */
async function findAttachmentByFilePath(pool, filePath) {
  const [rows] = await pool.query(
    `SELECT id, business_type, business_id, create_by, file_path
     FROM crm_attachment WHERE file_path = ? AND deleted_at IS NULL LIMIT 1`,
    [filePath]
  );
  return rows[0] || null;
}

/**
 * [P1-11] 附件是否对当前用户可见（与 listAttachments 同一口径）：
 * manageAll / 上传者本人 / 对所属业务客户具备数据范围；未知业务类型仅上传者本人。
 */
async function canViewAttachment(pool, attachment, user = {}, permission = { clause: '1=1', params: [] }) {
  if (!attachment) return false;
  if (user.manageAll) return true;
  if (Number(attachment.create_by) === Number(user.userId)) return true;

  const link = BUSINESS_CUSTOMER_LINK[attachment.business_type];
  if (!link) return false;

  const [rows] = await pool.query(
    `SELECT 1 FROM crm_attachment a
     ${link}
     WHERE a.id = ? AND a.deleted_at IS NULL AND ${permission.clause || '1=1'}
     LIMIT 1`,
    [attachment.id, ...((permission && permission.params) || [])]
  );
  return rows.length > 0;
}

/**
 * 查询附件列表
 * @param {object} pool
 * @param {{business_type: string, business_id: number}} params
 * @param {{clause: string, params: array}} permission - 客户行级数据范围（buildDataPermissionWhere）
 * @param {object} user - { userId, manageAll }
 */
async function listAttachments(pool, { business_type, business_id }, permission = { clause: '1=1', params: [] }, user = {}) {
  if (!business_type || !business_id) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '参数不完整');
  }

  const link = BUSINESS_CUSTOMER_LINK[business_type];
  let scopeClause;
  let scopeParams;

  if (link) {
    scopeClause = permission && permission.clause ? permission.clause : '1=1';
    scopeParams = (permission && permission.params) || [];
  } else if (user.manageAll) {
    scopeClause = '1=1';
    scopeParams = [];
  } else {
    // 未知业务类型无法回溯客户：仅上传者本人可见
    scopeClause = 'a.create_by = ?';
    scopeParams = [user.userId];
  }

  const [list] = await pool.query(
    `SELECT a.id, a.business_type, a.business_id, a.file_name, a.file_path, a.file_size,
            a.file_type, a.create_by, a.create_time, a.update_time, a.deleted_at
     FROM crm_attachment a
     ${link || ''}
     WHERE a.business_type = ? AND a.business_id = ? AND a.deleted_at IS NULL AND ${scopeClause}
     ORDER BY a.create_time DESC`,
    [business_type, business_id, ...scopeParams]
  );
  return list;
}

/**
 * 删除附件
 * @param {object} pool
 * @param {number} id
 * @param {object} user - { userId, manageAll }
 * @param {function} canManageCustomer - (user, ownerId) => Promise<boolean>
 */
async function deleteAttachment(pool, id, user = {}, canManageCustomer) {
  if (!id) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '附件ID不能为空');
  }

  const [rows] = await pool.query(
    `SELECT id, business_type, business_id, file_name, file_path, file_size, file_type, create_by, create_time, update_time, deleted_at
     FROM crm_attachment WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '附件不存在');
  }

  const attachment = rows[0];

  // [P1-08] IDOR 收口：原实现任意持 file 权限的用户可删除任意附件（含物理文件）。
  // 允许：manageAll / 上传者本人 / 对附件所属业务客户有数据范围。
  let allowed = !!user.manageAll || Number(attachment.create_by) === Number(user.userId);
  if (!allowed) {
    const link = BUSINESS_CUSTOMER_LINK[attachment.business_type];
    if (link) {
      const tableAlias = link.match(/JOIN (\w+) (\w+)/);
      let ownerRows = [];
      if (attachment.business_type === 'customer') {
        [ownerRows] = await pool.query(
          'SELECT owner_id FROM crm_customer WHERE id = ? AND deleted_at IS NULL', [attachment.business_id]);
      } else if (tableAlias) {
        [ownerRows] = await pool.query(
          `SELECT c.owner_id FROM ${tableAlias[1]} ${tableAlias[2]}
           JOIN crm_customer c ON c.id = ${tableAlias[2]}.customer_id AND c.deleted_at IS NULL
           WHERE ${tableAlias[2]}.id = ? AND ${tableAlias[2]}.deleted_at IS NULL`,
          [attachment.business_id]
        );
      }
      if (ownerRows.length > 0 && typeof canManageCustomer === 'function') {
        allowed = await canManageCustomer(user, ownerRows[0].owner_id);
      }
    }
  }

  if (!allowed) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '无权删除该附件');
  }

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
      throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '非法文件路径');
    }
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  await pool.query('UPDATE crm_attachment SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = {
  uploadFile,
  listAttachments,
  deleteAttachment,
  findAttachmentByFilePath,
  canViewAttachment
};

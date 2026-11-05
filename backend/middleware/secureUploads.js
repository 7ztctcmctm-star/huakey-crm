/**
 * [P1-11] 本地 /uploads 静态目录的鉴权挂载。
 *
 * 审计结论：app.js 原以 `express.static` 直接公开 backend/uploads，
 * 未登录者只要拿到 URL 即可读取客户附件（合同、回款凭证、工单图片等）。
 *
 * 修复口径：
 *  - /uploads/attachments：登录 + 附件记录存在 + 客户数据范围（与 /upload/list 同口径），
 *    未知业务类型仅上传者本人；路径按 basename 归一化，禁止目录穿越。
 *  - /uploads/knowledge：知识库产品图片，登录 + knowledge 权限码。
 *
 * URL 形态保持不变（前端 el-link/el-image 直接引用 file_path），
 * 但鉴权由后端强制；生产若配置 Supabase Storage，仍走其公网 URL。
 */
const path = require('path');
const express = require('express');
const { authenticateToken } = require('./auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('./permission');
const uploadRouteService = require('../services/uploadRouteService');

function attachmentGuard(pool, uploadsDir) {
  return [
    authenticateToken,
    checkDataPermission('customer', 'owner_id'),
    async (req, res, next) => {
      try {
        let name;
        try {
          name = path.basename(decodeURIComponent(req.path));
        } catch {
          return res.status(400).json({ code: 400, message: '非法文件路径', data: null });
        }
        const filePath = `/uploads/attachments/${name}`;
        const attachment = await uploadRouteService.findAttachmentByFilePath(pool, filePath);
        if (!attachment) {
          return res.status(404).json({ code: 404, message: '文件不存在', data: null });
        }
        const permission = await buildDataPermissionWhere(req.dataPermission, 'c');
        const allowed = await uploadRouteService.canViewAttachment(pool, attachment, req.user, permission);
        if (!allowed) {
          return res.status(403).json({ code: 403, message: '无权访问该文件', data: null });
        }
        next();
      } catch (error) {
        next(error);
      }
    },
    express.static(path.join(uploadsDir, 'attachments'), { index: false, dotfiles: 'deny' })
  ];
}

function knowledgeGuard(uploadsDir) {
  return [
    authenticateToken,
    checkPermission('knowledge'),
    express.static(path.join(uploadsDir, 'knowledge'), { index: false, dotfiles: 'deny' })
  ];
}

function mountSecureUploads(app, { pool, uploadsDir }) {
  app.use('/uploads/attachments', attachmentGuard(pool, uploadsDir));
  app.use('/uploads/knowledge', knowledgeGuard(uploadsDir));
  // 其余 /uploads 子目录不再对外提供静态服务
}

module.exports = { mountSecureUploads, attachmentGuard, knowledgeGuard };

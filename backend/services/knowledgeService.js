/**
 * 知识库核心服务层
 * 从 routes/knowledge.js 提取的业务逻辑
 * 四个子模块：产品、话术、FAQ、文档
 */

// ============ 产品 ============

async function listProducts(pool, params = {}) {
  const { page = 1, pageSize = 20, keyword = '', category = '' } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE p.deleted_at IS NULL';
  const queryParams = [];
  if (keyword) { where += ' AND (p.name LIKE ? OR p.model LIKE ? OR p.description LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (category) { where += ' AND p.category = ?'; queryParams.push(category); }

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_product p ${where}`, queryParams);
  const [rows] = await pool.query(
    `SELECT p.*, u.real_name as create_by_name FROM crm_knowledge_product p LEFT JOIN sys_user u ON p.create_by = u.id ${where} ORDER BY p.create_time DESC LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), offset]
  );
  return { list: rows, total };
}

async function getProduct(pool, id) {
  const [[row]] = await pool.query('SELECT p.*, u.real_name as create_by_name FROM crm_knowledge_product p LEFT JOIN sys_user u ON p.create_by = u.id WHERE p.id = ? AND p.deleted_at IS NULL', [id]);
  return row || null;
}

async function createProduct(pool, data, userId) {
  const [result] = await pool.query(
    'INSERT INTO crm_knowledge_product (name, category, model, description, specs, price, images, create_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [data.name.trim(), data.category || null, data.model || null, data.description || null, data.specs || null, data.price || null, data.images || null, userId]
  );
  return { id: result.insertId };
}

async function updateProduct(pool, id, data) {
  const fields = [];
  const values = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.model !== undefined) { fields.push('model = ?'); values.push(data.model); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.specs !== undefined) { fields.push('specs = ?'); values.push(data.specs); }
  if (data.price !== undefined) { fields.push('price = ?'); values.push(data.price); }
  if (data.images !== undefined) { fields.push('images = ?'); values.push(data.images); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(parseInt(data.status)); }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE crm_knowledge_product SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
}

async function deleteProduct(pool, id) {
  await pool.query('UPDATE crm_knowledge_product SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function addProductImages(pool, id, filePaths) {
  const [[row]] = await pool.query('SELECT images FROM crm_knowledge_product WHERE id = ? AND deleted_at IS NULL', [id]);
  const existing = row && row.images ? JSON.parse(row.images) : [];
  const allImages = [...existing, ...filePaths];
  await pool.query('UPDATE crm_knowledge_product SET images = ? WHERE id = ?', [JSON.stringify(allImages), id]);
  return allImages;
}

async function getProductCategories(pool) {
  const [rows] = await pool.query("SELECT DISTINCT category FROM crm_knowledge_product WHERE deleted_at IS NULL AND category IS NOT NULL AND category != '' ORDER BY category");
  return rows.map(r => r.category);
}

// ============ 话术 ============

async function listScripts(pool, params = {}) {
  const { keyword = '', scene = '', page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE deleted_at IS NULL';
  const queryParams = [];
  if (keyword) { where += ' AND (title LIKE ? OR content LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`); }
  if (scene) { where += ' AND scene = ?'; queryParams.push(scene); }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_script ${where}`, queryParams);
  const [rows] = await pool.query(`SELECT * FROM crm_knowledge_script ${where} ORDER BY sort_order ASC, create_time DESC LIMIT ? OFFSET ?`, [...queryParams, parseInt(pageSize), offset]);
  return { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

async function getScript(pool, id) {
  await pool.query('UPDATE crm_knowledge_script SET usage_count = usage_count + 1 WHERE id = ?', [id]);
  const [[row]] = await pool.query('SELECT * FROM crm_knowledge_script WHERE id = ? AND deleted_at IS NULL', [id]);
  return row || null;
}

async function createScript(pool, data, userId) {
  const [result] = await pool.query('INSERT INTO crm_knowledge_script (title, scene, content, sort_order, create_by) VALUES (?, ?, ?, ?, ?)',
    [data.title.trim(), data.scene || null, data.content.trim(), data.sort_order || 0, userId]);
  return { id: result.insertId };
}

async function updateScript(pool, id, data) {
  const fields = [];
  const values = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title.trim()); }
  if (data.scene !== undefined) { fields.push('scene = ?'); values.push(data.scene); }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content.trim()); }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(parseInt(data.sort_order)); }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE crm_knowledge_script SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
}

async function deleteScript(pool, id) {
  await pool.query('UPDATE crm_knowledge_script SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getScriptScenes(pool) {
  const [rows] = await pool.query("SELECT DISTINCT scene FROM crm_knowledge_script WHERE deleted_at IS NULL AND scene IS NOT NULL AND scene != '' ORDER BY scene");
  return rows.map(r => r.scene);
}

// ============ FAQ ============

async function listFaqs(pool, params = {}) {
  const { keyword = '', category = '', page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE deleted_at IS NULL';
  const queryParams = [];
  if (keyword) { where += ' AND (question LIKE ? OR answer LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`); }
  if (category) { where += ' AND category = ?'; queryParams.push(category); }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_faq ${where}`, queryParams);
  const [rows] = await pool.query(`SELECT * FROM crm_knowledge_faq ${where} ORDER BY sort_order ASC, create_time DESC LIMIT ? OFFSET ?`, [...queryParams, parseInt(pageSize), offset]);
  return { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

async function getFaq(pool, id) {
  await pool.query('UPDATE crm_knowledge_faq SET view_count = view_count + 1 WHERE id = ?', [id]);
  const [[row]] = await pool.query('SELECT * FROM crm_knowledge_faq WHERE id = ? AND deleted_at IS NULL', [id]);
  return row || null;
}

async function createFaq(pool, data, userId) {
  const [result] = await pool.query('INSERT INTO crm_knowledge_faq (question, answer, category, sort_order, create_by) VALUES (?, ?, ?, ?, ?)',
    [data.question.trim(), data.answer.trim(), data.category || null, data.sort_order || 0, userId]);
  return { id: result.insertId };
}

async function updateFaq(pool, id, data) {
  const fields = [];
  const values = [];
  if (data.question !== undefined) { fields.push('question = ?'); values.push(data.question.trim()); }
  if (data.answer !== undefined) { fields.push('answer = ?'); values.push(data.answer.trim()); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(parseInt(data.sort_order)); }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE crm_knowledge_faq SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
}

async function deleteFaq(pool, id) {
  await pool.query('UPDATE crm_knowledge_faq SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getFaqCategories(pool) {
  const [rows] = await pool.query("SELECT DISTINCT category FROM crm_knowledge_faq WHERE deleted_at IS NULL AND category IS NOT NULL AND category != '' ORDER BY category");
  return rows.map(r => r.category);
}

// ============ 文档 ============

async function listDocuments(pool, params = {}) {
  const { keyword = '', type = '', page = 1, pageSize = 20 } = params;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'WHERE d.deleted_at IS NULL';
  const queryParams = [];
  if (keyword) { where += ' AND (d.name LIKE ? OR d.description LIKE ?)'; queryParams.push(`%${keyword}%`, `%${keyword}%`); }
  if (type) { where += ' AND d.type = ?'; queryParams.push(type); }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM crm_knowledge_document d ${where}`, queryParams);
  const [rows] = await pool.query(`SELECT d.*, u.real_name as create_by_name FROM crm_knowledge_document d LEFT JOIN sys_user u ON d.create_by = u.id ${where} ORDER BY d.create_time DESC LIMIT ? OFFSET ?`, [...queryParams, parseInt(pageSize), offset]);
  return { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

async function getDocument(pool, id) {
  const [[row]] = await pool.query('SELECT d.*, u.real_name as create_by_name FROM crm_knowledge_document d LEFT JOIN sys_user u ON d.create_by = u.id WHERE d.id = ? AND d.deleted_at IS NULL', [id]);
  return row || null;
}

async function createDocument(pool, data, userId) {
  const [result] = await pool.query(
    'INSERT INTO crm_knowledge_document (name, type, description, file_path, file_size, file_type, create_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [data.name.trim(), data.type, data.description || null, data.filePath, data.fileSize, data.fileType, userId]
  );
  return { id: result.insertId };
}

async function updateDocument(pool, id, data) {
  const fields = [];
  const values = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()); }
  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE crm_knowledge_document SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
}

async function getDocumentFilePath(pool, id) {
  const [[row]] = await pool.query('SELECT file_path FROM crm_knowledge_document WHERE id = ? AND deleted_at IS NULL', [id]);
  return row?.file_path || null;
}

async function deleteDocument(pool, id) {
  await pool.query('UPDATE crm_knowledge_document SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function incrementDownloadCount(pool, id) {
  await pool.query('UPDATE crm_knowledge_document SET download_count = download_count + 1 WHERE id = ?', [id]);
}

async function getDocumentForDownload(pool, id) {
  const [[row]] = await pool.query('SELECT * FROM crm_knowledge_document WHERE id = ? AND deleted_at IS NULL', [id]);
  return row || null;
}

// ============ 统计 ============

async function getStats(pool) {
  const [[productCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_product WHERE deleted_at IS NULL');
  const [[scriptCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_script WHERE deleted_at IS NULL');
  const [[faqCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_faq WHERE deleted_at IS NULL');
  const [[docCount]] = await pool.query('SELECT COUNT(*) as cnt FROM crm_knowledge_document WHERE deleted_at IS NULL');
  const [recentProducts] = await pool.query('SELECT id, name, category, create_time FROM crm_knowledge_product WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');
  const [recentScripts] = await pool.query('SELECT id, title, scene, create_time FROM crm_knowledge_script WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');
  const [recentFaqs] = await pool.query('SELECT id, question, category, create_time FROM crm_knowledge_faq WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');
  const [recentDocs] = await pool.query('SELECT id, name, type, create_time FROM crm_knowledge_document WHERE deleted_at IS NULL ORDER BY update_time DESC LIMIT 5');
  return {
    counts: { products: productCount.cnt, scripts: scriptCount.cnt, faqs: faqCount.cnt, documents: docCount.cnt },
    recent: { products: recentProducts, scripts: recentScripts, faqs: recentFaqs, documents: recentDocs }
  };
}

module.exports = {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct, addProductImages, getProductCategories,
  listScripts, getScript, createScript, updateScript, deleteScript, getScriptScenes,
  listFaqs, getFaq, createFaq, updateFaq, deleteFaq, getFaqCategories,
  listDocuments, getDocument, createDocument, updateDocument, getDocumentFilePath, deleteDocument, incrementDownloadCount, getDocumentForDownload,
  getStats
};

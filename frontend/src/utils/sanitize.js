// [性能优化] DOMPurify 按需懒加载（~134KB），避免启动时阻塞
let DOMPurify = null;

async function getDOMPurify() {
  if (!DOMPurify) {
    const module = await import('dompurify');
    DOMPurify = module.default;
  }
  return DOMPurify;
}

/**
 * 净化 HTML 内容（移除 XSS 攻击向量）
 * @param {string} html - 原始 HTML 字符串
 * @returns {Promise<string>} - 安全的 HTML 字符串
 */
export async function sanitize(html) {
  if (!html || typeof html !== 'string') return '';
  const purifier = await getDOMPurify();
  return purifier.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'table', 'thead',
      'tbody', 'tr', 'td', 'th', 'blockquote', 'code', 'pre', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
  });
}

// [性能优化] DOMPurify 按需懒加载（~134KB），避免启动时阻塞
let DOMPurify = null;

async function getDOMPurify() {
  if (!DOMPurify) {
    const module = await import('dompurify');
    DOMPurify = module.default;
  }
  return DOMPurify;
}

/** 文本类 HTML 白名单：邮件正文等不可信富文本（不含任何 SVG 标签） */
const TEXT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'table', 'thead',
  'tbody', 'tr', 'td', 'th', 'blockquote', 'code', 'pre', 'hr'];
const TEXT_ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

/**
 * SVG 图形白名单：服务端可信生成的内容（svg-captcha 验证码）。
 * 仅图形元素与几何/样式属性——无 script/foreignObject/use/xlink，无事件属性。
 */
const SVG_ALLOWED_TAGS = ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line',
  'polyline', 'polygon', 'text', 'tspan'];
const SVG_ALLOWED_ATTR = ['xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity',
  'opacity', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'points', 'transform', 'text-anchor', 'font-size', 'font-family', 'font-weight'];

/**
 * 净化 HTML 内容（移除 XSS 攻击向量）
 * @param {string} html - 原始 HTML 字符串
 * @returns {Promise<string>} - 安全的 HTML 字符串
 */
export async function sanitize(html) {
  if (!html || typeof html !== 'string') return '';
  const purifier = await getDOMPurify();
  return purifier.sanitize(html, {
    ALLOWED_TAGS: TEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: TEXT_ALLOWED_ATTR,
    ADD_ATTR: ['target']  // 保留 target 属性
  });
  // 注：DOMPurify 默认会移除 javascript: 等危险协议，
  // target="_blank" 的 reverse tabnabbing 风险由 ADD_ATTR 保留 + 外部 rel="noopener" 约定控制
}

/**
 * 净化 SVG 图形内容（验证码等服务端生成图形）
 * @param {string} svg - 原始 SVG 字符串
 * @returns {Promise<string>} - 仅保留图形元素的安全 SVG 字符串
 */
export async function sanitizeSvg(svg) {
  if (!svg || typeof svg !== 'string') return '';
  const purifier = await getDOMPurify();
  return purifier.sanitize(svg, {
    ALLOWED_TAGS: SVG_ALLOWED_TAGS,
    ALLOWED_ATTR: SVG_ALLOWED_ATTR
  });
}

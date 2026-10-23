import { sanitize, sanitizeSvg } from '@/utils/sanitize';

function apply(el, binding, sanitizer) {
  return sanitizer(binding.value).then((clean) => {
    el.innerHTML = clean;
  });
}

export const vSafeHtml = {
  async mounted(el, binding) {
    await apply(el, binding, sanitize);
  },
  async updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      await apply(el, binding, sanitize);
    }
  }
};

// SVG 图形专用（验证码等服务端可信生成内容）：保留图形元素，剥除脚本/事件/外链
export const vSafeSvg = {
  async mounted(el, binding) {
    await apply(el, binding, sanitizeSvg);
  },
  async updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      await apply(el, binding, sanitizeSvg);
    }
  }
};

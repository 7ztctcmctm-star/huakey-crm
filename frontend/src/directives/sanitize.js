import { sanitize } from '@/utils/sanitize';

export const vSafeHtml = {
  mounted(el, binding) {
    el.innerHTML = sanitize(binding.value);
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.innerHTML = sanitize(binding.value);
    }
  }
};

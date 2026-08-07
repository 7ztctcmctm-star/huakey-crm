import { sanitize } from '@/utils/sanitize';

export const vSafeHtml = {
  async mounted(el, binding) {
    el.innerHTML = await sanitize(binding.value);
  },
  async updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.innerHTML = await sanitize(binding.value);
    }
  }
};

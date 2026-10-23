import { onFCP, onLCP, onCLS, onINP, onTTFB } from 'web-vitals';
import { reportWarn } from '@/utils/error'

const isProd = import.meta.env.PROD;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function sendMetric(name, value, rating) {
  if (isProd) {
    navigator.sendBeacon(`${apiBaseUrl}/metrics/client`, new Blob([JSON.stringify({
      metric_type: name,
      value,
      rating,
      page_url: location.pathname
      // timestamp 未发送：后端 Joi schema 未声明，validate 中间件 stripUnknown 会静默剥掉，
      // 且后端 metrics 表 created_at 已自带入库时间戳，客户端发送的 timestamp 无额外价值。
    })], { type: 'application/json' }));
  } else if (rating !== 'good') {
    reportWarn(`[Perf] ${name}: ${value} (${rating})`);
  }
}

export function initPerfume() {
  onFCP(m => sendMetric('FCP', m.value, m.rating));
  onLCP(m => sendMetric('LCP', m.value, m.rating));
  onCLS(m => sendMetric('CLS', m.value, m.rating));
  onINP(m => sendMetric('INP', m.value, m.rating));
  onTTFB(m => sendMetric('TTFB', m.value, m.rating));
}

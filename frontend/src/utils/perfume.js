import { onFCP, onLCP, onCLS, onINP, onTTFB } from 'web-vitals';

const isProd = import.meta.env.PROD;

function sendMetric(name, value, rating) {
  if (isProd) {
    navigator.sendBeacon('/api/metrics/client', JSON.stringify({
      metric_type: name,
      value,
      rating,
      page_url: location.pathname,
      timestamp: new Date().toISOString()
    }));
  } else if (rating !== 'good') {
    console.warn(`[Perf] ${name}: ${value} (${rating})`);
  }
}

export function initPerfume() {
  onFCP(m => sendMetric('FCP', m.value, m.rating));
  onLCP(m => sendMetric('LCP', m.value, m.rating));
  onCLS(m => sendMetric('CLS', m.value, m.rating));
  onINP(m => sendMetric('INP', m.value, m.rating));
  onTTFB(m => sendMetric('TTFB', m.value, m.rating));
}

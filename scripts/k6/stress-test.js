import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // 预热
    { duration: '3m', target: 50 },   // 爬升
    { duration: '3m', target: 50 },   // 稳态
    { duration: '1m', target: 0 }     // 冷却
  ],
  thresholds: {
    errors: ['rate<0.01'],             // 错误率 < 1%
    api_latency: ['p(95)<1000']        // P95 < 1s
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api/v1';

export default function () {
  const res = http.get(`${BASE_URL}/health`);

  check(res, { 'status 200': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
  apiLatency.add(res.timings.duration);

  sleep(1);
}

/**
 * k6 冒烟测试 — 健康检查端点
 *
 * 不阻断 CI，仅手动或 Release 触发：
 *   k6 run -e BASE_URL=http://192.168.0.200:5000 tests/performance/k6-smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,        // 10 个虚拟用户
  duration: '30s' // 持续 30 秒
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
    'health data.status ok': (r) => JSON.parse(r.body).data.status === 'ok',
    'response time < 500ms': (r) => r.timings.duration < 500
  });
  sleep(1);
}

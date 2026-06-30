/**
 * k6 客户列表性能基线测试
 *
 * 运行方式：
 *   k6 run -e BASE_URL=http://192.168.0.200:5000 -e TOKEN=xxx tests/performance/k6-customer-list.js
 *
 * 阈值说明：
 *   - P95 响应时间 < 1s
 *   - 错误率 < 1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // P95 < 1s
    http_req_failed: ['rate<0.01']      // 错误率 < 1%
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const TOKEN = __ENV.TOKEN;

export default function () {
  const res = http.post(`${BASE_URL}/api/v1/customer/list`,
    JSON.stringify({ page: 1, pageSize: 20 }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    }
  );
  check(res, {
    'customer list 200': (r) => r.status === 200,
    'response time < 1000ms': (r) => r.timings.duration < 1000
  });
  sleep(1);
}


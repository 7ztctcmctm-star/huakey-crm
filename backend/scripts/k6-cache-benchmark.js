/**
 * k6 缓存热点端点压测脚本
 *
 * 用法:
 *   k6 run -e API_BASE=http://localhost:5000 -e TOKEN=your_jwt_token scripts/k6-cache-benchmark.js
 *
 * 指标:
 *   - 20 VUs × 60s
 *   - 对比缓存命中前后的 P95 延迟
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const API_BASE = __ENV.API_BASE || 'http://localhost:5000';
const TOKEN = __ENV.TOKEN || '';

if (!TOKEN) {
  throw new Error('缺少 TOKEN 环境变量，请先登录获取 JWT');
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`
};

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // 预热
    { duration: '60s', target: 20 }, // 稳定压测
    { duration: '10s', target: 0 }   // 收尾
  ],
  thresholds: {
    http_req_duration: ['p(95)<200']
  }
};

export default function () {
  const scenarios = [
    {
      name: 'customer/list',
      method: 'POST',
      url: `${API_BASE}/api/v1/customer/list`,
      body: JSON.stringify({ page: 1, pageSize: 20 })
    },
    {
      name: 'report/overview',
      method: 'GET',
      url: `${API_BASE}/api/v1/report/overview`
    },
    {
      name: 'report/sales-funnel',
      method: 'GET',
      url: `${API_BASE}/api/v1/report/sales-funnel`
    }
  ];

  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  const res = http.request(scenario.method, scenario.url, scenario.body, { headers });

  check(res, {
    [`${scenario.name} status is 200`]: (r) => r.status === 200,
    [`${scenario.name} response code is 200`]: (r) => {
      try {
        return r.json('code') === 200;
      } catch {
        return false;
      }
    }
  });

  sleep(0.5 + Math.random());
}

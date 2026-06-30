/**
 * k6 API 性能基线测试
 * 覆盖 6 个核心 API，验证 P95 延迟在阈值内。
 *
 * 用法：
 *   k6 run -e BASE_URL=http://localhost:5000 tests/performance/k6-api-baseline.js
 * 或带预取 token：
 *   k6 run -e BASE_URL=http://localhost:5000 -e TEST_TOKEN=xxx tests/performance/k6-api-baseline.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend } from 'k6/metrics';

// 自定义趋势指标（用于 P95 断言）
const loginDuration = new Trend('login_duration', true);
const customerListDuration = new Trend('customer_list_duration', true);
const salesFunnelDuration = new Trend('sales_funnel_duration', true);
const opportunityListDuration = new Trend('opportunity_list_duration', true);
const productListDuration = new Trend('product_list_duration', true);
const healthDuration = new Trend('health_duration', true);

export const options = {
  vus: 10,
  duration: '60s',
  thresholds: {
    'login_duration': ['p(95)<500'],
    'customer_list_duration': ['p(95)<1000'],
    'sales_funnel_duration': ['p(95)<2000'],
    'opportunity_list_duration': ['p(95)<1000'],
    'product_list_duration': ['p(95)<500'],
    'health_duration': ['p(95)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

/**
 * 获取认证 token（优先使用环境变量 TEST_TOKEN，否则调用登录 API）
 */
function getToken() {
  const existingToken = __ENV.TEST_TOKEN;
  if (existingToken) return existingToken;

  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    username: 'admin',
    password: 'huakey123',
    captcha: 'dev1',
    captchaKey: 'dev',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const body = JSON.parse(loginRes.body);
  if (body.code === 200 && body.data && body.data.token) {
    return body.data.token;
  }
  throw new Error(`Login failed: ${loginRes.body}`);
}

export default function () {
  const token = getToken();
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 1. 登录（每 VU 执行一次，验证认证链路）
  group('login', () => {
    const res = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
      username: 'admin',
      password: 'huakey123',
      captcha: 'dev1',
      captchaKey: 'dev',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    loginDuration.add(res.timings.duration);
    check(res, {
      'login status 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // 2. 健康检查
  group('health', () => {
    const res = http.get(`${BASE_URL}/api/v1/health`);
    healthDuration.add(res.timings.duration);
    check(res, {
      'health status 200': (r) => r.status === 200,
    });
  });

  sleep(0.2);

  // 3. 客户列表
  group('customer_list', () => {
    const res = http.get(`${BASE_URL}/api/v1/customer?page=1&pageSize=20`, { headers: authHeaders });
    customerListDuration.add(res.timings.duration);
    check(res, {
      'customer list status 200': (r) => r.status === 200,
    });
  });

  sleep(0.2);

  // 4. 商机列表
  group('opportunity_list', () => {
    const res = http.get(`${BASE_URL}/api/v1/opportunity?page=1&pageSize=20`, { headers: authHeaders });
    opportunityListDuration.add(res.timings.duration);
    check(res, {
      'opportunity list status 200': (r) => r.status === 200,
    });
  });

  sleep(0.2);

  // 5. 产品列表
  group('product_list', () => {
    const res = http.get(`${BASE_URL}/api/v1/product?page=1&pageSize=20`, { headers: authHeaders });
    productListDuration.add(res.timings.duration);
    check(res, {
      'product list status 200': (r) => r.status === 200,
    });
  });

  sleep(0.2);

  // 6. 销售漏斗
  group('sales_funnel', () => {
    const res = http.get(`${BASE_URL}/api/v1/report/sales-funnel`, { headers: authHeaders });
    salesFunnelDuration.add(res.timings.duration);
    check(res, {
      'sales funnel status 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);
}

import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:8001';
const workload = __ENV.WORKLOAD || 'archive';
const rate = Number(__ENV.RATE || 200);
const duration = __ENV.DURATION || '60s';
const archiveDate = '2025-11-01';

function forecastUrl() {
  const date = workload === 'future-mixed' || workload === 'future-cold'
    ? new Date(Date.UTC(workload === 'future-cold' ? 2027 : 2026, 0, 1 + (exec.scenario.iterationInTest % 365))).toISOString().slice(0, 10)
    : workload === 'future' ? '2026-09-27' : archiveDate;
  return `${baseUrl}/forecast?route_id=demo-1&horizon=day&resolution=PT1H&from=${date}T08:00:00%2B03:00&to=${date}T09:00:00%2B03:00`;
}

export const options = {
  scenarios: {
    forecast: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: Math.max(50, rate),
      maxVUs: Math.max(200, rate * 3),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
    dropped_iterations: ['count==0'],
  },
};

export default function () {
  const response = http.get(forecastUrl(), { timeout: '10s', tags: { workload } });
  check(response, {
    'valid forecast': (r) => r.status === 200 &&
      r.json('is_mock') === false &&
      r.json('points.0.predicted_load') !== undefined,
  });
}

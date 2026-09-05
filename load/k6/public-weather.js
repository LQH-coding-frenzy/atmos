/* global __ENV */

import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL;
if (!baseUrl) throw new Error('BASE_URL is required');

export const options = {
  scenarios: {
    public_weather: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 5,
      maxVUs: 10,
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_duration: ['p(95)<1000'],
  },
};

const weatherPath =
  '/api/v1/weather/dashboard?lat=52.52&lon=13.405&timezone=Europe%2FBerlin&units=metric';

export function setup() {
  http.get(`${baseUrl}${weatherPath}`);
}

export default function () {
  const response = http.get(`${baseUrl}${weatherPath}`, { tags: { route: 'public-weather' } });

  check(response, {
    'returns 200': (result) => result.status === 200,
    'returns a cache state': (result) => ['HIT', 'MISS'].includes(result.headers['X-Cache']),
    'returns a request id': (result) => Boolean(result.headers['X-Request-Id']),
  });
}

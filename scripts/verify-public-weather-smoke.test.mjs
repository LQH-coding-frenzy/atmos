import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPublicWeatherSmoke } from './verify-public-weather-smoke.mjs';

const headers = (cache, requestId = 'smoke-request-1') =>
  [
    'HTTP/2 200',
    'content-type: application/json; charset=utf-8',
    'cache-control: no-store',
    `x-cache: ${cache}`,
    `x-request-id: ${requestId}`,
    '',
    '',
  ].join('\r\n');

const dashboard = (cached = false) =>
  JSON.stringify({
    location: { latitude: 52.52, longitude: 13.405 },
    current: { temperatureC: 14 },
    hourly: [{ time: '2026-10-30T11:00:00.000Z' }],
    daily: [{ date: '2026-10-30' }],
    meta: { provider: 'open-meteo', cached, stale: false },
  });

const airQualityTimeline = (cached = false) =>
  JSON.stringify({
    pollutants: { pm25: 7.2 },
    timeline: { kind: 'model', hours: [{ time: '2026-10-30T11:00:00.000Z' }] },
    meta: { provider: 'open-meteo', cached, stale: false },
  });

const airQualityWithoutTimeline = JSON.stringify({
  pollutants: { pm25: 7.2 },
  meta: { provider: 'open-meteo', cached: false, stale: false },
});

test('public weather smoke validation accepts a fresh dashboard miss', () => {
  assert.equal(
    verifyPublicWeatherSmoke('dashboard', 200, headers('MISS'), dashboard(false)),
    'MISS',
  );
});

test('public weather smoke validation accepts a fresh AQI timeline hit', () => {
  assert.equal(
    verifyPublicWeatherSmoke('air-quality', 200, headers('HIT'), airQualityTimeline(true)),
    'HIT',
  );
});

test('public weather smoke validation rejects non-200, stale, and invalid responses', () => {
  assert.throws(
    () => verifyPublicWeatherSmoke('dashboard', 503, headers('MISS'), '{}'),
    /dashboard smoke returned HTTP 503/,
  );
  assert.throws(
    () => verifyPublicWeatherSmoke('dashboard', 200, headers('STALE'), dashboard(false)),
    /did not return fresh cache data/,
  );
  assert.throws(
    () => verifyPublicWeatherSmoke('air-quality', 200, headers('MISS'), airQualityWithoutTimeline),
    /did not match the public timeline contract/,
  );
});

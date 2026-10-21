import { createServer } from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';

const mockGatewayPort = 8790;
const startTime = new Date('2026-09-01T10:00:00.000Z');

function forecastDate(index) {
  const date = new Date(startTime);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function timeAt(hourOffset) {
  return new Date(startTime.getTime() + hourOffset * 60 * 60 * 1_000).toISOString();
}

function dashboardFor(requestUrl) {
  const latitude = Number(requestUrl.searchParams.get('lat')) || 52.52;
  const longitude = Number(requestUrl.searchParams.get('lon')) || 13.405;
  const timezone = requestUrl.searchParams.get('timezone') || 'Europe/Berlin';
  const extendedDaily = Array.from({ length: 16 }, (_, index) => ({
    date: forecastDate(index),
    highC: 23 + (index % 4),
    lowC: 14 + (index % 3),
    precipitationProbability: index < 10 ? 15 : null,
    condition: index > 8 ? 'rain' : 'partly-cloudy',
    apparentTemperatureMaxC: 22 + (index % 4),
    humidityMeanPercent: 55 + (index % 10),
    pressureMeanHpa: 1010,
    cloudCoverMeanPercent: 30 + (index % 20),
    visibilityMeanM: 10_000,
    precipitationMm: index === 3 ? null : index * 1.25,
    rainMm: index === 3 ? null : index,
    snowfallCm: 0,
    uvIndexMax: 5,
    windSpeedMaxKph: 10 + (index % 8),
    windGustMaxKph: 16 + (index % 8),
    sunrise: `${forecastDate(index)}T05:00:00.000Z`,
    sunset: `${forecastDate(index)}T18:00:00.000Z`,
    daylightSeconds: 46_800,
  }));

  return {
    location: {
      id: `${latitude}:${longitude}`,
      name: 'Berlin',
      country: 'Germany',
      latitude,
      longitude,
      timezone,
    },
    current: {
      observedAt: '2026-09-01T10:00:00.000Z',
      temperatureC: 20,
      apparentTemperatureC: 19,
      humidityPercent: 64,
      windSpeedKph: 13,
      pressureHpa: 1017,
      condition: 'partly-cloudy',
      windDirectionDegrees: 225,
      windGustKph: 32,
      cloudCoverPercent: 45,
      precipitationMm: 1.25,
      rainMm: 1.25,
      snowfallCm: 0,
      hourlyEstimates: { time: '2026-09-01T10:00:00.000Z', visibilityM: 10_000, uvIndex: 3 },
    },
    hourly: Array.from({ length: 24 }, (_, index) => ({
      time: timeAt(index + 1),
      temperatureC: 20 + (index % 5),
      apparentTemperatureC: 19 + (index % 5),
      humidityPercent: 60 + (index % 10),
      pressureHpa: 1017,
      windSpeedKph: 13 + (index % 6),
      windGustKph: 20 + (index % 8),
      windDirectionDegrees: 225,
      precipitationProbability: 15,
      condition: 'partly-cloudy',
      precipitationMm: 0,
      rainMm: 0,
      snowfallCm: 0,
      uvIndex: 3,
      visibilityM: 10_000,
      cloudCoverPercent: 45,
      isDay: index < 12,
    })),
    daily: extendedDaily.slice(0, 7),
    extendedDaily,
    meta: {
      provider: 'open-meteo',
      cached: false,
      stale: false,
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/v1/weather/dashboard') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(dashboardFor(url)));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
});

server.listen(mockGatewayPort, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

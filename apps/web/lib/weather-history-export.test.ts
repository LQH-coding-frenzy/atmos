import { describe, expect, it } from 'vitest';
import { weatherHistoryToCsv } from './weather-history-export';

describe('weatherHistoryToCsv', () => {
  it('exports metric values in chronological order and escapes CSV text', () => {
    const later = {
      id: 'later',
      latitude: 52.52,
      longitude: 13.405,
      observed_at: '2026-09-02T10:00:00.000Z',
      provider: 'open-meteo',
      payload: {
        location_name: 'Berlin',
        temperature_c: 20,
        apparent_temperature_c: 19,
        humidity_percent: 64,
        wind_speed_kph: 13,
        pressure_hpa: 1017,
        condition: 'partly-cloudy',
      },
      created_at: '2026-09-02T10:00:00.000Z',
    } as const;
    const earlier = {
      ...later,
      id: 'earlier',
      observed_at: '2026-09-01T10:00:00.000Z',
      payload: { ...later.payload, location_name: 'Paris, "France"' },
    } as const;
    const formula = {
      ...later,
      id: 'formula',
      observed_at: '2026-09-03T10:00:00.000Z',
      payload: { ...later.payload, location_name: '=HYPERLINK("https://example.invalid")' },
    } as const;

    const csv = weatherHistoryToCsv([later, earlier, formula]);
    expect(csv.split('\r\n')[0]).toBe(
      '"location","observed_at","temperature_c","feels_like_c","humidity_percent","wind_speed_kph","pressure_hpa","condition","provider"',
    );
    expect(csv.split('\r\n')[1]).toContain('"Paris, ""France"""');
    expect(csv.indexOf('2026-09-01')).toBeLessThan(csv.indexOf('2026-09-02'));
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain('"20","19","64","13","1017","partly-cloudy","open-meteo"');
  });

  it('exports a header for an empty history range', () => {
    expect(weatherHistoryToCsv([]).split('\r\n')).toHaveLength(1);
  });
});

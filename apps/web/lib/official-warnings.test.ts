import { describe, expect, it, vi } from 'vitest';
import {
  fetchOfficialWarnings,
  getCachedOfficialWarnings,
  officialWarningResponseLimitBytes,
  normalizedWarningCoordinates,
  warningSourceForCountry,
} from './official-warnings';

describe('official warning feed adapters', () => {
  it('selects only explicitly researched US and Canadian country names', () => {
    expect(warningSourceForCountry('United States')).toBe('nws');
    expect(warningSourceForCountry('United States of America')).toBe('nws');
    expect(warningSourceForCountry('Canada')).toBe('eccc');
    for (const country of ['', 'Selected location', 'Germany', 'US', 'CA']) {
      expect(warningSourceForCountry(country)).toBeUndefined();
    }
  });

  it('rounds coordinates before building upstream requests', () => {
    expect(normalizedWarningCoordinates({ latitude: 43.653321, longitude: -79.383765 })).toEqual({
      latitude: 43.653,
      longitude: -79.384,
    });
  });

  it('queries the NWS point feed and preserves official text and times', async () => {
    let requests = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      requests += 1;
      const url = new URL(String(input));
      expect(url.origin).toBe('https://api.weather.gov');
      const headers = new Headers(init?.headers);
      expect(headers.get('user-agent')).toContain('AtmosWeather');
      expect(headers.get('accept')).toContain('application/geo+json');
      if (url.pathname.startsWith('/points/')) {
        expect(url.pathname).toBe('/points/38.889,-77.035');
        return Response.json({ properties: { cwa: 'LWX' } });
      }
      expect(url.pathname).toBe('/alerts/active');
      expect(url.searchParams.get('point')).toBe('38.889,-77.035');
      expect(url.searchParams.has('limit')).toBe(false);
      return Response.json({
        type: 'FeatureCollection',
        updated: '2026-10-19T14:00:00.000Z',
        features: [
          {
            id: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.test',
            properties: {
              event: 'Severe Thunderstorm Warning',
              headline: 'Warning issued',
              severity: 'Severe',
              urgency: 'Immediate',
              certainty: 'Observed',
              areaDesc: 'County A; County B',
              sent: '2026-10-19T14:00:00+00:00',
              effective: '2026-10-19T14:00:00+00:00',
              onset: null,
              expires: '2026-10-19T15:00:00+00:00',
              ends: null,
              description: 'Source paragraph one.\n\nSource paragraph two.',
              instruction: 'Take shelter now.',
            },
          },
        ],
      });
    });

    const response = await fetchOfficialWarnings(
      'nws',
      { latitude: 38.8894, longitude: -77.0352 },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(requests).toBe(2);
    expect(response).toMatchObject({
      coverage: 'supported',
      source: 'nws',
      alerts: [
        {
          event: 'Severe Thunderstorm Warning',
          area: 'County A; County B',
          description: 'Source paragraph one.\n\nSource paragraph two.',
          instruction: 'Take shelter now.',
          onsetAt: null,
          sourceUrl: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.test',
        },
      ],
      meta: { cached: false, stale: false, truncated: false },
    });
    expect(response.alerts[0]?.expiresAt).toBe('2026-10-19T15:00:00+00:00');
  });

  it('marks an NWS point outside the service grid unsupported without querying alerts', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect(new URL(String(input)).pathname).toBe('/points/40,-100');
      return new Response(null, { status: 404 });
    });

    const response = await fetchOfficialWarnings('nws', { latitude: 40, longitude: -100 }, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(response).toMatchObject({
      coverage: 'unsupported',
      source: null,
      alerts: [],
      meta: { cached: false, stale: false },
    });
  });

  it('uses ECCC point-intersection filtering and retains the original English alert text', async () => {
    const sourceText = 'Very strong winds expected.\n\nWhere: Whitehorse.';
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://api.weather.gc.ca');
      expect(url.pathname).toBe('/collections/weather-alerts/items');
      expect(url.searchParams.get('filter')).toBe('INTERSECTS(geometry, POINT(-79.384 43.653))');
      expect(url.searchParams.get('limit')).toBe('20');
      expect(url.searchParams.get('properties')).toContain('alert_text_en');
      expect(url.searchParams.get('f')).toBe('json');
      expect(new Headers(init?.headers).get('user-agent')).toContain('AtmosWeather');
      return Response.json({
        type: 'FeatureCollection',
        numberMatched: 1,
        features: [
          {
            id: '1817136761173730213202610180502_fea1-2420',
            type: 'Feature',
            properties: {
              alert_type: 'statement',
              alert_name_en: 'special weather statement',
              alert_short_name_en: 'Special weather',
              publication_datetime: '2026-10-19T12:15:30.158Z',
              expiration_datetime: '2026-10-20T04:15:30.158Z',
              validity_datetime: '2026-10-20T07:00:00.000Z',
              event_end_datetime: '2026-10-21T10:00:00.000Z',
              alert_text_en: sourceText,
              risk_colour_en: null,
              feature_name_en: 'Atlin',
              province: 'BC',
            },
          },
        ],
      });
    });

    const response = await fetchOfficialWarnings(
      'eccc',
      { latitude: 43.6532, longitude: -79.3838 },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(response.alerts[0]).toMatchObject({
      event: 'special weather statement',
      area: 'Atlin',
      description: sourceText,
      publishedAt: '2026-10-19T12:15:30.158Z',
      effectiveAt: '2026-10-20T07:00:00.000Z',
      onsetAt: null,
      expiresAt: '2026-10-20T04:15:30.158Z',
      sourceUrl:
        'https://api.weather.gc.ca/collections/weather-alerts/items/1817136761173730213202610180502_fea1-2420?f=json',
    });
  });

  it('does not trust source-provided NWS links outside the official API origin', async () => {
    let requests = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      requests += 1;
      return requests === 1
        ? Response.json({ properties: { cwa: 'TOP' } })
        : Response.json({
            features: [
              {
                id: 'https://attacker.example/alerts/hostile',
                properties: { event: 'Test alert' },
              },
            ],
          });
    });

    const response = await fetchOfficialWarnings('nws', { latitude: 40, longitude: -100 }, fetcher);

    expect(response.alerts[0]?.sourceUrl).toBe('https://www.weather.gov/alerts');
  });

  it('rejects provider errors, malformed features and oversized responses', async () => {
    const upstreamError = vi.fn<typeof fetch>(
      async () => new Response('private details', { status: 429 }),
    );
    await expect(
      fetchOfficialWarnings('nws', { latitude: 40, longitude: -100 }, upstreamError),
    ).rejects.toThrow('NWS point lookup returned an error');

    const malformed = vi.fn<typeof fetch>(async () =>
      Response.json({ features: [{ properties: {} }] }),
    );
    await expect(
      fetchOfficialWarnings('eccc', { latitude: 50, longitude: -100 }, malformed),
    ).rejects.toThrow('Official warning field id is missing');

    const oversized = vi.fn<typeof fetch>(
      async () =>
        new Response('x'.repeat(officialWarningResponseLimitBytes + 1), {
          headers: { 'content-length': String(officialWarningResponseLimitBytes + 1) },
        }),
    );
    await expect(
      fetchOfficialWarnings('nws', { latitude: 40, longitude: -100 }, oversized),
    ).rejects.toThrow('Official warning response exceeded the size limit');

    const streamedOversized = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(officialWarningResponseLimitBytes + 1));
              controller.close();
            },
          }),
        ),
    );
    await expect(
      fetchOfficialWarnings('eccc', { latitude: 50, longitude: -100 }, streamedOversized),
    ).rejects.toThrow('Official warning response exceeded the size limit');
  });

  it('reports incomplete provider pages instead of implying the result is exhaustive', async () => {
    const features = Array.from({ length: 20 }, (_, index) => ({
      id: `alert-${index}`,
      properties: { alert_type: 'warning', event: `Alert ${index}` },
    }));
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ features, numberMatched: 27 }));

    const response = await fetchOfficialWarnings(
      'eccc',
      { latitude: 50, longitude: -100 },
      fetcher,
    );

    expect(response.alerts).toHaveLength(20);
    expect(response.meta.truncated).toBe(true);
  });
});

describe('official warning server cache', () => {
  it('reuses normalized results for equivalent coordinates within its fresh window', async () => {
    let now = Date.now();
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ type: 'FeatureCollection', features: [], numberMatched: 0 }),
    );

    const first = await getCachedOfficialWarnings(
      'eccc',
      { latitude: 47.12341, longitude: -72.23451 },
      fetcher,
      () => now,
    );
    now += 30_000;
    const second = await getCachedOfficialWarnings(
      'eccc',
      { latitude: 47.12344, longitude: -72.23454 },
      fetcher,
      () => now,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(first.meta).toMatchObject({ cached: false, stale: false });
    expect(second.meta).toMatchObject({ cached: true, stale: false });
  });

  it('serves explicitly stale data if a refresh fails within the stale window', async () => {
    let now = Date.now();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ type: 'FeatureCollection', features: [] }))
      .mockRejectedValueOnce(new Error('private upstream detail'));
    const input = { latitude: 61.1247, longitude: -109.3652 };

    await getCachedOfficialWarnings('eccc', input, fetcher, () => now);
    now += 61_000;
    const stale = await getCachedOfficialWarnings('eccc', input, fetcher, () => now);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(stale).toMatchObject({
      coverage: 'supported',
      source: 'eccc',
      meta: { cached: true, stale: true },
    });
  });
});

describe('official warning server cache', () => {
  it('caches canonical coordinates and coalesces equivalent points for one minute', async () => {
    let now = 10_000;
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ type: 'FeatureCollection', features: [], numberMatched: 0 }),
    );

    const first = await getCachedOfficialWarnings(
      'eccc',
      { latitude: 43.65321, longitude: -79.38321 },
      fetcher,
      () => now,
    );
    now += 30_000;
    const second = await getCachedOfficialWarnings(
      'eccc',
      { latitude: 43.65324, longitude: -79.38324 },
      fetcher,
      () => now,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(first.meta).toMatchObject({ cached: false, stale: false });
    expect(second.meta).toMatchObject({ cached: true, stale: false });
  });

  it('serves explicitly stale warning data when a refresh fails inside its stale window', async () => {
    let now = 1_000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ type: 'FeatureCollection', features: [] }))
      .mockRejectedValueOnce(new Error('private upstream detail'));
    const input = { latitude: 63.7467, longitude: -68.5167 };

    await getCachedOfficialWarnings('eccc', input, fetcher, () => now);
    now += 61_000;
    const stale = await getCachedOfficialWarnings('eccc', input, fetcher, () => now);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(stale).toMatchObject({
      coverage: 'supported',
      source: 'eccc',
      meta: { cached: true, stale: true },
    });
  });
});

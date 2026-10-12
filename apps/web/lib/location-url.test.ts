import { describe, expect, it } from 'vitest';
import { locationFromShareUrl } from './location-url';

describe('locationFromShareUrl', () => {
  it('distinguishes the root dashboard from an explicit shared city', () => {
    expect(locationFromShareUrl(new URL('https://weather.example/'))).toEqual({ kind: 'root' });
    expect(
      locationFromShareUrl(
        new URL(
          'https://weather.example/?lat=48.8534&lon=2.3488&timezone=Europe%2FParis&name=Paris&country=France',
        ),
      ),
    ).toEqual({
      kind: 'location',
      location: {
        id: 'shared:48.8534:2.3488',
        name: 'Paris',
        country: 'France',
        latitude: 48.8534,
        longitude: 2.3488,
        timezone: 'Europe/Paris',
      },
    });
  });

  it('rejects partial, non-numeric, out-of-range, or incomplete share parameters', () => {
    expect(locationFromShareUrl(new URL('https://weather.example/?lat=48'))).toEqual({
      kind: 'invalid',
    });
    expect(locationFromShareUrl(new URL('https://weather.example/?lat=north&lon=2'))).toEqual({
      kind: 'invalid',
    });
    expect(locationFromShareUrl(new URL('https://weather.example/?lat=91&lon=2'))).toEqual({
      kind: 'invalid',
    });
    expect(
      locationFromShareUrl(new URL('https://weather.example/?lat=48.8534&lon=2.3488&name=Paris')),
    ).toEqual({ kind: 'invalid' });
  });
});

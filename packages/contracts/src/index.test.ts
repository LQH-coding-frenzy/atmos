import { describe, expect, it } from 'vitest';
import {
  locationInputSchema,
  savedLocationResponseSchema,
  savedLocationsResponseSchema,
} from './index';

describe('locationInputSchema', () => {
  it('rejects coordinates outside the valid range', () => {
    expect(() =>
      locationInputSchema.parse({ latitude: 91, longitude: 13, timezone: 'Europe/Berlin' }),
    ).toThrow();
  });
});

describe('saved-location API contracts', () => {
  const location = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Paris',
    latitude: 48.8534,
    longitude: 2.3488,
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
  };

  it('accepts the authenticated list and create response shapes', () => {
    expect(savedLocationsResponseSchema.parse({ locations: [location] }).locations).toEqual([
      location,
    ]);
    expect(savedLocationResponseSchema.parse({ location }).location).toEqual(location);
  });

  it('rejects invalid coordinates and malformed response fields', () => {
    expect(() =>
      savedLocationsResponseSchema.parse({ locations: [{ ...location, latitude: 91 }] }),
    ).toThrow();
    expect(() =>
      savedLocationResponseSchema.parse({ location: { ...location, id: 'bad' } }),
    ).toThrow();
  });
});

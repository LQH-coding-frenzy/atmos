import { describe, expect, it } from 'vitest';
import { parseProfilePreferencesUpdate } from './profile-preferences.ts';

describe('profile preference update parser', () => {
  it('accepts only validated preference fields and trims the display name', () => {
    expect(
      parseProfilePreferencesUpdate({
        display_name: '  Weather user  ',
        units: 'imperial',
        timezone: ' Europe/Paris ',
        theme: 'dark',
      }),
    ).toEqual({
      display_name: 'Weather user',
      units: 'imperial',
      timezone: 'Europe/Paris',
      theme: 'dark',
    });
    expect(parseProfilePreferencesUpdate({ timezone: 'auto' })).toEqual({ timezone: 'auto' });
  });

  it('rejects unknown privilege/ownership fields, empty payloads, and invalid values', () => {
    for (const update of [
      undefined,
      null,
      [],
      {},
      { display_name: '  ' },
      { display_name: 'x'.repeat(81) },
      { units: 'kelvin' },
      { theme: 'auto' },
      { timezone: 'not/a-real-timezone' },
      { user_id: '00000000-0000-4000-8000-000000000001' },
      { role: 'owner' },
    ]) {
      expect(parseProfilePreferencesUpdate(update)).toBeUndefined();
    }
  });
});

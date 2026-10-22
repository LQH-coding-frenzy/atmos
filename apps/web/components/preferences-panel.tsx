'use client';

import {
  profilePreferencesResponseSchema,
  profilePreferencesUpdateSchema,
  type AppRole,
  type ProfilePreferencesResponse,
  type ThemePreference,
  type UnitSystem,
} from '@atmos/contracts';
import type { Session } from '@supabase/supabase-js';
import { Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { versionAffinityHeaders } from '../lib/version-affinity';

const themes: Array<{ label: string; value: ThemePreference }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];
const unitOptions: Array<{ label: string; value: UnitSystem }> = [
  { label: 'Celsius', value: 'metric' },
  { label: 'Fahrenheit', value: 'imperial' },
];

type AccountSettings = {
  displayName: string;
  units: UnitSystem;
  theme: ThemePreference;
  timezone: string;
};

type ProfileStatus = 'loading' | 'ready' | 'unavailable' | 'signed-out';

type PreferencesPanelProps = {
  gatewayOrigin: string;
  units: UnitSystem;
  theme: ThemePreference;
  timezonePreference: string;
  onUnitsChange: (units: UnitSystem) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onTimezoneChange: (timezone: string) => void;
};

async function requestProfile(
  gatewayOrigin: string,
  session: Session,
  method: 'GET' | 'PATCH',
  body?: unknown,
) {
  const response = await fetch(new URL('/api/v1/me', gatewayOrigin), {
    method,
    cache: 'no-store',
    headers: {
      ...versionAffinityHeaders(),
      Authorization: `Bearer ${session.access_token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = profilePreferencesResponseSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!response.ok || !parsed.success) throw new Error('Account settings are unavailable');
  return parsed.data;
}

export function PreferencesPanel({
  gatewayOrigin,
  units,
  theme,
  timezonePreference,
  onUnitsChange,
  onThemeChange,
  onTimezoneChange,
}: PreferencesPanelProps) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [profileRole, setProfileRole] = useState<AppRole>('user');
  const [profileName, setProfileName] = useState('');
  const [timezoneDraft, setTimezoneDraft] = useState(timezonePreference);
  const [savedSettings, setSavedSettings] = useState<AccountSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const applyProfile = useCallback(
    (response: ProfilePreferencesResponse) => {
      const nextSettings: AccountSettings = {
        displayName: response.profile.display_name ?? '',
        units: response.preferences.units,
        theme: response.preferences.theme,
        timezone: response.preferences.timezone,
      };
      setProfileName(nextSettings.displayName);
      setProfileRole(response.role ?? 'user');
      setTimezoneDraft(nextSettings.timezone);
      setSavedSettings(nextSettings);
      onUnitsChange(nextSettings.units);
      onThemeChange(nextSettings.theme);
      onTimezoneChange(nextSettings.timezone);
    },
    [onThemeChange, onTimezoneChange, onUnitsChange],
  );

  useEffect(() => {
    if (!client) {
      setAuthReady(true);
      return;
    }
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const userId = session?.user.id;
  const accessToken = session?.access_token;
  useEffect(() => {
    if (!authReady) return;
    if (!session || !accessToken || !userId) {
      setProfileStatus('signed-out');
      setProfileName('');
      setProfileRole('user');
      setTimezoneDraft(timezonePreference);
      setSavedSettings(null);
      setSaved(false);
      setSaveError('');
      return;
    }

    let active = true;
    setProfileStatus('loading');
    setSaveError('');
    void requestProfile(gatewayOrigin, session, 'GET')
      .then((response) => {
        if (!active) return;
        applyProfile(response);
        setProfileStatus('ready');
        setSaved(false);
      })
      .catch(() => {
        if (active) setProfileStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, [accessToken, applyProfile, authReady, gatewayOrigin, retryCount, session, userId]);

  useEffect(() => {
    if (profileStatus === 'signed-out') setTimezoneDraft(timezonePreference);
  }, [profileStatus, timezonePreference]);

  const currentName = profileName.trim();
  const currentTimezone = timezoneDraft.trim();
  const hasUnsavedChanges =
    savedSettings !== null &&
    (currentName !== savedSettings.displayName ||
      units !== savedSettings.units ||
      theme !== savedSettings.theme ||
      currentTimezone !== savedSettings.timezone);

  async function saveAccountSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || profileStatus !== 'ready' || saving) return;

    const update = profilePreferencesUpdateSchema.safeParse({
      display_name: currentName,
      units,
      theme,
      timezone: currentTimezone,
    });
    if (!update.success) {
      setSaved(false);
      setSaveError('Enter a display name and use auto or a valid IANA timezone.');
      return;
    }

    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const response = await requestProfile(gatewayOrigin, session, 'PATCH', update.data);
      applyProfile(response);
      setSaved(true);
    } catch {
      setSaveError('Account settings could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="preferences-panel" name="dashboard-tools">
      <summary aria-controls="preferences-content">
        <Settings2 size={17} aria-hidden="true" />
        <span>Settings</span>
      </summary>
      <section className="preferences-popover" id="preferences-content">
        <h2>Appearance</h2>
        <fieldset>
          <legend>Color theme</legend>
          <div className="preference-segmented" role="group" aria-label="Color theme">
            {themes.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={theme === option.value}
                className={theme === option.value ? 'active' : ''}
                onClick={() => {
                  onThemeChange(option.value);
                  setSaved(false);
                  setSaveError('');
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Temperature units</legend>
          <div className="preference-segmented" role="group" aria-label="Temperature units">
            {unitOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={units === option.value}
                className={units === option.value ? 'active' : ''}
                onClick={() => {
                  onUnitsChange(option.value);
                  setSaved(false);
                  setSaveError('');
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <h2>Account preferences</h2>
        {!authReady || profileStatus === 'loading' ? (
          <p role="status">Loading account settings…</p>
        ) : null}
        {profileStatus === 'signed-out' ? (
          <p>
            Sign in under Saved places to sync your profile and display preferences across devices.
          </p>
        ) : null}
        {profileStatus === 'unavailable' ? (
          <div className="preferences-account-status">
            <p role="alert">Account settings are unavailable.</p>
            <button type="button" onClick={() => setRetryCount((count) => count + 1)}>
              Retry
            </button>
          </div>
        ) : null}
        {profileStatus === 'ready' && session ? (
          <>
            <p className="preferences-account-email">
              Signed in as {session.user.email ?? 'user'}.
            </p>
            <p className="preferences-account-role">
              Account role: <strong>{profileRole === 'owner' ? 'Owner' : 'User'}</strong>
            </p>
            <form className="preferences-account-form" onSubmit={saveAccountSettings}>
              <label htmlFor="preferences-display-name">Display name</label>
              <input
                id="preferences-display-name"
                name="display_name"
                type="text"
                autoComplete="name"
                maxLength={80}
                value={profileName}
                onChange={(event) => {
                  setProfileName(event.currentTarget.value);
                  setSaved(false);
                  setSaveError('');
                }}
              />
              <label htmlFor="preferences-timezone">Display timezone</label>
              <input
                id="preferences-timezone"
                name="timezone"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={80}
                aria-describedby="preferences-timezone-help"
                value={timezoneDraft}
                onChange={(event) => {
                  setTimezoneDraft(event.currentTarget.value);
                  setSaved(false);
                  setSaveError('');
                }}
              />
              <p id="preferences-timezone-help">
                Use auto for the selected location's local time, or enter an IANA zone such as
                America/New_York.
              </p>
              <button type="submit" disabled={!hasUnsavedChanges || saving}>
                {saving ? 'Saving…' : 'Save account settings'}
              </button>
              {saveError ? <p role="alert">{saveError}</p> : null}
              {saved && !hasUnsavedChanges ? <p role="status">Account settings saved.</p> : null}
              {hasUnsavedChanges && !saveError ? (
                <p role="status">Changes apply now. Save to sync them to your account.</p>
              ) : null}
            </form>
          </>
        ) : null}
      </section>
    </details>
  );
}

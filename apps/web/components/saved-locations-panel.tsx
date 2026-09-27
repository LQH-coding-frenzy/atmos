'use client';

import {
  savedLocationResponseSchema,
  savedLocationsResponseSchema,
  type LocationSearchResult,
  type SavedLocation,
} from '@atmos/contracts';
import type { Session } from '@supabase/supabase-js';
import { Bookmark, LogIn, LogOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type SavedLocationsPanelProps = {
  gatewayOrigin: string;
  currentLocation: LocationSearchResult;
  onSelect: (location: LocationSearchResult, shareInUrl?: boolean) => Promise<boolean>;
};

type AuthMode = 'sign-in' | 'sign-up';

async function fetchSavedLocations(gatewayOrigin: string, accessToken: string) {
  const response = await fetch(new URL('/api/v1/locations', gatewayOrigin), {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const parsed = savedLocationsResponseSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!response.ok || !parsed.success) throw new Error('Saved locations are unavailable');
  return parsed.data.locations;
}

export function SavedLocationsPanel({
  gatewayOrigin,
  currentLocation,
  onSelect,
}: SavedLocationsPanelProps) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const panel = useRef<HTMLDetailsElement>(null);
  const locationRequestGeneration = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [message, setMessage] = useState('');

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

  const refreshLocations = useCallback(async () => {
    if (!session) return false;
    const requestGeneration = ++locationRequestGeneration.current;
    setLocationsLoading(true);
    try {
      const nextLocations = await fetchSavedLocations(gatewayOrigin, session.access_token);
      if (requestGeneration !== locationRequestGeneration.current) return false;
      setLocations(nextLocations);
      setMessage('');
      return true;
    } catch {
      if (requestGeneration !== locationRequestGeneration.current) return false;
      setLocations([]);
      setMessage('Saved places are unavailable right now. Please try again.');
      return false;
    } finally {
      if (requestGeneration === locationRequestGeneration.current) setLocationsLoading(false);
    }
  }, [gatewayOrigin, session]);

  useEffect(() => {
    locationRequestGeneration.current += 1;
    if (session) {
      void refreshLocations();
    } else {
      setLocations([]);
      setLocationsLoading(false);
    }
    return () => {
      locationRequestGeneration.current += 1;
    };
  }, [refreshLocations, session]);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setBusy(true);
    setMessage('');
    try {
      if (authMode === 'sign-up') {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage('If sign-up is available for this address, check your email to confirm it.');
        } else {
          setSession(data.session);
          setMessage('Account created. Your saved places are loading.');
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setSession(data.session);
        setMessage('Signed in. Your saved places are loading.');
      }
      setPassword('');
    } catch {
      setMessage(
        authMode === 'sign-up'
          ? 'We could not create the account. Check the details or try again later.'
          : 'Sign-in failed. Check your email and password, then try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!client) return;
    setBusy(true);
    const { error } = await client.auth.signOut();
    setBusy(false);
    if (error) {
      setMessage('Sign-out failed. Please try again.');
      return;
    }
    setSession(null);
    setMessage('Signed out.');
  }

  async function saveCurrentLocation() {
    if (!session) return;
    if (
      locations.some(
        (location) =>
          location.latitude === currentLocation.latitude &&
          location.longitude === currentLocation.longitude,
      )
    ) {
      setMessage('This place is already saved.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(new URL('/api/v1/locations', gatewayOrigin), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: currentLocation.name,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }),
      });
      const parsed = savedLocationResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!response.ok || !parsed.success) throw new Error('Save failed');
      await refreshLocations();
      setMessage(`${parsed.data.location.name} saved to your places.`);
    } catch {
      setMessage('This place could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function selectSavedLocation(location: SavedLocation) {
    const selected = await onSelect(
      {
        id: location.id,
        name: location.name,
        country: 'Saved place',
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: 'auto',
      },
      false,
    );
    if (selected) {
      setMessage(`Showing weather for ${location.name}.`);
      if (panel.current) panel.current.open = false;
    } else {
      setMessage(`Weather for ${location.name} could not be loaded. Please try again.`);
    }
  }

  const currentLocationIsSaved = locations.some(
    (location) =>
      location.latitude === currentLocation.latitude &&
      location.longitude === currentLocation.longitude,
  );

  return (
    <details className="saved-locations-panel" ref={panel}>
      <summary aria-controls="saved-locations-content">
        <Bookmark size={17} aria-hidden="true" />
        <span>Saved places</span>
      </summary>
      <section className="saved-locations-popover" id="saved-locations-content">
        <h2>Your places</h2>
        {!authReady ? <p role="status">Checking account…</p> : null}
        {authReady && !client ? (
          <p role="status">Account access is unavailable. Public weather still works.</p>
        ) : null}
        {authReady && client && !session ? (
          <>
            <form className="saved-location-auth-form" onSubmit={submitAuth}>
              <label htmlFor="saved-location-email">Email</label>
              <input
                id="saved-location-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <label htmlFor="saved-location-password">Password</label>
              <input
                id="saved-location-password"
                type="password"
                autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" disabled={busy}>
                <LogIn size={16} aria-hidden="true" />
                {busy ? 'Please wait…' : authMode === 'sign-up' ? 'Create account' : 'Sign in'}
              </button>
            </form>
            <button
              className="saved-location-mode-toggle"
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in');
                setMessage('');
              }}
            >
              {authMode === 'sign-in'
                ? 'Need an account? Create one'
                : 'Already registered? Sign in'}
            </button>
          </>
        ) : null}
        {authReady && session ? (
          <>
            <div className="saved-location-account">
              <span>{session.user.email}</span>
              <button type="button" onClick={signOut} disabled={busy} aria-label="Sign out">
                <LogOut size={16} aria-hidden="true" />
              </button>
            </div>
            <button
              className="save-current-location"
              type="button"
              onClick={saveCurrentLocation}
              disabled={busy || currentLocationIsSaved}
            >
              {currentLocationIsSaved ? 'Already saved' : `Save ${currentLocation.name}`}
            </button>
            {locationsLoading ? <p role="status">Loading saved places…</p> : null}
            {locations.length > 0 ? (
              <ul aria-label="Your saved places">
                {locations.map((location) => (
                  <li key={location.id}>
                    <button
                      type="button"
                      onClick={() => void selectSavedLocation(location)}
                      disabled={busy}
                    >
                      {location.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!locationsLoading && locations.length === 0 ? (
              <p className="saved-locations-empty">Save this location to find it here later.</p>
            ) : null}
          </>
        ) : null}
        {message ? (
          <p className="saved-location-status" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>
    </details>
  );
}

'use client';

import {
  savedLocationResponseSchema,
  savedLocationsResponseSchema,
  replaceSavedLocationPreferencesSchema,
  type LocationSearchResult,
  type SavedLocation,
} from '@atmos/contracts';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Heart,
  Globe2,
  KeyRound,
  LogIn,
  LogOut,
  Pencil,
  Save,
  Star,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { offlineDashboardStorageKey } from '../lib/offline-dashboard';
import {
  emptySavedPlacePreferences,
  parseSavedPlacePreferences,
  moveSavedLocation,
  orderSavedLocations,
  readSavedPlacePreferences,
  savedPlacePreferencesKey,
  writeSavedPlacePreferences,
  savedPlacePreferencesFromLocations,
  type SavedPlacePreferences,
} from '../lib/saved-place-preferences';
import { versionAffinityHeaders } from '../lib/version-affinity';

type SavedLocationsPanelProps = {
  gatewayOrigin: string;
  currentLocation: LocationSearchResult;
  initialLocationExplicit: boolean;
  onSelect: (
    location: LocationSearchResult,
    urlBehavior?: 'push' | 'clear' | 'preserve',
  ) => Promise<boolean>;
  presentation?: 'page' | 'popover';
};

type AuthMode = 'sign-in' | 'sign-up';

async function fetchSavedLocations(gatewayOrigin: string, accessToken: string) {
  const response = await fetch(new URL('/api/v1/locations', gatewayOrigin), {
    cache: 'no-store',
    headers: {
      ...versionAffinityHeaders(),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const parsed = savedLocationsResponseSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!response.ok || !parsed.success) throw new Error('Saved locations are unavailable');
  return parsed.data;
}

export function SavedLocationsPanel({
  gatewayOrigin,
  currentLocation,
  initialLocationExplicit,
  onSelect,
  presentation = 'popover',
}: SavedLocationsPanelProps) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const panel = useRef<HTMLDetailsElement>(null);
  const locationRequestGeneration = useRef(0);
  const appliedDefaultForUser = useRef<string | null>(null);
  const selectionRef = useRef({ currentLocation, onSelect });
  selectionRef.current = { currentLocation, onSelect };
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsUnavailable, setLocationsUnavailable] = useState(false);
  const [placePreferences, setPlacePreferences] = useState<SavedPlacePreferences>({
    ...emptySavedPlacePreferences,
  });
  const [removingId, setRemovingId] = useState<string>();
  const [confirmRemoveId, setConfirmRemoveId] = useState<string>();
  const [renamingId, setRenamingId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState('');
  const [deleteConfirmationPhrase, setDeleteConfirmationPhrase] = useState('');
  const [message, setMessage] = useState('');
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const persistSavedPlacePreferences = useCallback(
    async (
      accessToken: string,
      nextLocations: SavedLocation[],
      nextPreferences: SavedPlacePreferences,
    ) => {
      const ordered = orderSavedLocations(nextLocations, nextPreferences);
      const body = replaceSavedLocationPreferencesSchema.safeParse({
        locations: ordered.map((location) => ({
          id: location.id,
          is_favorite: location.is_favorite,
          category: location.category,
        })),
        defaultLocationId: nextPreferences.defaultLocationId ?? null,
      });
      if (!body.success) throw new Error('Saved-place preferences are invalid');
      const response = await fetch(new URL('/api/v1/locations/preferences', gatewayOrigin), {
        method: 'PATCH',
        headers: {
          ...versionAffinityHeaders(),
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body.data),
      });
      if (!response.ok) throw new Error('Saved-place preferences could not be synced');
      return ordered.map((location, index) => ({
        ...location,
        sort_order: index,
        is_default: location.id === nextPreferences.defaultLocationId,
      }));
    },
    [gatewayOrigin],
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

  const userId = session?.user.id ?? null;
  useEffect(() => {
    appliedDefaultForUser.current = null;
    if (!userId) {
      setPlacePreferences({ ...emptySavedPlacePreferences });
      return;
    }
    try {
      setPlacePreferences(readSavedPlacePreferences(window.localStorage, userId));
    } catch {
      setPlacePreferences({ ...emptySavedPlacePreferences });
    }
  }, [userId]);

  const refreshLocations = useCallback(async () => {
    if (!session) return false;
    const requestGeneration = ++locationRequestGeneration.current;
    setLocationsLoading(true);
    try {
      const locationResponse = await fetchSavedLocations(gatewayOrigin, session.access_token);
      if (requestGeneration !== locationRequestGeneration.current) return false;
      let nextLocations = locationResponse.locations;
      let nextPreferences: SavedPlacePreferences;
      let preferenceSyncFailed = false;
      if (locationResponse.preferencesInitialized === true) {
        nextPreferences = savedPlacePreferencesFromLocations(nextLocations);
      } else {
        let localPreferences: SavedPlacePreferences;
        try {
          localPreferences = readSavedPlacePreferences(window.localStorage, session.user.id);
        } catch {
          localPreferences = { ...emptySavedPlacePreferences };
        }
        const availableIds = new Set(nextLocations.map((location) => location.id));
        nextPreferences = {
          ...(localPreferences.defaultLocationId &&
          availableIds.has(localPreferences.defaultLocationId)
            ? { defaultLocationId: localPreferences.defaultLocationId }
            : {}),
          orderedLocationIds: [
            ...localPreferences.orderedLocationIds.filter((id) => availableIds.has(id)),
            ...nextLocations
              .filter((location) => !localPreferences.orderedLocationIds.includes(location.id))
              .map((location) => location.id),
          ],
        };
        try {
          if (nextLocations.length > 100)
            throw new Error('Account preference sync is bounded to 100 saved places');
          nextLocations = await persistSavedPlacePreferences(
            session.access_token,
            nextLocations,
            nextPreferences,
          );
        } catch {
          preferenceSyncFailed = true;
          setMessage(
            nextLocations.length > 100
              ? 'Your places are available. Account-synced place preferences support up to 100 saved places; remove some places to enable syncing.'
              : 'Your places are available, but their account preferences could not be synced. They remain saved on this device.',
          );
        }
      }
      setPlacePreferences(nextPreferences);
      writeSavedPlacePreferences(window.localStorage, session.user.id, nextPreferences);
      setLocations(nextLocations);
      setLocationsUnavailable(false);
      if (!preferenceSyncFailed) setMessage('');
      if (!initialLocationExplicit && appliedDefaultForUser.current !== session.user.id) {
        appliedDefaultForUser.current = session.user.id;
        const defaultLocationId = nextPreferences.defaultLocationId;
        const defaultLocation = nextLocations.find((location) => location.id === defaultLocationId);
        const selectedLocation = selectionRef.current.currentLocation;
        if (
          defaultLocation &&
          (defaultLocation.latitude !== selectedLocation.latitude ||
            defaultLocation.longitude !== selectedLocation.longitude ||
            defaultLocation.name !== selectedLocation.name)
        ) {
          setMessage(`Loading your default place ${defaultLocation.name}…`);
          void selectionRef.current
            .onSelect(
              {
                id: defaultLocation.id,
                name: defaultLocation.name,
                country: 'Saved place',
                latitude: defaultLocation.latitude,
                longitude: defaultLocation.longitude,
                timezone: 'auto',
              },
              'preserve',
            )
            .then((loaded) => {
              setMessage(
                loaded
                  ? `Showing your default place ${defaultLocation.name}.`
                  : `Your default place ${defaultLocation.name} could not be loaded.`,
              );
            });
        }
      } else if (appliedDefaultForUser.current === null) {
        appliedDefaultForUser.current = session.user.id;
      }
      return true;
    } catch {
      if (requestGeneration !== locationRequestGeneration.current) return false;
      setLocations([]);
      setLocationsUnavailable(true);
      setMessage('Saved places are unavailable right now. Please try again.');
      return false;
    } finally {
      if (requestGeneration === locationRequestGeneration.current) setLocationsLoading(false);
    }
  }, [gatewayOrigin, persistSavedPlacePreferences, session]);

  useEffect(() => {
    locationRequestGeneration.current += 1;
    if (session) {
      void refreshLocations();
    } else {
      setLocations([]);
      setLocationsLoading(false);
      setLocationsUnavailable(false);
    }
    return () => {
      locationRequestGeneration.current += 1;
    };
  }, [refreshLocations, session]);

  const orderedLocations = useMemo(
    () => orderSavedLocations(locations, placePreferences),
    [locations, placePreferences],
  );

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

  async function signInWithGoogle() {
    if (!client) return;
    setBusy(true);
    setMessage('');
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch {
      setMessage('Google sign-in is unavailable. Check the provider setup and try again.');
      setBusy(false);
    }
  }

  async function updatePlacePreferences(
    next: SavedPlacePreferences,
    nextLocations: SavedLocation[] = locations,
  ) {
    const parsed = parseSavedPlacePreferences(next);
    setPlacePreferences(parsed);
    setLocations(nextLocations);
    if (session) writeSavedPlacePreferences(window.localStorage, session.user.id, parsed);
    if (!session) return true;
    if (nextLocations.length > 100) {
      setMessage('Account-synced place preferences support up to 100 saved places.');
      return false;
    }
    setPreferencesSaving(true);
    try {
      const synced = await persistSavedPlacePreferences(
        session.access_token,
        nextLocations,
        parsed,
      );
      setLocations(synced);
      writeSavedPlacePreferences(window.localStorage, session.user.id, parsed);
      return true;
    } catch {
      setMessage(
        'Your preference change is saved on this device but could not be synced to your account. Retry by changing it again.',
      );
      return false;
    } finally {
      setPreferencesSaving(false);
    }
  }

  async function setDefaultPlace(location: SavedLocation) {
    const defaultLocationId =
      placePreferences.defaultLocationId === location.id ? undefined : location.id;
    const nextPreferences: SavedPlacePreferences = {
      ...placePreferences,
      orderedLocationIds: orderedLocations.map((item) => item.id),
    };
    if (defaultLocationId) nextPreferences.defaultLocationId = defaultLocationId;
    else delete nextPreferences.defaultLocationId;
    const saved = await updatePlacePreferences(nextPreferences);
    if (saved)
      setMessage(
        defaultLocationId
          ? `${location.name} is your default place for your account.`
          : 'Default place cleared for your account.',
      );
  }

  async function moveSavedPlace(location: SavedLocation, direction: -1 | 1) {
    const orderedIds = moveSavedLocation(
      orderedLocations.map((item) => item.id),
      location.id,
      direction,
    );
    if (orderedIds.every((id, index) => id === orderedLocations[index]?.id)) return;
    const saved = await updatePlacePreferences({
      ...placePreferences,
      orderedLocationIds: orderedIds,
    });
    if (saved)
      setMessage(`${location.name} moved ${direction < 0 ? 'up' : 'down'} in your account places.`);
  }

  async function updateSavedPlaceMetadata(
    location: SavedLocation,
    patch: Partial<Pick<SavedLocation, 'is_favorite' | 'category'>>,
  ) {
    const nextLocations = locations.map((item) =>
      item.id === location.id ? { ...item, ...patch } : item,
    );
    const saved = await updatePlacePreferences(placePreferences, nextLocations);
    if (saved) setMessage(`${location.name} preferences saved to your account.`);
  }

  async function requestPasswordReset() {
    if (!client) return;
    const resetEmail = email.trim();
    if (!resetEmail) {
      setMessage('Enter your email address first.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await client.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: new URL('/auth/update-password', window.location.origin).href,
      });
      if (error) throw error;
      setMessage('If an account exists for this address, a password reset link has been sent.');
    } catch {
      setMessage('Password recovery is unavailable right now. Please try again later.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !session?.user.email) return;
    if (
      deleteConfirmationEmail.trim().toLocaleLowerCase('en-US') !==
        session.user.email.trim().toLocaleLowerCase('en-US') ||
      deleteConfirmationPhrase !== 'DELETE'
    ) {
      setMessage('Confirm your account email and type DELETE to continue.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const {
        data: { session: activeSession },
      } = await client.auth.getSession();
      if (!activeSession) throw new Error('Session unavailable');
      const response = await fetch(new URL('/api/v1/account', gatewayOrigin), {
        method: 'DELETE',
        headers: {
          ...versionAffinityHeaders(),
          Authorization: `Bearer ${activeSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationEmail: deleteConfirmationEmail,
          confirmationPhrase: deleteConfirmationPhrase,
        }),
      });
      const body = (await response.json().catch(() => undefined)) as
        { error?: { code?: string } } | undefined;
      if (response.status === 401 && body?.error?.code === 'ACCOUNT_REAUTH_REQUIRED') {
        setMessage('For your security, sign out and sign in again before deleting your account.');
        return;
      }
      if (!response.ok) throw new Error('Account deletion failed');

      const deletedUserId = session.user.id;
      try {
        await client.auth.signOut({ scope: 'local' });
        window.localStorage.removeItem(savedPlacePreferencesKey(deletedUserId));
        window.localStorage.removeItem(offlineDashboardStorageKey);
      } catch {
        // Server-side deletion succeeded; a stale local session is safe to clear on next sign-in.
      }
      setSession(null);
      setLocations([]);
      setPlacePreferences({ ...emptySavedPlacePreferences });
      setDeleteAccountOpen(false);
      setDeleteConfirmationEmail('');
      setDeleteConfirmationPhrase('');
      setMessage('Your account and its saved data were deleted.');
    } catch {
      setMessage('Account deletion is unavailable right now. Please try again later.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentLocation() {
    if (!session) return;
    if (locations.length >= 100) {
      setMessage('An account can save up to 100 places. Remove a place before saving another.');
      return;
    }
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
          ...versionAffinityHeaders(),
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
      'clear',
    );
    if (selected) {
      setMessage(`Showing weather for ${location.name}.`);
      if (presentation === 'popover' && panel.current) panel.current.open = false;
      panel.current?.closest('dialog')?.close();
    } else {
      setMessage(`Weather for ${location.name} could not be loaded. Please try again.`);
    }
  }

  async function removeSavedLocation(location: SavedLocation) {
    if (!session) return;
    setRemovingId(location.id);
    setMessage('');
    try {
      const response = await fetch(
        new URL(`/api/v1/locations/${encodeURIComponent(location.id)}`, gatewayOrigin),
        {
          method: 'DELETE',
          headers: {
            ...versionAffinityHeaders(),
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );
      if (!response.ok) throw new Error('Remove failed');
      locationRequestGeneration.current += 1;
      setLocations((current) => current.filter((item) => item.id !== location.id));
      const nextPreferences: SavedPlacePreferences = {
        ...placePreferences,
        orderedLocationIds: placePreferences.orderedLocationIds.filter((id) => id !== location.id),
      };
      if (nextPreferences.defaultLocationId === location.id) {
        delete nextPreferences.defaultLocationId;
      }
      await updatePlacePreferences(
        nextPreferences,
        locations.filter((item) => item.id !== location.id),
      );
      setConfirmRemoveId(undefined);
      setMessage(`${location.name} removed from your places.`);
    } catch {
      setMessage(`${location.name} could not be removed. Please try again.`);
    } finally {
      setRemovingId(undefined);
    }
  }

  async function renameSavedLocation(
    event: React.FormEvent<HTMLFormElement>,
    location: SavedLocation,
  ) {
    event.preventDefault();
    if (!session) return;
    const name = renameDraft.trim();
    if (name.length < 1 || name.length > 120) {
      setMessage('Choose a place name between 1 and 120 characters.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        new URL(`/api/v1/locations/${encodeURIComponent(location.id)}`, gatewayOrigin),
        {
          method: 'PATCH',
          headers: {
            ...versionAffinityHeaders(),
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name }),
        },
      );
      const parsed = savedLocationResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!response.ok || !parsed.success) throw new Error('Rename failed');
      setLocations((current) =>
        current.map((item) => (item.id === location.id ? parsed.data.location : item)),
      );
      setRenamingId(undefined);
      setRenameDraft('');
      setMessage(`${parsed.data.location.name} renamed.`);
    } catch {
      setMessage(`${location.name} could not be renamed. Please try again.`);
    } finally {
      setBusy(false);
    }
  }

  const currentLocationIsSaved = locations.some(
    (location) =>
      location.latitude === currentLocation.latitude &&
      location.longitude === currentLocation.longitude,
  );
  const preferencesOverLimit = locations.length > 100;

  return (
    <details
      className={
        presentation === 'page'
          ? 'saved-locations-panel saved-locations-page'
          : 'saved-locations-panel'
      }
      name={presentation === 'page' ? undefined : 'dashboard-tools'}
      open={presentation === 'page'}
      ref={panel}
    >
      <summary aria-controls="saved-locations-content">
        <Bookmark size={17} aria-hidden="true" />
        <span>
          {presentation === 'page' ? 'Account controls and saved places' : 'Saved places'}
        </span>
      </summary>
      <section
        className={
          presentation === 'page'
            ? 'saved-locations-popover saved-locations-page-content'
            : 'saved-locations-popover'
        }
        id="saved-locations-content"
      >
        <h2>
          {presentation === 'page'
            ? session
              ? 'Your saved places'
              : 'Make yourself at home.'
            : 'Your places'}
        </h2>
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
            <div className="saved-location-oauth-separator" aria-hidden="true">
              <span>or</span>
            </div>
            <button
              className="google-oauth-button"
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={busy}
            >
              <Globe2 size={16} aria-hidden="true" /> Continue with Google
            </button>
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
            {authMode === 'sign-in' ? (
              <button
                className="saved-location-mode-toggle"
                type="button"
                onClick={() => void requestPasswordReset()}
                disabled={busy}
              >
                <KeyRound size={14} aria-hidden="true" /> Forgot password?
              </button>
            ) : null}
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
            <div className="account-delete-zone">
              <button
                className="account-delete-trigger"
                type="button"
                onClick={() => {
                  setDeleteAccountOpen((open) => !open);
                  setDeleteConfirmationEmail('');
                  setDeleteConfirmationPhrase('');
                  setMessage('');
                }}
                disabled={busy}
                aria-expanded={deleteAccountOpen}
              >
                {deleteAccountOpen ? 'Cancel account deletion' : 'Delete account'}
              </button>
              {deleteAccountOpen ? (
                <form className="account-delete-form" onSubmit={deleteAccount}>
                  <p>
                    Permanently delete this account, saved places, weather history, and alert rules.
                    For security, you must have signed in during the last five minutes.
                  </p>
                  <label htmlFor="account-delete-email">Confirm your account email</label>
                  <input
                    id="account-delete-email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    value={deleteConfirmationEmail}
                    onChange={(event) => setDeleteConfirmationEmail(event.target.value)}
                  />
                  <label htmlFor="account-delete-phrase">Type DELETE to confirm</label>
                  <input
                    id="account-delete-phrase"
                    type="text"
                    autoComplete="off"
                    maxLength={6}
                    required
                    value={deleteConfirmationPhrase}
                    onChange={(event) => setDeleteConfirmationPhrase(event.target.value)}
                  />
                  <button
                    className="account-delete-confirm"
                    type="submit"
                    disabled={
                      busy ||
                      deleteConfirmationEmail.trim().toLocaleLowerCase('en-US') !==
                        session.user.email?.trim().toLocaleLowerCase('en-US') ||
                      deleteConfirmationPhrase !== 'DELETE'
                    }
                  >
                    {busy ? 'Deleting…' : 'Delete account permanently'}
                  </button>
                </form>
              ) : null}
            </div>
            {presentation === 'popover' ? (
              <>
                <button
                  className="save-current-location"
                  type="button"
                  onClick={saveCurrentLocation}
                  disabled={
                    busy || preferencesSaving || currentLocationIsSaved || locations.length >= 100
                  }
                >
                  {currentLocationIsSaved
                    ? 'Already saved'
                    : locations.length >= 100
                      ? 'Saved-place limit reached'
                      : `Save ${currentLocation.name}`}
                </button>
                {locations.length >= 100 && !currentLocationIsSaved ? (
                  <p role="status">An account can save up to 100 places.</p>
                ) : null}
              </>
            ) : null}
            {locationsLoading ? <p role="status">Loading saved places…</p> : null}
            {preferencesOverLimit ? (
              <p role="status">
                Account-synced ordering, favorites, categories, and default place support up to 100
                saved places. Remove places to enable these preferences.
              </p>
            ) : null}
            {locations.length > 0 ? (
              <ul aria-label="Your saved places">
                {orderedLocations.map((location, index) => (
                  <li key={location.id}>
                    <div className="saved-location-row">
                      <button
                        type="button"
                        onClick={() => void selectSavedLocation(location)}
                        disabled={
                          busy ||
                          removingId !== undefined ||
                          renamingId !== undefined ||
                          locationsLoading
                        }
                      >
                        {location.name}
                      </button>
                      <div
                        className="saved-location-actions"
                        role="group"
                        aria-label={`Manage ${location.name}`}
                      >
                        <button
                          className="favorite-saved-location"
                          type="button"
                          onClick={() =>
                            void updateSavedPlaceMetadata(location, {
                              is_favorite: !location.is_favorite,
                            })
                          }
                          disabled={
                            busy ||
                            preferencesSaving ||
                            preferencesOverLimit ||
                            removingId !== undefined ||
                            renamingId !== undefined
                          }
                          aria-label={
                            location.is_favorite
                              ? `Remove ${location.name} from favorites`
                              : `Add ${location.name} to favorites`
                          }
                          aria-pressed={location.is_favorite}
                          title={location.is_favorite ? 'Favorite' : 'Add to favorites'}
                        >
                          <Heart
                            size={15}
                            fill={location.is_favorite ? 'currentColor' : 'none'}
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          className="saved-location-default"
                          type="button"
                          onClick={() => void setDefaultPlace(location)}
                          disabled={
                            busy ||
                            preferencesSaving ||
                            preferencesOverLimit ||
                            removingId !== undefined ||
                            renamingId !== undefined
                          }
                          aria-label={
                            placePreferences.defaultLocationId === location.id
                              ? `Clear default place ${location.name}`
                              : `Set ${location.name} as default place`
                          }
                          aria-pressed={placePreferences.defaultLocationId === location.id}
                          title={
                            placePreferences.defaultLocationId === location.id
                              ? 'Default place for this account'
                              : 'Set as default for this account'
                          }
                        >
                          <Star
                            size={15}
                            fill={
                              placePreferences.defaultLocationId === location.id
                                ? 'currentColor'
                                : 'none'
                            }
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          className="move-saved-location"
                          type="button"
                          onClick={() => void moveSavedPlace(location, -1)}
                          disabled={
                            busy ||
                            preferencesSaving ||
                            preferencesOverLimit ||
                            removingId !== undefined ||
                            renamingId !== undefined ||
                            index === 0
                          }
                          aria-label={`Move ${location.name} up`}
                        >
                          <ArrowUp size={14} aria-hidden="true" />
                        </button>
                        <button
                          className="move-saved-location"
                          type="button"
                          onClick={() => void moveSavedPlace(location, 1)}
                          disabled={
                            busy ||
                            preferencesSaving ||
                            preferencesOverLimit ||
                            removingId !== undefined ||
                            renamingId !== undefined ||
                            index === orderedLocations.length - 1
                          }
                          aria-label={`Move ${location.name} down`}
                        >
                          <ArrowDown size={14} aria-hidden="true" />
                        </button>
                        <button
                          className="edit-saved-location"
                          type="button"
                          onClick={() => {
                            setRenamingId(location.id);
                            setRenameDraft(location.name);
                            setConfirmRemoveId(undefined);
                            setMessage('');
                          }}
                          disabled={busy || removingId !== undefined || renamingId !== undefined}
                          aria-label={`Rename ${location.name}`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          className="remove-saved-location"
                          type="button"
                          onClick={() => {
                            setConfirmRemoveId(location.id);
                            setMessage('');
                          }}
                          disabled={busy || removingId !== undefined || renamingId !== undefined}
                          aria-label={`Remove ${location.name} from saved places`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <label
                      className="saved-location-category-label"
                      htmlFor={`saved-category-${location.id}`}
                    >
                      Category
                      <select
                        id={`saved-category-${location.id}`}
                        value={location.category ?? ''}
                        aria-label={`Category for ${location.name}`}
                        disabled={preferencesSaving || busy || preferencesOverLimit}
                        onChange={(event) =>
                          void updateSavedPlaceMetadata(location, {
                            category: (event.target.value || null) as SavedLocation['category'],
                          })
                        }
                      >
                        <option value="">Uncategorized</option>
                        <option value="home">Home</option>
                        <option value="work">Work</option>
                        <option value="university">University</option>
                        <option value="travel">Travel</option>
                      </select>
                    </label>
                    {renamingId === location.id ? (
                      <form
                        className="saved-location-rename-form"
                        onSubmit={(event) => void renameSavedLocation(event, location)}
                      >
                        <label className="sr-only" htmlFor={`rename-location-${location.id}`}>
                          New name for {location.name}
                        </label>
                        <input
                          id={`rename-location-${location.id}`}
                          type="text"
                          minLength={1}
                          maxLength={120}
                          required
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                        />
                        <button type="submit" disabled={busy}>
                          <Save size={14} aria-hidden="true" /> Save name
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(undefined);
                            setRenameDraft('');
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : null}
                    {confirmRemoveId === location.id ? (
                      <div
                        className="saved-location-confirm"
                        role="group"
                        aria-label={`Remove ${location.name}`}
                      >
                        <span>Remove {location.name}?</span>
                        <button
                          type="button"
                          onClick={() => void removeSavedLocation(location)}
                          disabled={removingId === location.id}
                        >
                          {removingId === location.id ? 'Removing…' : 'Remove'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(undefined)}
                          disabled={removingId === location.id}
                        >
                          Keep
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {!locationsLoading && locations.length === 0 && !locationsUnavailable ? (
              <p className="saved-locations-empty">
                {presentation === 'page'
                  ? 'No saved places yet. Search for a city on the dashboard and save it there.'
                  : 'Save this location to find it here later.'}
              </p>
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

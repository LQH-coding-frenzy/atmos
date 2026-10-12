'use client';

import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import { KeyRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

export default function UpdatePasswordPage() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);
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
      if (!active) return;
      setSession(nextSession);
      setAuthReady(true);
    });
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !session) return;
    if (password.length < 8 || password.length > 128) {
      setMessage('Choose a password between 8 and 128 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The password entries do not match.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmPassword('');
      setUpdated(true);
      setMessage('Your password has been updated.');
    } catch {
      setMessage('The password could not be updated. Request a new recovery link and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="atmos-page password-recovery-page">
      <section className="password-recovery-card panel" aria-labelledby="password-recovery-title">
        <div className="password-recovery-icon">
          <KeyRound size={22} aria-hidden="true" />
        </div>
        <p className="eyebrow">Account security</p>
        <h1 id="password-recovery-title">Set a new password</h1>
        {!authReady ? <p role="status">Checking your recovery link…</p> : null}
        {authReady && !client ? (
          <p role="status">Account access is unavailable. Public weather still works.</p>
        ) : null}
        {authReady && client && !session ? (
          <p role="status">
            This recovery link is missing or expired. Return to Saved places to request another one.
          </p>
        ) : null}
        {authReady && session && !updated ? (
          <form className="password-recovery-form" onSubmit={updatePassword}>
            <label htmlFor="recovery-new-password">New password</label>
            <input
              id="recovery-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label htmlFor="recovery-confirm-password">Confirm new password</label>
            <input
              id="recovery-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <button type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        ) : null}
        {message ? (
          <p className="password-recovery-status" role="status">
            {message}
          </p>
        ) : null}
        <Link href="/">Return to Atmos</Link>
      </section>
    </main>
  );
}

'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase-browser';

export function AuthControl() {
  const client = supabase;
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    return () => data.subscription.unsubscribe();
  }, [client]);

  if (!client) return <span className="auth-status">Sign-in unavailable</span>;

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setMessage('');
    const { error } = await client.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : 'Signed in.');
  }

  async function signInWithGoogle() {
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setMessage(error.message);
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setMessage(error.message);
  }

  if (session) {
    return (
      <button onClick={() => void signOut()} type="button">
        Sign out
      </button>
    );
  }

  return (
    <div className="auth-control">
      <button aria-expanded={open} onClick={() => setOpen((value) => !value)} type="button">
        Sign in
      </button>
      {open ? (
        <form className="auth-form" onSubmit={signIn}>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button type="submit">Continue with email</button>
          <button onClick={() => void signInWithGoogle()} type="button">
            Continue with Google
          </button>
          {message ? <p role="status">{message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

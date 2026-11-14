/**
 * GEOVENTRA — sign-in page.
 *
 * Exchanges email/password for a session. On success the session is persisted by the auth
 * store and the user is redirected to the dashboard.
 */

'use client';

import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { Button } from '@geoventra/ui';
import { useAuthStore } from '@/lib/auth-store';

export default function LoginPage(): ReactElement {
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const accessToken = useAuthStore((state) => state.accessToken);

  const [email, setEmail] = useState('admin@geoventra.in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If we already have a session, skip the form.
  useEffect(() => {
    if (accessToken) router.replace('/');
  }, [accessToken, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Sign in failed. Check your credentials.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-600)] text-[var(--text-inverse)] shadow-[var(--shadow-lg)]">
            <Gauge size={28} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-[var(--text-primary)]">
            GEOVENTRA
          </h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--text-muted)]">
            Intelligent Tracking Mantra
          </p>
        </div>

        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-lg)]"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Sign in
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Demo credentials are seeded locally — e.g. <code>admin@geoventra.in</code>.
          </p>

          <label className="mt-5 flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
            />
          </label>

          <label className="mt-4 flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 [html[data-theme='dark']_&]:border-red-800/60 [html[data-theme='dark']_&]:bg-red-950/50 [html[data-theme='dark']_&]:text-red-300">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={loading} loadingLabel="Signing in" className="mt-5 w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-[var(--text-muted)]">
          Geoventra Logistics · Fleet &amp; Tracking Platform
        </p>
      </div>
    </main>
  );
}

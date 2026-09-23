// Admin login page.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Login failed.');
      }

      const data = await response.json();

      // Store the token in a cookie the server-side proxy can read.
      // HTTP-only so JavaScript can't touch it. SameSite=Lax so it's
      // sent on top-level navigations.
      document.cookie =
        `campus_admin_session=${data.token}; ` +
        `path=/; max-age=${data.expires_in_s}; ` +
        `SameSite=Lax`;

      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 40,
          width: 400,
          maxWidth: '90vw',
        }}
      >
        <h1
          style={{
            margin: '0 0 8px 0',
            fontSize: 22,
          }}
        >
          Campus Navigation Admin
        </h1>
        <p
          className="muted"
          style={{ marginTop: 0, marginBottom: 24, fontSize: 14 }}
        >
          Sign in to manage the map.
        </p>

        {error ? (
          <div className="error-box" style={{ marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          className="btn"
          disabled={loading}
          style={{ width: '100%', marginTop: 8 }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
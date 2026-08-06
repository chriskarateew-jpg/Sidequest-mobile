import { useState } from 'react';

import { login } from '../api';

// Reuses the same POST /auth/login the mobile app uses — no separate auth
// system, per docs/task-database-roadmap.md Phase 5. Whether this account
// can actually reach /admin/* is decided server-side by requireDeveloper; a
// non-developer login just sees an empty, permanently-loading task list.
export function Login({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setLoading(true);
    setError(null);
    const result = await login(identifier.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onLoggedIn(result.data.token);
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1>Gumpa task dashboard</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Sign in with your Gumpa account.
      </p>
      <form onSubmit={handleSubmit} className="card">
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Email or username</label>
          <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

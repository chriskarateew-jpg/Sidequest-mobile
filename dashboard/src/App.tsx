import { useCallback, useEffect, useState } from 'react';

import { clearStoredToken, deleteChallenge, fetchChallenges, getStoredToken, setChallengeActive, storeToken } from './api';
import { Login } from './pages/Login';
import { TaskForm } from './pages/TaskForm';
import { TaskList } from './pages/TaskList';
import type { AdminChallenge } from './types';

type View = { name: 'list' } | { name: 'new' } | { name: 'edit'; challenge: AdminChallenge };

export function App() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [challenges, setChallenges] = useState<AdminChallenge[] | null>(null);
  const [notDeveloper, setNotDeveloper] = useState(false);
  const [view, setView] = useState<View>({ name: 'list' });

  const load = useCallback(async (t: string) => {
    const result = await fetchChallenges(t);
    if (!result.ok) {
      // A 404 here means this account isn't the developer gated in
      // requireDeveloper (server/src/auth.ts) — same "looks like a
      // nonexistent route" treatment the Expo dev panel uses, not a
      // distinguishing 401/403 message.
      if (result.status === 404) {
        setNotDeveloper(true);
      }
      return;
    }
    setChallenges(result.data.challenges);
  }, []);

  useEffect(() => {
    if (token) load(token);
  }, [token, load]);

  const handleLoggedIn = (t: string) => {
    storeToken(t);
    setToken(t);
  };

  const handleLogout = () => {
    clearStoredToken();
    setToken(null);
    setChallenges(null);
    setNotDeveloper(false);
  };

  const handleToggleActive = async (challenge: AdminChallenge, active: boolean) => {
    if (!token) return;
    const result = await setChallengeActive(token, challenge.id, active);
    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    setChallenges((prev) => prev?.map((c) => (c.id === challenge.id ? { ...c, active } : c)) ?? null);
  };

  const handleDelete = async (challenge: AdminChallenge) => {
    if (!token) return;
    if (!window.confirm(`Deactivate "${challenge.title}"? It stays resolvable for existing history, but drops out of suggestions.`)) return;
    const result = await deleteChallenge(token, challenge.id);
    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    setChallenges((prev) => prev?.map((c) => (c.id === challenge.id ? { ...c, active: false } : c)) ?? null);
  };

  const handleSaved = () => {
    setView({ name: 'list' });
    if (token) load(token);
  };

  if (!token) return <Login onLoggedIn={handleLoggedIn} />;

  if (notDeveloper) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center' }}>
        <h1>Not found</h1>
        <p>This account can&apos;t reach the admin API.</p>
        <button className="secondary" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Gumpa task dashboard</h1>
          <p className="muted" style={{ margin: 0 }}>
            {challenges ? `${challenges.length} total tasks` : 'Loading…'}
          </p>
        </div>
        <button className="secondary" onClick={handleLogout}>
          Sign out
        </button>
      </div>

      {challenges === null ? (
        <p className="muted">Loading tasks…</p>
      ) : view.name === 'list' ? (
        <TaskList
          challenges={challenges}
          onSelect={(c) => setView({ name: 'edit', challenge: c })}
          onNew={() => setView({ name: 'new' })}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
        />
      ) : (
        <TaskForm
          key={view.name === 'edit' ? view.challenge.id : 'new'}
          existing={view.name === 'edit' ? view.challenge : null}
          token={token}
          onSaved={handleSaved}
          onCancel={() => setView({ name: 'list' })}
        />
      )}
    </div>
  );
}

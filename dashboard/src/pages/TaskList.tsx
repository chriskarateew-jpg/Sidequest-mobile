import { useMemo, useState } from 'react';

import { CADENCES, type AdminChallenge, type Cadence } from '../types';

export function TaskList({
  challenges,
  onSelect,
  onNew,
  onToggleActive,
  onDelete,
}: {
  challenges: AdminChallenge[];
  onSelect: (challenge: AdminChallenge) => void;
  onNew: () => void;
  onToggleActive: (challenge: AdminChallenge, active: boolean) => void;
  onDelete: (challenge: AdminChallenge) => void;
}) {
  const [cadenceFilter, setCadenceFilter] = useState<Cadence | 'all'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filtered = useMemo(() => {
    return challenges.filter((c) => {
      if (cadenceFilter !== 'all' && c.cadence !== cadenceFilter) return false;
      if (activeFilter === 'active' && !c.active) return false;
      if (activeFilter === 'inactive' && c.active) return false;
      return true;
    });
  }, [challenges, cadenceFilter, activeFilter]);

  return (
    <div>
      <div className="topbar">
        <h2 style={{ margin: 0 }}>Tasks ({filtered.length} of {challenges.length})</h2>
        <button className="primary" onClick={onNew}>
          + New task
        </button>
      </div>

      <div className="filters">
        <select value={cadenceFilter} onChange={(e) => setCadenceFilter(e.target.value as Cadence | 'all')}>
          <option value="all">All cadences</option>
          {CADENCES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          <option value="all">Active + inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 && <p className="muted">No tasks match these filters.</p>}
        {filtered.map((c) => (
          <div className="task-row" key={c.id}>
            <div className="task-main" onClick={() => onSelect(c)}>
              <div className="task-title">{c.title}</div>
              <div className="task-meta">
                <span className={`badge ${c.active ? '' : 'inactive'}`}>{c.active ? 'active' : 'inactive'}</span>
                +{c.tokens} · {c.cadence}
                {c.verify === 'streak' ? ` · streak/${c.streakTarget}` : ''}
              </div>
            </div>
            <div className="task-actions">
              <button className="secondary" onClick={() => onToggleActive(c, !c.active)}>
                {c.active ? 'Deactivate' : 'Reactivate'}
              </button>
              {c.active && (
                <button className="danger" onClick={() => onDelete(c)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';

import { createChallenge, previewPrompt, setChallengeActive, updateChallenge } from '../api';
import {
  CADENCES,
  GUIDE_CHECKLIST_ITEMS,
  PROOF_TYPES,
  VERIFY_TYPES,
  type AdminChallenge,
  type AdminChallengeInput,
  type Cadence,
  type GuideChecklist,
  type ProofType,
  type VerifyType,
} from '../types';

const EMPTY_CHECKLIST: GuideChecklist = {
  routineBreaking: false,
  named: false,
  photoProvable: false,
  cadenceAppropriate: false,
  noRedFlagVerbs: false,
};

export function TaskForm({
  existing,
  token,
  onSaved,
  onCancel,
}: {
  existing: AdminChallenge | null;
  token: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [desc, setDesc] = useState(existing?.desc ?? '');
  const [tokens, setTokens] = useState(existing ? String(existing.tokens) : '');
  const [cadence, setCadence] = useState<Cadence>(existing?.cadence ?? 'daily');
  const [verify, setVerify] = useState<VerifyType>(existing?.verify ?? 'photo');
  const [proofType, setProofType] = useState<ProofType>(existing?.proofType ?? 'camera');
  const [streakTarget, setStreakTarget] = useState(existing?.streakTarget ? String(existing.streakTarget) : '');
  const [placeLat, setPlaceLat] = useState(existing?.placeLat != null ? String(existing.placeLat) : '');
  const [placeLng, setPlaceLng] = useState(existing?.placeLng != null ? String(existing.placeLng) : '');
  const [radiusMeters, setRadiusMeters] = useState(existing?.radiusMeters != null ? String(existing.radiusMeters) : '');
  const [proofAccept, setProofAccept] = useState(existing?.proofAccept ?? '');
  const [proofReject, setProofReject] = useState(existing?.proofReject ?? '');
  const [verifiabilityNotes, setVerifiabilityNotes] = useState(existing?.verifiabilityNotes ?? '');
  const [checklist, setChecklist] = useState<GuideChecklist>(existing?.guideChecklist ?? EMPTY_CHECKLIST);
  const [active, setActive] = useState(existing?.active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  const handleSave = async () => {
    setError(null);
    setWarnings([]);
    if (!title.trim() || !desc.trim()) {
      setError('Title and description are required.');
      return;
    }
    const tokensNum = Number(tokens);
    if (!Number.isInteger(tokensNum) || tokensNum <= 0) {
      setError('Tokens must be a positive whole number.');
      return;
    }
    const streakTargetNum = verify === 'streak' ? Number(streakTarget) : undefined;
    if (verify === 'streak' && (!Number.isInteger(streakTargetNum) || (streakTargetNum ?? 0) <= 0)) {
      setError('Streak target must be a positive whole number.');
      return;
    }

    const input: AdminChallengeInput = {
      title: title.trim(),
      desc: desc.trim(),
      tokens: tokensNum,
      cadence,
      verify,
      proofType,
      ...(streakTargetNum ? { streakTarget: streakTargetNum } : {}),
      ...(placeLat && placeLng && radiusMeters
        ? { placeLat: Number(placeLat), placeLng: Number(placeLng), radiusMeters: Number(radiusMeters) }
        : {}),
      ...(proofAccept.trim() ? { proofAccept: proofAccept.trim() } : {}),
      ...(proofReject.trim() ? { proofReject: proofReject.trim() } : {}),
      ...(verifiabilityNotes.trim() ? { verifiabilityNotes: verifiabilityNotes.trim() } : {}),
      guideChecklist: checklist,
    };

    setSaving(true);
    const result = existing ? await updateChallenge(token, existing.id, input) : await createChallenge(token, { ...input, active });
    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      return;
    }
    setWarnings(result.data.warnings ?? []);

    if (existing && existing.active !== active) {
      const activeResult = await setChallengeActive(token, existing.id, active);
      if (!activeResult.ok) {
        setSaving(false);
        setError(activeResult.message);
        return;
      }
    }
    setSaving(false);
    onSaved();
  };

  const handlePreviewPrompt = async () => {
    if (!existing) return;
    setLoadingPrompt(true);
    const result = await previewPrompt(token, existing.id);
    setLoadingPrompt(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPrompt(result.data.prompt);
  };

  return (
    <div>
      <div className="topbar">
        <h2 style={{ margin: 0 }}>{existing ? 'Edit task' : 'New task'}</h2>
        <button className="secondary" onClick={onCancel}>
          Back to list
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {warnings.length > 0 && <div className="warning-banner">{warnings.join('\n')}</div>}

      <div className="card">
        <div className="field">
          <label>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Do 20 push-ups" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Photograph yourself mid-set." />
        </div>
        <div className="row">
          <div className="field">
            <label>Token payout</label>
            <input type="number" value={tokens} onChange={(e) => setTokens(e.target.value)} placeholder="15" />
          </div>
          <div className="field">
            <label>Cadence</label>
            <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Verify method</label>
            <select value={verify} onChange={(e) => setVerify(e.target.value as VerifyType)}>
              {VERIFY_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {verify === 'streak' && (
            <div className="field">
              <label>Streak target (check-ins)</label>
              <input type="number" value={streakTarget} onChange={(e) => setStreakTarget(e.target.value)} placeholder="5" />
            </div>
          )}
          <div className="field">
            <label>Proof type</label>
            <select value={proofType} onChange={(e) => setProofType(e.target.value as ProofType)}>
              {PROOF_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {existing && (
          <div className="checkbox-row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} id="active" />
            <label htmlFor="active">Active (shows in rotation)</label>
          </div>
        )}
      </div>

      <h2>Location (optional)</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Require the proof photo be taken at a specific spot. No map here yet, enter coordinates directly (the Expo dev panel has a
        picker map if you need one).
      </p>
      <div className="card">
        <div className="row">
          <div className="field">
            <label>Latitude</label>
            <input type="number" value={placeLat} onChange={(e) => setPlaceLat(e.target.value)} placeholder="40.7128" />
          </div>
          <div className="field">
            <label>Longitude</label>
            <input type="number" value={placeLng} onChange={(e) => setPlaceLng(e.target.value)} placeholder="-74.0060" />
          </div>
          <div className="field">
            <label>Radius (meters)</label>
            <input type="number" value={radiusMeters} onChange={(e) => setRadiusMeters(e.target.value)} placeholder="150" />
          </div>
        </div>
      </div>

      <h2>Verification hints (optional)</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Short phrases merged into the /verify prompt Claude sees for this specific task — see the preview below.
      </p>
      <div className="card">
        <div className="field">
          <label>Proof accept</label>
          <input
            type="text"
            value={proofAccept}
            onChange={(e) => setProofAccept(e.target.value)}
            placeholder="a visible street sign or landmark in frame"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>Proof reject</label>
          <input
            type="text"
            value={proofReject}
            onChange={(e) => setProofReject(e.target.value)}
            placeholder="reject if no gym equipment visible"
            maxLength={200}
          />
        </div>
      </div>

      <h2>Guide checklist</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        All five must be checked before this task can be set active — see docs/challenge-writing-guide.md. You can still save a
        draft with boxes unchecked by leaving "Active" off.
      </p>
      <div className="card">
        {GUIDE_CHECKLIST_ITEMS.map((item) => (
          <div className="checkbox-row" key={item.key}>
            <input
              type="checkbox"
              id={item.key}
              checked={checklist[item.key]}
              onChange={(e) => setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))}
            />
            <label htmlFor={item.key}>{item.label}</label>
          </div>
        ))}
        <div className="field" style={{ marginTop: 10 }}>
          <label>Verifiability notes (reviewer/audit trail only, never shown to Claude or users)</label>
          <textarea value={verifiabilityNotes} onChange={(e) => setVerifiabilityNotes(e.target.value)} maxLength={500} />
        </div>
      </div>

      {existing && (
        <>
          <h2>Verify prompt preview</h2>
          <div className="card">
            <button className="secondary" onClick={handlePreviewPrompt} disabled={loadingPrompt}>
              {loadingPrompt ? 'Loading…' : 'Load exact /verify prompt'}
            </button>
            {prompt && <div className="prompt-preview" style={{ marginTop: 12 }}>{prompt}</div>}
          </div>
        </>
      )}

      <button className="primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? 'Saving…' : existing ? 'Save changes' : 'Create task'}
      </button>
    </div>
  );
}

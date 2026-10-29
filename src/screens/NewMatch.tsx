import { useState } from 'react';
import { backend } from '../lib/backend';
import { catById, LEVEL_NAMES, randomOffer } from '../lib/categories';
import { newCode } from '../lib/codes';
import { getProfile, rememberGame } from '../lib/profile';
import { go } from '../lib/router';
import type { DifficultySetting, Level } from '../lib/types';
import { Logo } from './Home';

export const DIFFICULTY_OPTIONS: { label: string; value: DifficultySetting }[] = [
  ...([1, 2, 3, 4] as Level[]).map((l) => ({ label: LEVEL_NAMES[l], value: { kind: 'fixed', level: l } as DifficultySetting })),
  { label: 'Rising ↗ Easy→Hard', value: { kind: 'rising', start: 1 } },
  { label: 'Rising ↗ Medium→Very hard', value: { kind: 'rising', start: 2 } },
];

export function CategoryChip({ id, vetoed, onClick, note }: { id: string; vetoed?: boolean; onClick?: () => void; note?: string }) {
  const c = catById(id);
  return (
    <button type="button" className={`cat-chip k-${c.kind} ${vetoed ? 'vetoed' : ''}`} onClick={onClick} disabled={!onClick}>
      <span className="cat-emoji">{c.emoji}</span>
      <span className="cat-name">{c.name}</span>
      {vetoed && <span className="veto-mark">✕</span>}
      {note && <span className="cat-note">{note}</span>}
    </button>
  );
}

export default function NewMatch() {
  const [diff, setDiff] = useState(0);
  const [offer, setOffer] = useState(randomOffer);
  const [rerolls, setRerolls] = useState(2);
  const [veto, setVeto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    if (!veto) return;
    setBusy(true);
    setErr('');
    const p = getProfile();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode();
      try {
        await backend.createGame({
          id: code,
          host_id: p.id,
          host_name: p.name || 'Player',
          guest_id: null,
          guest_name: null,
          settings: { difficulty: DIFFICULTY_OPTIONS[diff].value },
          offered: offer,
          host_veto: veto,
          guest_veto: null,
          rounds: null,
          host_results: {},
          guest_results: {},
        });
        rememberGame(code);
        go(`/m/${code}`);
        return;
      } catch (e) {
        setErr(String((e as Error).message));
      }
    }
    setBusy(false);
  };

  return (
    <div className="screen">
      <Logo />
      <button className="back" onClick={() => go('/')}>
        ← Back
      </button>
      <h2>New duel</h2>

      <div className="card">
        <h3>1 · Difficulty</h3>
        <div className="seg">
          {DIFFICULTY_OPTIONS.map((o, i) => (
            <button key={o.label} className={i === diff ? 'on' : ''} onClick={() => setDiff(i)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row-between">
          <h3>2 · Veto one category</h3>
          <button
            className="btn small ghost"
            disabled={rerolls === 0}
            onClick={() => {
              setOffer(randomOffer());
              setVeto(null);
              setRerolls(rerolls - 1);
            }}
          >
            🎲 Reroll ({rerolls})
          </button>
        </div>
        <p className="muted">
          Tap the category you <em>don't</em> want. Your opponent vetoes one too, and the remaining 3 are played.
        </p>
        <div className="cat-list">
          {offer.map((id) => (
            <CategoryChip key={id} id={id} vetoed={veto === id} onClick={() => setVeto(veto === id ? null : id)} />
          ))}
        </div>
      </div>

      {err && <p className="error">{err}</p>}
      <button className="btn primary wide big" disabled={!veto || busy} onClick={create}>
        {busy ? 'Creating…' : veto ? 'Create duel & get code' : 'Veto a category first'}
      </button>
    </div>
  );
}

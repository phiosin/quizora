import { useState } from 'react';
import { backend } from '../lib/backend';
import { catById, FORMATS, LEVEL_NAMES, randomPresets, roundsFor } from '../lib/categories';
import { newCode } from '../lib/codes';
import { getProfile, rememberGame } from '../lib/profile';
import { go } from '../lib/router';
import type { DifficultySetting, Level } from '../lib/types';
import { cannotOpen } from '../lib/limits';
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
  const [format, setFormat] = useState(FORMATS[0]);
  const [offer, setOffer] = useState(() => randomPresets(FORMATS[0].presets));
  const [rerolls, setRerolls] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true);
    setErr('');
    const p = getProfile();
    const why = await cannotOpen(p.id);
    if (why) {
      setErr(why);
      setBusy(false);
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode();
      try {
        await backend.createGame({
          id: code,
          host_id: p.id,
          host_name: p.name || 'Player',
          guest_id: null,
          guest_name: null,
          settings: { difficulty: DIFFICULTY_OPTIONS[diff].value, seenAt: Date.now(), presets: format.presets, picks: format.picks },
          offered: offer,
          host_veto: null,
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
        <h3>1 · Length</h3>
        <div className="seg">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              className={f.id === format.id ? 'on' : ''}
              onClick={() => {
                setFormat(f);
                setOffer(randomPresets(f.presets));
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="muted small">
          {format.presets === 0
            ? 'Fair: nothing random. You each pick 2 categories, taking turns.'
            : `${format.presets} random ${format.presets === 1 ? 'category' : 'categories'}, then you each pick 1.`}
        </p>
      </div>

      <div className="card">
        <h3>2 · Difficulty</h3>
        <div className="seg">
          {DIFFICULTY_OPTIONS.map((o, i) => (
            <button key={o.label} className={i === diff ? 'on' : ''} onClick={() => setDiff(i)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {format.presets > 0 && (
      <div className="card">
        <div className="row-between">
          <h3>3 · Starting {format.presets === 1 ? 'category' : 'categories'}</h3>
          <button
            className="btn small ghost"
            disabled={rerolls === 0}
            onClick={() => {
              setOffer(randomPresets(format.presets));
              setRerolls(rerolls - 1);
            }}
          >
            🎲 Reroll ({rerolls})
          </button>
        </div>
        <p className="muted">
          Picked at random. Once your opponent joins, you each add one category of your choice, so the match has{' '}
          {roundsFor(format.presets, format.picks)} rounds.
        </p>
        <div className="cat-list">
          {offer.map((id) => (
            <CategoryChip key={id} id={id} />
          ))}
        </div>
      </div>
      )}

      {err && <p className="error">{err}</p>}
      <button className="btn primary wide big" disabled={busy} onClick={create}>
        {busy ? 'Creating…' : 'Open game'}
      </button>
    </div>
  );
}

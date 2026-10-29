import { useState } from 'react';
import { CATEGORIES, LEVEL_NAMES, type CategoryKind } from '../lib/categories';
import { generateRound } from '../lib/generate';
import { go } from '../lib/router';
import type { Level, RoundSpec } from '../lib/types';
import RoundPlayer from '../rounds/RoundPlayer';
import { Logo } from './Home';
import { CategoryChip } from './NewMatch';

const GROUPS: { kind: CategoryKind; title: string }[] = [
  { kind: 'map', title: '🗺️ Maps' },
  { kind: 'capitals', title: '🏛️ Capitals' },
  { kind: 'trivia', title: '💡 Trivia' },
];

export default function Practice() {
  const [level, setLevel] = useState<Level>(1);
  const [mode, setMode] = useState<'random' | 'map-type' | 'map-locate'>('random');
  const [spec, setSpec] = useState<RoundSpec | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [run, setRun] = useState(0);

  const start = async (catId: string) => {
    setBusy(catId);
    setErr('');
    try {
      setSpec(await generateRound(catId, level, mode === 'random' ? undefined : mode));
      setRun((r) => r + 1);
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setBusy('');
  };

  if (spec)
    return (
      <RoundPlayer
        key={run}
        spec={spec}
        title="Practice"
        onEnd={() => {}}
        onContinue={() => setSpec(null)}
        onBack={() => setSpec(null)}
      />
    );

  return (
    <div className="screen">
      <Logo />
      <button className="back" onClick={() => go('/')}>
        ← Back
      </button>
      <h2>Practice</h2>
      <div className="card">
        <h3>Difficulty</h3>
        <div className="seg">
          {([1, 2, 3, 4] as Level[]).map((l) => (
            <button key={l} className={l === level ? 'on' : ''} onClick={() => setLevel(l)}>
              {LEVEL_NAMES[l]}
            </button>
          ))}
        </div>
        <h3>Map mode</h3>
        <div className="seg">
          {(
            [
              ['random', 'Mixed'],
              ['map-type', 'Name the red ones'],
              ['map-locate', 'Find on map'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={v === mode ? 'on' : ''} onClick={() => setMode(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {GROUPS.map((gr) => (
        <div key={gr.kind}>
          <h3 className="section-title">{gr.title}</h3>
          <div className="cat-grid">
            {CATEGORIES.filter((c) => c.kind === gr.kind).map((c) => (
              <CategoryChip key={c.id} id={c.id} onClick={() => start(c.id)} note={busy === c.id ? 'loading…' : undefined} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

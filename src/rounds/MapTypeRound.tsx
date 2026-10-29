import { useMemo, useRef, useState } from 'react';
import { sfx } from '../lib/sound';
import MapView, { type ItemState } from '../components/MapView';
import { exactMatch, fuzzyMatch } from '../lib/text';
import type { MapData, MapSpec, RoundResult } from '../lib/types';
import { fmtTime, useCountdown } from '../lib/useCountdown';

interface Props {
  spec: MapSpec;
  map: MapData;
  onEnd: (r: RoundResult) => void;
  onContinue: () => void;
}

export function mapTypeScore(correct: number, errors: number, left: number, all: boolean) {
  return Math.max(0, correct * 100 - errors * 20 + (all ? Math.round(left * 3) : 0));
}

/** Highlighted items in red; type their names. */
export default function MapTypeRound({ spec, map, onEnd, onContinue }: Props) {
  const targets = useMemo(() => map.items.filter((i) => spec.items.includes(i.id)), [map, spec]);
  const [found, setFound] = useState<string[]>([]);
  const [errors, setErrors] = useState(0);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'bad' | 'info' } | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = (foundNow: string[], errs: number, leftNow: number, gaveUp = false) => {
    if (result) return;
    const all = foundNow.length === targets.length;
    const r: RoundResult = {
      status: 'done',
      score: mapTypeScore(foundNow.length, errs, leftNow, all),
      correct: foundNow.length,
      total: targets.length,
      errors: errs,
      timeUsed: Math.round(spec.timeLimit - leftNow),
      gaveUp,
    };
    setResult(r);
    sfx.finish();
    inputRef.current?.blur();
    onEnd(r);
  };

  const left = useCountdown(spec.timeLimit, !result, () => finish(found, errors, 0));

  const accept = (id: string) => {
    const next = [...found, id];
    sfx.correct();
    setFound(next);
    setInput('');
    setMsg({ text: `✓ ${targets.find((t) => t.id === id)!.name}`, kind: 'ok' });
    if (next.length === targets.length) finish(next, errors, left);
  };

  const remaining = targets.filter((t) => !found.includes(t.id));

  const onChange = (v: string) => {
    setInput(v);
    const hit = exactMatch(v, remaining);
    if (hit) accept(hit.id);
  };

  const submit = () => {
    if (!input.trim()) return;
    const hit = fuzzyMatch(input, remaining);
    if (hit) return accept(hit.id);
    if (fuzzyMatch(input, targets)) {
      setMsg({ text: 'Already found that one', kind: 'info' });
      setInput('');
      return;
    }
    sfx.wrong();
    setErrors((e) => e + 1);
    setMsg({ text: `✗ “${input.trim()}” isn't one of the red ones`, kind: 'bad' });
    setInput('');
  };

  const states: Record<string, ItemState> = {};
  for (const t of targets) states[t.id] = found.includes(t.id) ? 'found' : result ? 'missed' : 'target';
  const labels: Record<string, boolean> = {};
  for (const t of targets) if (found.includes(t.id) || result) labels[t.id] = true;

  return (
    <div className="round">
      <div className="round-bar">
        <span className={`timer ${left < 10 && !result ? 'low' : ''}`}>⏱ {fmtTime(left)}</span>
        <span className="pill">
          {found.length}/{targets.length} found
        </span>
        <span className="pill bad">{errors} ✗</span>
        {!result && (
          <button className="btn small ghost" onClick={() => finish(found, errors, left, true)}>
            Give up
          </button>
        )}
      </div>
      <MapView map={map} states={states} labels={labels} focus={spec.items} />
      {result ? (
        <div className="round-foot">
          <div className="result-line">
            <strong>{result.score} pts</strong> · {result.correct}/{result.total} · {result.errors} errors
          </div>
          <button className="btn primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      ) : (
        <div className="round-foot">
          <div className={`feedback ${msg?.kind ?? ''}`}>{msg?.text ?? 'Type the names of the red ones (English, German or Spanish)'}</div>
          <form
            className="type-row"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => onChange(e.target.value)}
              placeholder={map.kind === 'line' ? 'River name…' : 'Name…'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
            />
            <button className="btn primary" type="submit">
              ↵
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

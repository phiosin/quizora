import { useMemo, useRef, useState } from 'react';
import { sfx } from '../lib/sound';
import MapView, { type ItemState } from '../components/MapView';
import type { MapData, MapSpec, RoundResult } from '../lib/types';
import { fmtTime, useCountdown } from '../lib/useCountdown';

interface Props {
  spec: MapSpec;
  map: MapData;
  onEnd: (r: RoundResult) => void;
  onContinue: () => void;
}

const POINTS = [100, 60, 30]; // by attempt
const MAX_TRIES = 3;

/** A name is shown; tap it on the map. */
export default function MapLocateRound({ spec, map, onEnd, onContinue }: Props) {
  const targets = useMemo(() => spec.items.map((id) => map.items.find((i) => i.id === id)!).filter(Boolean), [map, spec]);
  const [idx, setIdx] = useState(0);
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState<Record<string, ItemState>>({});
  const [flash, setFlash] = useState<Record<string, ItemState>>({});
  const [score, setScore] = useState(0);
  const [errors, setErrors] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const busy = useRef(false);

  const finish = (s: number, correct: number, errs: number, leftNow: number, gaveUp = false) => {
    if (result) return;
    const all = correct === targets.length;
    const r: RoundResult = {
      status: 'done',
      score: s + (all ? Math.round(leftNow * 3) : 0),
      correct,
      total: targets.length,
      errors: errs,
      timeUsed: Math.round(spec.timeLimit - leftNow),
      gaveUp,
    };
    setResult(r);
    sfx.finish();
    onEnd(r);
  };

  const correctCount = (d: Record<string, ItemState>) =>
    Object.values(d).filter((s) => s === 'found' || s === 'partial').length;

  const left = useCountdown(spec.timeLimit, !result, () => finish(score, correctCount(done), errors, 0));
  const target = targets[idx];

  const next = (newDone: Record<string, ItemState>, newScore: number, errs: number) => {
    setDone(newDone);
    setScore(newScore);
    setTries(0);
    if (idx + 1 >= targets.length) finish(newScore, correctCount(newDone), errs, left);
    else setIdx(idx + 1);
  };

  const onTap = (id: string) => {
    if (result || busy.current || !target || done[id]) return;
    if (id === target.id) {
      sfx.correct();
      next({ ...done, [id]: tries === 0 ? 'found' : 'partial' }, score + POINTS[tries], errors);
      return;
    }
    sfx.wrong();
    const errs = errors + 1;
    setErrors(errs);
    const t = tries + 1;
    setTries(t);
    if (t >= MAX_TRIES) {
      // Show where it was, then move on
      busy.current = true;
      setFlash({ [target.id]: 'hint', [id]: 'wrong' });
      setTimeout(() => {
        busy.current = false;
        setFlash({});
        next({ ...done, [target.id]: 'missed' }, score, errs);
      }, 1300);
    } else {
      setFlash({ [id]: 'wrong' });
      setTimeout(() => setFlash({}), 500);
    }
  };

  const states: Record<string, ItemState> = { ...done, ...flash };
  if (result) for (const t of targets) if (!done[t.id]) states[t.id] = 'missed';
  const labels: Record<string, boolean> = {};
  for (const t of targets) if (done[t.id] || result) labels[t.id] = true;

  return (
    <div className="round">
      <div className="round-bar">
        <span className={`timer ${left < 10 && !result ? 'low' : ''}`}>⏱ {fmtTime(left)}</span>
        <span className="pill">
          {Math.min(idx + 1, targets.length)}/{targets.length}
        </span>
        <span className="pill">{score} pts</span>
        {!result && (
          <button className="btn small ghost" onClick={() => finish(score, correctCount(done), errors, left, true)}>
            Give up
          </button>
        )}
      </div>
      {!result && target && (
        <div className="prompt">
          Find <strong>{target.name}</strong>
          {tries > 0 && <span className="tries"> · {MAX_TRIES - tries} tries left</span>}
        </div>
      )}
      <MapView map={map} states={states} labels={labels} onTap={result ? undefined : onTap} />
      {result && (
        <div className="round-foot">
          <div className="result-line">
            <strong>{result.score} pts</strong> · {result.correct}/{result.total} found · {result.errors} wrong taps
          </div>
          <button className="btn primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

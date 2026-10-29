import { useEffect, useState } from 'react';
import { sfx } from '../lib/sound';

export interface Racer {
  name: string;
  before: number;
  after: number;
  color: string;
}

interface Props {
  title: string;
  me: Racer;
  them: Racer;
  /** Shown when the opponent hasn't played this round yet. */
  note?: string;
  onClose: () => void;
}

const RACE_MS = 2600;

/** Two boats race up a river; how far each gets is its points total. */
export default function BoatRace({ title, me, them, note, onClose }: Props) {
  const [go, setGo] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => {
      setGo(true);
      sfx.start();
    }, 400);
    const b = setTimeout(() => {
      setDone(true);
      if (me.after > them.after) sfx.correct();
      else if (me.after < them.after) sfx.wrong();
      else sfx.join();
    }, 400 + RACE_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same scale for before and after, so boats only ever move forward. The leader ends near the finish.
  const max = Math.max(me.after, them.after, 1);
  const pos = (score: number) => 15 + (score / max) * 62; // % from the bottom
  const diff = Math.abs(me.after - them.after);
  const verdict =
    me.after === them.after
      ? 'Neck and neck!'
      : me.after > them.after
        ? `You're ahead by ${diff}!`
        : `${them.name} leads by ${diff}`;

  return (
    <div className="race" onClick={done ? onClose : undefined}>
      <div className="race-head">
        <div className="muted small">{title}</div>
        <h2 className={done ? 'race-verdict show' : 'race-verdict'}>{done ? verdict : 'Race!'}</h2>
      </div>
      <div className="river">
        <div className="waves" />
        <div className="finish">
          <span>🏁</span>
        </div>
        {[me, them].map((r, i) => {
          const lead = done && r.after > (i === 0 ? them.after : me.after);
          return (
            <div
              key={i}
              className={`boat-lane lane-${i}`}
              style={{
                bottom: `${pos(go ? r.after : r.before)}%`,
                transitionDuration: `${RACE_MS}ms`,
              }}
            >
              <div className={`boat ${go && !done ? 'moving' : ''}`}>
                <Boat color={r.color} />
                {lead && <span className="crown">👑</span>}
              </div>
              <div className="boat-tag" style={{ borderColor: r.color }}>
                <strong>{r.name}</strong>
                <span>{go ? <Counter from={r.before} to={r.after} ms={RACE_MS} /> : r.before}</span>
              </div>
            </div>
          );
        })}
      </div>
      {note && <p className="muted small center race-note">{note}</p>}
      <button className="btn primary wide big" onClick={onClose} disabled={!done}>
        Continue
      </button>
    </div>
  );
}

/** Top-down boat pointing up, with a foamy wake behind it. */
function Boat({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 90" className="boat-svg" aria-hidden>
      <g className="wake">
        <path d="M14 58 L4 88" />
        <path d="M26 58 L36 88" />
        <path d="M17 64 L12 86" />
        <path d="M23 64 L28 86" />
      </g>
      <path d="M20 2 C31 14 33 30 32 46 L30 62 L10 62 L8 46 C7 30 9 14 20 2 Z" fill={color} />
      <path d="M20 8 C27 17 28 30 27 44 L13 44 C12 30 13 17 20 8 Z" fill="rgba(255,255,255,0.18)" />
      <rect x="13" y="30" width="14" height="16" rx="3" fill="#fff" opacity="0.9" />
      <rect x="15" y="33" width="10" height="5" rx="1.5" fill="#14112a" opacity="0.7" />
    </svg>
  );
}

function Counter({ from, to, ms }: { from: number; to: number; ms: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms]);
  return <>{v}</>;
}

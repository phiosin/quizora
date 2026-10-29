import { useRef } from 'react';
import type { RoundSpec } from '../lib/types';
import { backend } from '../lib/backend';
import { getProfile } from '../lib/profile';
import { go } from '../lib/router';
import type { Results, RoundResult } from '../lib/types';
import RoundPlayer from '../rounds/RoundPlayer';
import { useGame } from './Match';
import { matchStatus } from './matchStatus';

export default function Play({ code, round }: { code: string; round: number }) {
  const { g } = useGame(code);
  const me = getProfile();
  const local = useRef<Results | null>(null);
  // Keep the round we started with, so later updates can never pull it away mid-round
  const fixed = useRef<{ spec: RoundSpec; count: number; role: 'host' | 'guest' } | null>(null);
  const back = () => go(`/m/${code}`);

  if (!fixed.current) {
    if (!g) return <div className="screen"><p className="muted center">Loading…</p></div>;
    const st = matchStatus(g, me.id);
    const spec = g.rounds?.[round];
    if (st.role === 'none' || !spec) {
      back();
      return null;
    }
    const existing = st.mine[round];
    if (existing) {
      // Already played (or left mid-round): no replays
      back();
      return null;
    }
    local.current = { ...st.mine };
    fixed.current = { spec, count: g.rounds!.length, role: st.role };
  }
  const { spec, count, role } = fixed.current;

  const save = (r: RoundResult) => {
    local.current = { ...local.current!, [round]: r };
    backend.saveResults(code, role, local.current).catch((e) => alert(`Could not save your score: ${e.message}`));
  };

  return (
    <RoundPlayer
      spec={spec}
      title={`Round ${round + 1} of ${count}`}
      onStart={() => save({ status: 'started', score: 0, correct: 0, total: 0, errors: 0, timeUsed: 0 })}
      onEnd={save}
      onContinue={() => {
        // Ask the scoreboard to show the boat race for this round
        try {
          sessionStorage.setItem('quizora:race', `${code}:${round}`);
        } catch {
          /* ignore */
        }
        back();
      }}
      onBack={back}
    />
  );
}

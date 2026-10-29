import { ROUNDS_PER_MATCH, roundsFor } from '../lib/categories';
import type { GameRow, Results } from '../lib/types';

export const doneCount = (r: Results) => Object.values(r).filter((x) => x.status === 'done' || x.status === 'started').length;
export const total = (r: Results) => Object.values(r).reduce((s, x) => s + (x.score || 0), 0);

export function matchStatus(g: GameRow, me: string) {
  const role: 'host' | 'guest' | 'none' = g.host_id === me ? 'host' : g.guest_id === me ? 'guest' : 'none';
  const opponent = role === 'host' ? g.guest_name : g.host_name;
  const mine = role === 'guest' ? g.guest_results : g.host_results;
  const theirs = role === 'guest' ? g.host_results : g.guest_results;
  const count =
    g.rounds?.length ??
    (g.settings.presets !== undefined ? roundsFor(g.settings.presets, g.settings.picks ?? 1) : ROUNDS_PER_MATCH);
  const myDone = doneCount(mine) >= count;
  const theirDone = doneCount(theirs) >= count;
  let label = '';
  let tone = '';
  if (!g.guest_id) {
    label = role === 'host' ? 'Waiting for opponent' : 'Open';
    tone = 'wait';
  } else if (!g.rounds) {
    label = 'Picking…';
    tone = 'turn';
  } else if (myDone && theirDone) {
    const a = total(mine),
      b = total(theirs);
    label = a > b ? 'You won!' : a < b ? 'You lost' : 'Draw';
    tone = a > b ? 'win' : a < b ? 'lose' : 'wait';
  } else if (!myDone) {
    label = 'Your turn';
    tone = 'turn';
  } else {
    label = 'Their turn';
    tone = 'wait';
  }
  return { role, opponent, mine, theirs, myDone, theirDone, label, tone, finished: myDone && theirDone };
}

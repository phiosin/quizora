import { matchStatus, total } from '../screens/matchStatus';
import type { GameRow } from './types';

export interface Stats {
  id: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  best: number;
}

/** Win/loss record per player, from finished duels only. */
export function computeStats(games: GameRow[]): Map<string, Stats> {
  const map = new Map<string, Stats>();
  const get = (id: string, name: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { id, name, played: 0, wins: 0, losses: 0, draws: 0, points: 0, best: 0 }));
    return s;
  };
  for (const g of games) {
    if (!g.guest_id) continue;
    const st = matchStatus(g, g.host_id);
    if (!st.finished) continue;
    const h = total(g.host_results);
    const a = total(g.guest_results);
    const host = get(g.host_id, g.host_name);
    const guest = get(g.guest_id, g.guest_name ?? 'Player');
    for (const [p, mine, theirs] of [
      [host, h, a],
      [guest, a, h],
    ] as const) {
      p.played++;
      p.points += mine;
      p.best = Math.max(p.best, mine);
      if (mine > theirs) p.wins++;
      else if (mine < theirs) p.losses++;
      else p.draws++;
    }
  }
  return map;
}

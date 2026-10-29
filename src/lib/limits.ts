import { matchStatus } from '../screens/matchStatus';
import { backend, isOpen } from './backend';
import type { GameRow } from './types';

/** Most open lobbies (waiting for an opponent) a player can have. */
export const MAX_OPEN = 1;
/** Most duels with an opponent a player can have going at once. */
export const MAX_ACTIVE = 5;

/** Your lobby that's still waiting for someone to join. */
export const isOpenFor = (g: GameRow, me: string) => g.host_id === me && isOpen(g);

/**
 * A duel with an opponent counts while it's being set up or you still have rounds to play.
 * Once you've played all your rounds it no longer counts, even if your opponent hasn't.
 */
export function isActiveFor(g: GameRow, me: string): boolean {
  if (!g.guest_id || (g.host_id !== me && g.guest_id !== me)) return false;
  if (!g.rounds) return true;
  return !matchStatus(g, me).myDone;
}

export async function myCounts(me: string): Promise<{ open: number; active: number; openId?: string }> {
  const games = await backend.gamesOf(me).catch(() => [] as GameRow[]);
  const open = games.filter((g) => isOpenFor(g, me));
  return { open: open.length, active: games.filter((g) => isActiveFor(g, me)).length, openId: open[0]?.id };
}

/** Why you can't open a new game right now, or null if you can. */
export async function cannotOpen(me: string): Promise<string | null> {
  const c = await myCounts(me);
  if (c.open >= MAX_OPEN) return 'You already have an open game waiting for an opponent.';
  if (c.active >= MAX_ACTIVE) return `You already have ${MAX_ACTIVE} duels going. Finish or forfeit one first.`;
  return null;
}

/** Why you can't join a game right now, or null if you can. */
export async function cannotJoin(me: string): Promise<string | null> {
  const c = await myCounts(me);
  if (c.active >= MAX_ACTIVE) return `You already have ${MAX_ACTIVE} duels going. Finish or forfeit one first.`;
  return null;
}

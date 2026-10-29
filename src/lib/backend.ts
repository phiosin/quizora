import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameRow, Player, Results, RoundSpec } from './types';

export interface Backend {
  mode: 'online' | 'local';
  createGame(g: GameRow): Promise<void>;
  getGame(id: string): Promise<GameRow | null>;
  /** Claims the guest slot. Returns false if someone else joined first. */
  joinGame(id: string, patch: Pick<GameRow, 'guest_id' | 'guest_name'>): Promise<boolean>;
  /** Saves a player's category pick (stored in host_veto / guest_veto) unless already set. */
  setPick(id: string, role: 'host' | 'guest', category: string): Promise<boolean>;
  /** Stores the generated rounds unless someone already did. */
  setRounds(id: string, rounds: RoundSpec[]): Promise<boolean>;
  saveResults(id: string, role: 'host' | 'guest', results: Results): Promise<void>;
  subscribe(id: string, cb: (g: GameRow) => void): () => void;
  /** Games still waiting for a second player (recent ones only). */
  listOpenGames(): Promise<GameRow[]>;
  /** Calls cb whenever the list of open games may have changed. */
  watchOpenGames(cb: () => void): () => void;
  /** Host heartbeat while in the lobby, so the game shows as open. */
  touchGame(id: string, settings: GameRow['settings']): Promise<void>;
  /** Saves a pick list unless someone changed it since `prev` (race-safe). */
  setPicks(id: string, role: 'host' | 'guest', value: string, prev: string | null): Promise<boolean>;

  // ---- players (null = profiles not available, e.g. table not created yet) ----
  findPlayer(by: { id?: string; nameKey?: string }): Promise<Player | null | undefined>;
  savePlayer(p: Player): Promise<boolean>;
  /** Moves games from an anonymous device id to a profile. */
  moveGames(fromId: string, toId: string): Promise<void>;
  /** Games this player took part in (newest first). */
  gamesOf(playerId: string): Promise<GameRow[]>;
  /** Light rows of all recent games, for stats. */
  allGames(): Promise<GameRow[]>;
  listPlayers(): Promise<Player[]>;
}

export const nameKey = (name: string) => name.trim().toLowerCase().replace(/s+/g, ' ');
// Light rows skip the (big) rounds; r0 only tells whether rounds exist.
const LIGHT =
  'id,created_at,host_id,host_name,guest_id,guest_name,settings,offered,host_veto,guest_veto,host_results,guest_results,r0:rounds->0->>type';
/** Light rows get placeholder rounds of the right length, enough for status and stats. */
function lightRows(data: unknown[] | null): GameRow[] {
  return ((data ?? []) as (GameRow & { r0?: string | null })[]).map(({ r0, ...g }) => {
    const s = g.settings;
    const count = s.presets !== undefined ? s.presets + 2 * (s.picks ?? 1) : 3;
    return { ...g, rounds: r0 ? (Array.from({ length: count }) as RoundSpec[]) : null };
  });
}

/** A lobby counts as open while its host has been seen recently. */
export const OPEN_FOR_MS = 40_000;
export const isOpen = (g: GameRow) =>
  !g.guest_id && !!g.settings.seenAt && Math.abs(Date.now() - g.settings.seenAt) < OPEN_FOR_MS;

// ---------- Supabase ----------
function supabaseBackend(sb: SupabaseClient): Backend {
  const table = () => sb.from('games');
  return {
    mode: 'online',
    async createGame(g) {
      const { error } = await table().insert(g);
      if (error) throw new Error(error.message);
    },
    async getGame(id) {
      const { data, error } = await table().select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as GameRow) ?? null;
    },
    async joinGame(id, patch) {
      const { data, error } = await table().update(patch).eq('id', id).is('guest_id', null).select('id');
      if (error) throw new Error(error.message);
      return !!data?.length;
    },
    async setPick(id, role, category) {
      const col = role === 'host' ? 'host_veto' : 'guest_veto';
      const { data, error } = await table().update({ [col]: category }).eq('id', id).is(col, null).select('id');
      if (error) throw new Error(error.message);
      return !!data?.length;
    },
    async setRounds(id, rounds) {
      const { data, error } = await table().update({ rounds }).eq('id', id).is('rounds', null).select('id');
      if (error) throw new Error(error.message);
      return !!data?.length;
    },
    async saveResults(id, role, results) {
      const { error } = await table()
        .update(role === 'host' ? { host_results: results } : { guest_results: results })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    async listOpenGames() {
      const since = new Date(Date.now() - 3 * 3600_000).toISOString();
      const { data, error } = await table()
        .select(LIGHT)
        .is('guest_id', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return lightRows(data).filter(isOpen);
    },
    watchOpenGames(cb) {
      const ch = sb
        .channel(`open-games-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => cb())
        .subscribe();
      const t = setInterval(cb, 3000);
      return () => {
        clearInterval(t);
        sb.removeChannel(ch);
      };
    },
    async touchGame(id, settings) {
      await table().update({ settings }).eq('id', id).is('guest_id', null);
    },
    async setPicks(id, role, value, prev) {
      const col = role === 'host' ? 'host_veto' : 'guest_veto';
      let q = table().update({ [col]: value }).eq('id', id);
      q = prev === null ? q.is(col, null) : q.eq(col, prev);
      const { data, error } = await q.select('id');
      if (error) throw new Error(error.message);
      return !!data?.length;
    },
    async findPlayer(by) {
      let q = sb.from('players').select('*');
      q = by.id ? q.eq('id', by.id) : q.eq('name_key', by.nameKey ?? '');
      const { data, error } = await q.maybeSingle();
      if (error) return undefined; // table missing or offline: profiles unavailable
      return (data as Player) ?? null;
    },
    async savePlayer(p) {
      const { error } = await sb
        .from('players')
        .upsert({ ...p, last_seen: new Date().toISOString() }, { onConflict: 'id' });
      return !error;
    },
    async moveGames(fromId, toId) {
      await table().update({ host_id: toId }).eq('host_id', fromId);
      await table().update({ guest_id: toId }).eq('guest_id', fromId);
    },
    async gamesOf(playerId) {
      const { data, error } = await table()
        .select(LIGHT)
        .or(`host_id.eq.${playerId},guest_id.eq.${playerId}`)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return lightRows(data);
    },
    async allGames() {
      const { data, error } = await table()
        .select(LIGHT)
        .not('guest_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);
      return lightRows(data);
    },
    async listPlayers() {
      const { data, error } = await sb.from('players').select('*').order('last_seen', { ascending: false });
      if (error) return [];
      return (data ?? []) as Player[];
    },
    subscribe(id, cb) {
      let stopped = false;
      const ch = sb
        .channel(`game-${id}`)
        // Realtime trims big rows (e.g. the rounds with all questions), so only use it as a
        // "something changed" signal and fetch the full row.
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, async () => {
          const g = await this.getGame(id).catch(() => null);
          if (g && !stopped) cb(g);
        })
        .subscribe();
      // Polling as a safety net in case realtime is slow or off.
      // Fast while players are joining/vetoing (both are live then), slow afterwards.
      let t: ReturnType<typeof setTimeout>;
      let setupDone = false;
      const poll = async () => {
        const g = await this.getGame(id).catch(() => null);
        if (stopped) return;
        if (g) {
          setupDone = !!g.rounds;
          cb(g);
        }
        t = setTimeout(poll, setupDone ? 8000 : 1500);
      };
      t = setTimeout(poll, 1500);
      return () => {
        stopped = true;
        clearTimeout(t);
        sb.removeChannel(ch);
      };
    },
  };
}

// ---------- Local (one browser only, for development) ----------
function localBackend(): Backend {
  const KEY = 'quizora:local-games';
  const all = (): Record<string, GameRow> => JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = (db: Record<string, GameRow>) => {
    localStorage.setItem(KEY, JSON.stringify(db));
    window.dispatchEvent(new Event('quizora-local'));
  };
  return {
    mode: 'local',
    async createGame(g) {
      const db = all();
      if (db[g.id]) throw new Error('Code already in use');
      db[g.id] = { ...g, created_at: new Date().toISOString() };
      save(db);
    },
    async getGame(id) {
      return all()[id] ?? null;
    },
    async joinGame(id, patch) {
      const db = all();
      if (!db[id] || db[id].guest_id) return false;
      db[id] = { ...db[id], ...patch };
      save(db);
      return true;
    },
    async setPick(id, role, category) {
      const db = all();
      const col = role === 'host' ? 'host_veto' : 'guest_veto';
      if (!db[id] || db[id][col]) return false;
      db[id] = { ...db[id], [col]: category };
      save(db);
      return true;
    },
    async setRounds(id, rounds) {
      const db = all();
      if (!db[id] || db[id].rounds) return false;
      db[id] = { ...db[id], rounds };
      save(db);
      return true;
    },
    async saveResults(id, role, results) {
      const db = all();
      if (!db[id]) return;
      db[id] = { ...db[id], [role === 'host' ? 'host_results' : 'guest_results']: results };
      save(db);
    },
    async listOpenGames() {
      return Object.values(all()).filter(isOpen);
    },
    watchOpenGames(cb) {
      window.addEventListener('storage', cb);
      window.addEventListener('quizora-local', cb);
      const t = setInterval(cb, 3000);
      return () => {
        clearInterval(t);
        window.removeEventListener('storage', cb);
        window.removeEventListener('quizora-local', cb);
      };
    },
    async touchGame(id, settings) {
      const db = all();
      if (!db[id] || db[id].guest_id) return;
      db[id] = { ...db[id], settings };
      save(db);
    },
    async setPicks(id, role, value, prev) {
      const db = all();
      const col = role === 'host' ? 'host_veto' : 'guest_veto';
      if (!db[id] || (db[id][col] ?? null) !== prev) return false;
      db[id] = { ...db[id], [col]: value };
      save(db);
      return true;
    },
    async findPlayer(by) {
      const ps: Player[] = JSON.parse(localStorage.getItem('quizora:local-players') || '[]');
      return ps.find((p) => (by.id ? p.id === by.id : p.name_key === by.nameKey)) ?? null;
    },
    async savePlayer(p) {
      const ps: Player[] = JSON.parse(localStorage.getItem('quizora:local-players') || '[]');
      localStorage.setItem('quizora:local-players', JSON.stringify([...ps.filter((x) => x.id !== p.id), p]));
      return true;
    },
    async moveGames(fromId, toId) {
      const db = all();
      for (const g of Object.values(db)) {
        if (g.host_id === fromId) g.host_id = toId;
        if (g.guest_id === fromId) g.guest_id = toId;
      }
      save(db);
    },
    async gamesOf(playerId) {
      return Object.values(all())
        .filter((g) => g.host_id === playerId || g.guest_id === playerId)
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    },
    async allGames() {
      return Object.values(all()).filter((g) => g.guest_id);
    },
    async listPlayers() {
      return JSON.parse(localStorage.getItem('quizora:local-players') || '[]');
    },
    subscribe(id, cb) {
      const fire = () => {
        const g = all()[id];
        if (g) cb(g);
      };
      window.addEventListener('storage', fire);
      window.addEventListener('quizora-local', fire);
      return () => {
        window.removeEventListener('storage', fire);
        window.removeEventListener('quizora-local', fire);
      };
    },
  };
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const backend: Backend =
  url && key ? supabaseBackend(createClient(url, key, { auth: { persistSession: false } })) : localBackend();

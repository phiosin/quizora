import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameRow, Results, RoundSpec } from './types';

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
        .select('id,created_at,host_id,host_name,guest_id,guest_name,settings,offered,host_veto,guest_veto,host_results,guest_results')
        .is('guest_id', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return ((data ?? []) as GameRow[]).filter(isOpen);
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

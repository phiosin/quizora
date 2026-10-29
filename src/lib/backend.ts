import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameRow, Results, RoundSpec } from './types';

export interface Backend {
  mode: 'online' | 'local';
  createGame(g: GameRow): Promise<void>;
  getGame(id: string): Promise<GameRow | null>;
  /** Claims the guest slot. Returns false if someone else joined first. */
  joinGame(id: string, patch: Pick<GameRow, 'guest_id' | 'guest_name'>): Promise<boolean>;
  /** Sets a veto if that player hasn't vetoed yet. Returns false if it was already set. */
  setVeto(id: string, role: 'host' | 'guest', category: string): Promise<boolean>;
  /** Stores the generated rounds unless someone already did. */
  setRounds(id: string, rounds: RoundSpec[]): Promise<boolean>;
  saveResults(id: string, role: 'host' | 'guest', results: Results): Promise<void>;
  subscribe(id: string, cb: (g: GameRow) => void): () => void;
}

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
    async setVeto(id, role, category) {
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
    subscribe(id, cb) {
      const ch = sb
        .channel(`game-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, (p) =>
          cb(p.new as GameRow),
        )
        .subscribe();
      // Polling as a safety net in case realtime is slow or off.
      // Fast while players are joining/vetoing (both are live then), slow afterwards.
      let t: ReturnType<typeof setTimeout>;
      let stopped = false;
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
    async setVeto(id, role, category) {
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

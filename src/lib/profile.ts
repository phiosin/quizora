const KEY = 'quizora:profile';
const GAMES_KEY = 'quizora:games:mine';

export interface Profile {
  id: string;
  name: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}

export function getProfile(): Profile {
  let p = read<Profile | null>(KEY, null);
  if (!p) {
    p = { id: crypto.randomUUID(), name: '' };
    write(KEY, p);
  }
  return p;
}

export function setName(name: string) {
  write(KEY, { ...getProfile(), name: name.trim().slice(0, 20) });
}

export interface MyGame {
  code: string;
  createdAt: number;
}

export function myGames(): MyGame[] {
  return read<MyGame[]>(GAMES_KEY, []);
}

export function rememberGame(code: string) {
  const list = myGames().filter((g) => g.code !== code);
  list.unshift({ code, createdAt: Date.now() });
  write(GAMES_KEY, list.slice(0, 30));
}

export function forgetGame(code: string) {
  write(GAMES_KEY, myGames().filter((g) => g.code !== code));
}

/**
 * Sets the nickname and links this device to that player's profile.
 * - Name already used (on any device) → this device becomes that player (stats included).
 * - New name → creates a profile (or renames this device's own profile).
 * Profiles are trust-based: there are no passwords.
 */
export async function claimName(raw: string): Promise<'welcome-back' | 'new' | 'renamed' | 'offline'> {
  // Imported lazily so this module stays free of the backend at load time
  const { backend, nameKey } = await import('./backend');
  const name = raw.trim().slice(0, 20);
  const key = nameKey(name);
  const me = getProfile();
  const owner = await backend.findPlayer({ nameKey: key });
  if (owner === undefined) {
    setName(name);
    return 'offline';
  }
  if (owner && owner.id !== me.id) {
    // Someone with this name exists: take over that profile on this device
    const mine = await backend.findPlayer({ id: me.id });
    if (!mine) await backend.moveGames(me.id, owner.id).catch(() => {}); // carry over games from before profiles
    write(KEY, { id: owner.id, name: owner.name });
    await backend.savePlayer({ id: owner.id, name: owner.name, name_key: owner.name_key });
    return 'welcome-back';
  }
  const existed = await backend.findPlayer({ id: me.id });
  setName(name);
  await backend.savePlayer({ id: me.id, name, name_key: key });
  return existed && existed.name_key !== key ? 'renamed' : owner ? 'welcome-back' : 'new';
}

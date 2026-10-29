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

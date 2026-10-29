/**
 * The app never reloads while you move between screens, so a phone can keep running an old
 * version for hours. This checks whether a newer version is online and reloads when it's safe
 * (not in the middle of a round).
 */

const currentBundle = () =>
  [...document.scripts].map((s) => s.src.match(/assets\/index-[\w-]+\.js/)?.[0]).find(Boolean) ?? null;

let lastCheck = 0;

async function latestBundle(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    return html.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;
  } catch {
    return null;
  }
}

const inRound = () => /\/play\//.test(location.hash);

export async function checkForUpdate(force = false) {
  if (!import.meta.env.PROD) return;
  if (!force && Date.now() - lastCheck < 30_000) return;
  lastCheck = Date.now();
  const mine = currentBundle();
  const latest = await latestBundle();
  if (mine && latest && mine !== latest && !inRound()) location.reload();
}

export function installUpdateChecks() {
  void checkForUpdate(true);
  window.addEventListener('hashchange', () => void checkForUpdate());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate(true);
  });
}

/** Short id of the running version, shown on the menu. */
export const buildTag = () => currentBundle()?.replace(/^assets\/index-|\.js$/g, '').slice(0, 6) ?? 'dev';

const ADJ = ['brave', 'lucky', 'swift', 'sunny', 'fuzzy', 'mighty', 'quiet', 'clever', 'jolly', 'wild', 'cosmic', 'golden', 'happy', 'silly', 'bold', 'royal', 'rapid', 'snowy', 'tiny', 'giant', 'misty', 'proud', 'calm', 'zesty'];
const NOUN = ['otter', 'tiger', 'falcon', 'panda', 'koala', 'moose', 'lynx', 'badger', 'gecko', 'walrus', 'yak', 'llama', 'raven', 'bison', 'heron', 'fox', 'whale', 'mole', 'puffin', 'camel', 'eagle', 'wombat', 'shark', 'turtle'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function newCode(): string {
  return `${pick(ADJ)}-${pick(NOUN)}-${Math.floor(10 + Math.random() * 90)}`;
}

/** Accepts "Brave Otter 37", "brave-otter-37" or a full share link. */
export function parseCode(input: string): string {
  const s = input.trim();
  const m = s.match(/#\/m\/([a-z0-9-]+)/i);
  const raw = m ? m[1] : s;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function shareLink(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#/m/${code}`;
}

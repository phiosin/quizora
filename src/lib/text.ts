/** Lowercase, strip accents and punctuation: "Côte d’Ivoire" → "cote divoire". */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\b(the|river|state of|republic of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Typos allowed for a name of this length. */
const allowedTypos = (len: number) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

export interface Named {
  id: string;
  name: string;
  aliases: string[];
}

const formsOf = (x: Named) => [x.name, ...x.aliases].map(norm).filter(Boolean);

export function exactMatch<T extends Named>(input: string, list: T[]): T | undefined {
  const q = norm(input);
  if (!q) return undefined;
  return list.find((x) => formsOf(x).includes(q));
}

export function fuzzyMatch<T extends Named>(input: string, list: T[]): T | undefined {
  const exact = exactMatch(input, list);
  if (exact) return exact;
  const q = norm(input);
  if (q.length < 4) return undefined;
  let best: T | undefined;
  let bestD = Infinity;
  for (const x of list) {
    for (const f of formsOf(x)) {
      const d = levenshtein(q, f);
      if (d <= allowedTypos(f.length) && d < bestD) {
        best = x;
        bestD = d;
      }
    }
  }
  return best;
}

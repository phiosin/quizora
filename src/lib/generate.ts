import { catById, shuffle } from './categories';
import type { ChoiceQuestion, Level, MapData, MapItem, MapSpec, RoundSpec } from './types';

const BASE = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${BASE}${path}`).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${path}`);
        return r.json();
      }),
    );
  }
  return cache.get(path) as Promise<T>;
}

export const loadMap = (id: string) => fetchJson<MapData>(`data/maps/${id}.json`);

interface Capital {
  id: string;
  country: string;
  capital: string;
  region: string;
  area: number;
}
const loadCapitals = () => fetchJson<Capital[]>('data/capitals.json');

// Round sizes per difficulty level (index 1..4)
const MAP_COUNT = [0, 5, 8, 12, 15];
const LOCATE_COUNT = [0, 5, 8, 10, 12];
const MAP_TIME = [0, 90, 120, 150, 180];
const CHOICE_TIME = [0, 20, 15, 12, 10];
const CHOICE_COUNT = 10;

/** Items of the right difficulty: level L draws mostly from tiers L-1..L. */
function poolFor<T extends { tier: Level }>(items: T[], level: Level, need: number): T[] {
  let pool = items.filter((x) => x.tier >= Math.max(1, level - 1) && x.tier <= level);
  if (pool.length < need) pool = items.filter((x) => x.tier <= level);
  if (pool.length < need) pool = items;
  return pool;
}

export async function generateRound(categoryId: string, level: Level, forceType?: MapSpec['type']): Promise<RoundSpec> {
  const cat = catById(categoryId);

  if (cat.kind === 'map') {
    const map = await loadMap(cat.map!);
    const type = forceType ?? (Math.random() < 0.5 ? 'map-type' : 'map-locate');
    const count = (type === 'map-type' ? MAP_COUNT : LOCATE_COUNT)[level];
    const items = shuffle(poolFor<MapItem>(map.items, level, count)).slice(0, count);
    return { type, category: cat.id, level, map: map.id, items: items.map((i) => i.id), timeLimit: MAP_TIME[level] };
  }

  if (cat.kind === 'capitals') {
    const all = await loadCapitals();
    const region = cat.region ? all.filter((c) => c.region === cat.region) : all;
    // Bigger countries tend to be better known → tier by area.
    const sorted = [...region].sort((a, b) => b.area - a.area);
    const tiered = sorted.map((c, i) => ({ ...c, tier: (1 + Math.floor((i * 4) / sorted.length)) as Level }));
    const picks = shuffle(poolFor(tiered, level, CHOICE_COUNT)).slice(0, CHOICE_COUNT);
    const questions: ChoiceQuestion[] = picks.map((c) => {
      const others = shuffle(region.filter((o) => o.id !== c.id)).slice(0, 3);
      const reverse = Math.random() < 0.35;
      const right = reverse ? c.country : c.capital;
      const options = shuffle([right, ...others.map((o) => (reverse ? o.country : o.capital))]);
      return {
        text: reverse ? `${c.capital} is the capital of…` : `What is the capital of ${c.country}?`,
        options,
        answer: options.indexOf(right),
      };
    });
    return { type: 'choice', category: cat.id, level, questions, perQuestion: CHOICE_TIME[level] };
  }

  // Trivia from The Trivia API (free, no key)
  const diff = level === 1 ? 'easy' : level === 2 ? 'medium' : 'hard';
  const res = await fetch(
    `https://the-trivia-api.com/v2/questions?limit=${CHOICE_COUNT}&categories=${cat.trivia}&difficulties=${diff}`,
  );
  if (!res.ok) throw new Error('Could not load trivia questions. Please try again.');
  const data: { question: { text: string }; correctAnswer: string; incorrectAnswers: string[] }[] = await res.json();
  if (!data.length) throw new Error('No trivia questions available right now.');
  const questions = data.map((q) => {
    const options = shuffle([q.correctAnswer, ...q.incorrectAnswers.slice(0, 3)]);
    return { text: q.question.text, options, answer: options.indexOf(q.correctAnswer) };
  });
  return { type: 'choice', category: cat.id, level, questions, perQuestion: CHOICE_TIME[level] + (level === 4 ? 0 : 5) };
}

import type { DifficultySetting, Level } from './types';

export type CategoryKind = 'map' | 'capitals' | 'trivia';

export interface Category {
  id: string;
  name: string;
  emoji: string;
  kind: CategoryKind;
  map?: string; // map file id
  region?: string; // capitals region filter
  trivia?: string; // the-trivia-api category slug
}

export const CATEGORIES: Category[] = [
  { id: 'map-us', name: 'US States', emoji: '🦅', kind: 'map', map: 'us-states' },
  { id: 'map-europe', name: 'European Countries', emoji: '🏰', kind: 'map', map: 'europe-countries' },
  { id: 'map-world', name: 'World Countries', emoji: '🌍', kind: 'map', map: 'world-countries' },
  { id: 'map-africa', name: 'African Countries', emoji: '🦁', kind: 'map', map: 'africa-countries' },
  { id: 'map-asia', name: 'Asian Countries', emoji: '🏯', kind: 'map', map: 'asia-countries' },
  { id: 'map-americas', name: 'Countries of the Americas', emoji: '🌎', kind: 'map', map: 'americas-countries' },
  { id: 'map-rivers', name: 'European Rivers', emoji: '🌊', kind: 'map', map: 'europe-rivers' },
  { id: 'cap-world', name: 'World Capitals', emoji: '🏛️', kind: 'capitals' },
  { id: 'cap-europe', name: 'European Capitals', emoji: '🗼', kind: 'capitals', region: 'Europe' },
  { id: 'cap-asia', name: 'Asian Capitals', emoji: '🏮', kind: 'capitals', region: 'Asia' },
  { id: 'cap-africa', name: 'African Capitals', emoji: '🌅', kind: 'capitals', region: 'Africa' },
  { id: 'cap-americas', name: 'Capitals of the Americas', emoji: '🗽', kind: 'capitals', region: 'Americas' },
  { id: 'tr-general', name: 'General Knowledge', emoji: '💡', kind: 'trivia', trivia: 'general_knowledge' },
  { id: 'tr-science', name: 'Science', emoji: '🔬', kind: 'trivia', trivia: 'science' },
  { id: 'tr-history', name: 'History', emoji: '📜', kind: 'trivia', trivia: 'history' },
  { id: 'tr-geography', name: 'Geography', emoji: '🗺️', kind: 'trivia', trivia: 'geography' },
  { id: 'tr-film', name: 'Film & TV', emoji: '🎬', kind: 'trivia', trivia: 'film_and_tv' },
  { id: 'tr-music', name: 'Music', emoji: '🎵', kind: 'trivia', trivia: 'music' },
  { id: 'tr-sport', name: 'Sport & Leisure', emoji: '⚽', kind: 'trivia', trivia: 'sport_and_leisure' },
  { id: 'tr-arts', name: 'Arts & Literature', emoji: '🎨', kind: 'trivia', trivia: 'arts_and_literature' },
  { id: 'tr-food', name: 'Food & Drink', emoji: '🍕', kind: 'trivia', trivia: 'food_and_drink' },
  { id: 'tr-society', name: 'Society & Culture', emoji: '🎭', kind: 'trivia', trivia: 'society_and_culture' },
];

export const catById = (id: string) => CATEGORIES.find((c) => c.id === id)!;

export const LEVEL_NAMES: Record<Level, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very hard' };

export const ROUNDS_PER_MATCH = 3;
export const OFFER_SIZE = 5;

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 5 random categories, at least 2 of them map quizzes. */
export function randomOffer(): string[] {
  const maps = shuffle(CATEGORIES.filter((c) => c.kind === 'map')).slice(0, 2);
  const rest = shuffle(CATEGORIES.filter((c) => !maps.includes(c))).slice(0, OFFER_SIZE - 2);
  return shuffle([...maps, ...rest]).map((c) => c.id);
}

export function levelForRound(setting: DifficultySetting, round: number): Level {
  if (setting.kind === 'fixed') return setting.level;
  return Math.min(4, setting.start + round) as Level;
}

export function describeDifficulty(s: DifficultySetting): string {
  if (s.kind === 'fixed') return LEVEL_NAMES[s.level];
  return `Rising: ${LEVEL_NAMES[s.start as Level]} → ${LEVEL_NAMES[(s.start + 2) as Level]}`;
}

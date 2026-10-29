export type Level = 1 | 2 | 3 | 4;

export type DifficultySetting =
  | { kind: 'fixed'; level: Level }
  | { kind: 'rising'; start: 1 | 2 };

export interface ChoiceQuestion {
  text: string;
  options: string[];
  answer: number;
}

export type RoundSpec =
  | {
      type: 'map-type' | 'map-locate';
      category: string;
      level: Level;
      map: string;
      items: string[];
      timeLimit: number;
    }
  | {
      type: 'choice';
      category: string;
      level: Level;
      questions: ChoiceQuestion[];
      perQuestion: number;
    };

export interface RoundResult {
  status: 'started' | 'done';
  score: number;
  correct: number;
  total: number;
  errors: number;
  timeUsed: number;
  gaveUp?: boolean;
}

export type Results = Record<string, RoundResult>;

export interface GameRow {
  id: string;
  created_at?: string;
  host_id: string;
  host_name: string;
  guest_id: string | null;
  guest_name: string | null;
  settings: { difficulty: DifficultySetting };
  offered: string[];
  host_veto: string | null;
  guest_veto: string | null;
  rounds: RoundSpec[] | null;
  host_results: Results;
  guest_results: Results;
}

export interface MapItem {
  id: string;
  name: string;
  aliases: string[];
  tier: Level;
  d: string;
  c: [number, number];
  dot?: [number, number];
}

export interface MapData {
  id: string;
  title: string;
  kind: 'area' | 'line';
  w: number;
  h: number;
  base: string;
  baseLines?: string;
  items: MapItem[];
}

export type MapSpec = Extract<RoundSpec, { map: string }>;
export type ChoiceSpec = Extract<RoundSpec, { type: 'choice' }>;

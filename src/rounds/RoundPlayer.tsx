import { useEffect, useState } from 'react';
import { catById, LEVEL_NAMES } from '../lib/categories';
import { loadMap } from '../lib/generate';
import type { MapData, RoundResult, RoundSpec } from '../lib/types';
import ChoiceRound from './ChoiceRound';
import MapLocateRound from './MapLocateRound';
import MapTypeRound from './MapTypeRound';

interface Props {
  spec: RoundSpec;
  title?: string;
  onStart?: () => void;
  onEnd: (r: RoundResult) => void;
  onContinue: () => void;
  onBack: () => void;
}

const HOW: Record<RoundSpec['type'], string> = {
  'map-type': 'Some places are highlighted in red. Type their names: typos are mostly forgiven. Wrong guesses cost points; finishing early earns a time bonus.',
  'map-locate': 'A name appears. Tap it on the map (pinch or use +/− to zoom). Three tries per place: the first try scores most.',
  choice: 'Pick the right answer. Faster answers score more.',
};

export default function RoundPlayer({ spec, title, onStart, onEnd, onContinue, onBack }: Props) {
  const cat = catById(spec.category);
  const [map, setMap] = useState<MapData | null>(null);
  const [err, setErr] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (spec.type !== 'choice') loadMap(spec.map).then(setMap, (e) => setErr(String(e.message ?? e)));
  }, [spec]);

  const ready = spec.type === 'choice' || map;

  if (!started) {
    return (
      <div className="screen">
        <button className="back" onClick={onBack}>
          ← Back
        </button>
        <div className="card center intro">
          {title && <div className="muted">{title}</div>}
          <div className="intro-emoji">{cat.emoji}</div>
          <h2>{cat.name}</h2>
          <div className={`level-badge l${spec.level}`}>{LEVEL_NAMES[spec.level]}</div>
          <p className="how">
            <strong>
              {spec.type === 'choice'
                ? `${spec.questions.length} questions`
                : spec.type === 'map-type'
                  ? `Name ${spec.items.length} highlighted ${map?.kind === 'line' ? 'rivers' : 'places'}`
                  : `Find ${spec.items.length} places on the map`}
            </strong>
            <br />
            {HOW[spec.type]}
            {spec.type !== 'choice' && (
              <>
                <br />
                Time limit: {Math.round(spec.timeLimit / 60 * 10) / 10} min
              </>
            )}
          </p>
          {err && <p className="error">{err}</p>}
          <button
            className="btn primary wide big"
            disabled={!ready}
            onClick={() => {
              onStart?.();
              setStarted(true);
            }}
          >
            {ready ? 'Start!' : 'Loading map…'}
          </button>
          {onStart && <p className="muted small">You can only play each round once: once you start, it counts.</p>}
        </div>
      </div>
    );
  }

  if (spec.type === 'choice') return <ChoiceRound spec={spec} onEnd={onEnd} onContinue={onContinue} />;
  if (spec.type === 'map-type') return <MapTypeRound spec={spec} map={map!} onEnd={onEnd} onContinue={onContinue} />;
  return <MapLocateRound spec={spec} map={map!} onEnd={onEnd} onContinue={onContinue} />;
}

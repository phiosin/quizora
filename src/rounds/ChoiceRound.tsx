import { useState } from 'react';
import type { RoundResult, RoundSpec } from '../lib/types';
import { useCountdown } from '../lib/useCountdown';

interface Props {
  spec: Extract<RoundSpec, { type: 'choice' }>;
  onEnd: (r: RoundResult) => void;
  onContinue: () => void;
}

/** Multiple choice: 50 points per right answer + up to 50 for speed. */
export default function ChoiceRound({ spec, onEnd, onContinue }: Props) {
  const qs = spec.questions;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [score, setScore] = useState(0);
  const [timeUsed, setTimeUsed] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const q = qs[i];

  const answer = (choice: number, leftNow: number) => {
    if (picked !== null || result) return;
    setPicked(choice);
    const ok = choice === q.answer;
    const gained = ok ? 50 + Math.round((50 * leftNow) / spec.perQuestion) : 0;
    const newScore = score + gained;
    const newAnswers = [...answers, ok];
    const used = timeUsed + (spec.perQuestion - leftNow);
    setScore(newScore);
    setAnswers(newAnswers);
    setTimeUsed(used);
    setTimeout(() => {
      if (i + 1 >= qs.length) {
        const r: RoundResult = {
          status: 'done',
          score: newScore,
          correct: newAnswers.filter(Boolean).length,
          total: qs.length,
          errors: newAnswers.filter((a) => !a).length,
          timeUsed: Math.round(used),
        };
        setResult(r);
        onEnd(r);
      } else {
        setI(i + 1);
        setPicked(null);
      }
    }, ok ? 700 : 1400);
  };

  const left = useCountdown(spec.perQuestion, picked === null && !result, () => answer(-1, 0), i);

  if (result) {
    return (
      <div className="round choice">
        <div className="card center">
          <div className="big-score">{result.score}</div>
          <div className="muted">points</div>
          <div className="dots">
            {answers.map((a, k) => (
              <span key={k} className={a ? 'dot-ok' : 'dot-bad'}>
                {a ? '✓' : '✗'}
              </span>
            ))}
          </div>
          <p>
            {result.correct} of {result.total} right
          </p>
          <button className="btn primary wide" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="round choice">
      <div className="round-bar">
        <span className="pill">
          Question {i + 1}/{qs.length}
        </span>
        <span className="pill">{score} pts</span>
      </div>
      <div className="qbar">
        <div className="qbar-fill" style={{ width: `${(left / spec.perQuestion) * 100}%` }} />
      </div>
      <div className="question">{q.text}</div>
      <div className="options">
        {q.options.map((o, k) => {
          let cls = 'option';
          if (picked !== null) {
            if (k === q.answer) cls += ' right';
            else if (k === picked) cls += ' wrong';
            else cls += ' dim';
          }
          return (
            <button key={k} className={cls} onClick={() => answer(k, left)}>
              {o}
            </button>
          );
        })}
      </div>
      {picked === -1 && <div className="feedback bad center">⏰ Time's up!</div>}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

/** Counts down from `seconds` while `running`. Calls onEnd once at zero. Restarts when `resetKey` changes. */
export function useCountdown(seconds: number, running: boolean, onEnd: () => void, resetKey: unknown = 0) {
  const [left, setLeft] = useState(seconds);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const remaining = useRef(seconds);
  const lastKey = useRef(resetKey);

  if (lastKey.current !== resetKey) {
    lastKey.current = resetKey;
    remaining.current = seconds;
  }

  useEffect(() => {
    setLeft(remaining.current);
    if (!running) return;
    const deadline = performance.now() + remaining.current * 1000;
    const t = setInterval(() => {
      const l = Math.max(0, (deadline - performance.now()) / 1000);
      remaining.current = l;
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        endRef.current();
      }
    }, 100);
    return () => clearInterval(t);
  }, [running, resetKey]);

  return left;
}

export const fmtTime = (s: number) => {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

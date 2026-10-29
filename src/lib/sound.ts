/** Tiny synthesized sound effects (no audio files). Kept quiet on purpose. */

const KEY = 'quizora:muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

const VOLUME = 0.07;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft note. `at` is seconds from now. */
function tone(freq: number, dur: number, at = 0, type: OscillatorType = 'sine', vol = 1) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(VOLUME * vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(660, 0.06, 0, 'triangle', 0.6),
  correct: () => {
    tone(784, 0.12, 0, 'sine');
    tone(1175, 0.18, 0.07, 'sine');
  },
  wrong: () => tone(196, 0.22, 0, 'triangle', 0.8),
  start: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, i * 0.09, 'triangle')),
  join: () => {
    tone(880, 0.14, 0, 'sine');
    tone(1320, 0.22, 0.12, 'sine');
  },
  /** Your veto turn starts */
  yourTurn: () => [659, 880, 1319].forEach((f, i) => tone(f, 0.16, i * 0.08, 'triangle')),
  /** Opponent's veto turn starts */
  theirTurn: () => tone(523, 0.18, 0, 'sine', 0.7),
  tick: () => tone(1000, 0.05, 0, 'square', 0.25),
  veto: () => tone(330, 0.16, 0, 'sawtooth', 0.35),
  finish: () => [784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, i * 0.11, 'sine')),
};

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Soft click on every button press, unless the button opts out with data-sfx="off". */
export function installClickSounds() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (b && !(b as HTMLButtonElement).disabled && b.getAttribute('data-sfx') !== 'off') sfx.click();
    },
    true,
  );
}

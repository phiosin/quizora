import { useEffect, useRef, useState } from 'react';
import { backend } from '../lib/backend';
import { CATEGORIES, catById, describeDifficulty, LEVEL_NAMES, levelForRound, roundsFor } from '../lib/categories';
import { shareLink } from '../lib/codes';
import { generateRound } from '../lib/generate';
import { getProfile, rememberGame } from '../lib/profile';
import { go } from '../lib/router';
import { sfx } from '../lib/sound';
import type { GameRow, RoundSpec } from '../lib/types';
import { useCountdown } from '../lib/useCountdown';
import BoatRace from '../components/BoatRace';
import { cannotJoin } from '../lib/limits';
import { Logo, NameCard } from './Home';
import { matchStatus, total } from './matchStatus';
import { CategoryChip } from './NewMatch';

/** Seconds each player gets to pick a category. */
const PICK_SECONDS = 20;
/** Extra wait before picking randomly for an opponent who seems to be away. */
const AWAY_GRACE = 4;

export function useGame(code: string) {
  const [g, setG] = useState<GameRow | null | undefined>(undefined);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    backend.getGame(code).then(
      (row) => alive && setG(row),
      (e) => alive && setErr(String(e.message ?? e)),
    );
    const off = backend.subscribe(code, (row) => alive && setG(row));
    return () => {
      alive = false;
      off();
    };
  }, [code]);
  const refresh = async () => {
    const row = await backend.getGame(code).catch(() => null);
    if (row) setG(row);
  };
  return { g, setG, err, refresh };
}

export default function Match({ code }: { code: string }) {
  const { g, err, refresh } = useGame(code);
  const me = getProfile();

  // Ping when the opponent shows up in the lobby
  const hadGuest = useRef<boolean | null>(null);
  useEffect(() => {
    if (!g) return;
    const has = !!g.guest_id;
    if (hadGuest.current === false && has && g.host_id === me.id) sfx.join();
    hadGuest.current = has;
  }, [g, me.id]);

  if (err) return <Shell><p className="error">{err}</p></Shell>;
  if (g === undefined) return <Shell><p className="muted center">Loading…</p></Shell>;
  if (g === null)
    return (
      <Shell>
        <div className="card center">
          <h3>No duel found</h3>
          <p className="muted">Check the code “{code}”: maybe a typo?</p>
          <button className="btn primary" onClick={() => go('/join')}>
            Try another code
          </button>
        </div>
      </Shell>
    );

  const st = matchStatus(g, me.id);
  if (!g.guest_id) return st.role === 'host' ? <Lobby g={g} /> : <JoinView g={g} onJoined={refresh} />;
  if (!g.rounds) {
    const bothReady = !!g.host_results.ready && !!g.guest_results.ready;
    if (g.settings.presets === undefined)
      return (
        <Shell>
          <div className="card center">
            <h3>Old duel</h3>
            <p className="muted">This duel was set up with the old veto rules. Please open a new game.</p>
            <button className="btn primary" onClick={() => go('/new')}>
              Open a game
            </button>
          </div>
        </Shell>
      );
    if (!bothReady) return <RulesScreen g={g} refresh={refresh} />;
    return <PickPhase g={g} refresh={refresh} />;
  }
  return <Scoreboard g={g} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="screen">
      <Logo />
      <button className="back" onClick={() => go('/')}>
        ← Menu
      </button>
      {children}
    </div>
  );
}

function Players({ g, turn }: { g: GameRow; turn?: 'host' | 'guest' | null }) {
  return (
    <div className="lobby-players">
      <div className={`lp ${turn === 'host' ? 'on' : ''}`}>
        <span className="lp-dot ok" />
        {g.host_name}
      </div>
      <div className="vs">VS</div>
      <div className={`lp ${turn === 'guest' ? 'on' : ''}`}>
        {g.guest_id ? (
          <>
            <span className="lp-dot ok" />
            {g.guest_name}
          </>
        ) : (
          <>
            <span className="pulse" />
            <span className="muted">waiting…</span>
          </>
        )}
      </div>
    </div>
  );
}

function Lobby({ g }: { g: GameRow }) {
  const link = shareLink(g.id);

  // Heartbeat: keeps this game in everyone's "Open games" list while you're here
  const settings = useRef(g.settings);
  useEffect(() => {
    const beat = () => void backend.touchGame(g.id, { ...settings.current, seenAt: Date.now() }).catch(() => {});
    beat();
    const t = setInterval(beat, 10_000);
    const onVis = () => document.visibilityState === 'visible' && beat();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      // Leaving the lobby takes the game off the list (unless someone just joined)
      void backend.touchGame(g.id, { ...settings.current, seenAt: 0 }).catch(() => {});
    };
  }, [g.id]);

  const [copied, setCopied] = useState('');
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  };
  const share = () =>
    navigator.share
      ? navigator.share({ title: 'Quizora duel', text: `Duel me on Quizora! Code: ${g.id}`, url: link }).catch(() => {})
      : copy(link, 'link');

  return (
    <Shell>
      <div className="card center">
        <div className="intro-emoji">📣</div>
        <h3>Your game is open</h3>
        <p className="muted small">
          It shows up under <strong>Open games</strong> on everyone's menu. The first person to join plays you.
        </p>
      </div>
      <div className="card center">
        <div className="muted small">Or send a friend the code</div>
        <div className="big-code" onClick={() => copy(g.id, 'code')}>
          {g.id}
        </div>
        <div className="row-gap">
          <button className="btn primary" onClick={share}>
            📤 Share link
          </button>
          <button className="btn ghost" onClick={() => copy(link, 'link')}>
            {copied === 'link' ? '✓ Copied' : '🔗 Copy link'}
          </button>
        </div>
        {copied === 'code' && <p className="muted small">Code copied</p>}
      </div>
      <div className="card">
        <h3>Lobby</h3>
        <Players g={g} />
        <p className="muted small center">
          Stay on this screen: if you leave, your game disappears from the list.
        </p>
      </div>
      <div className="card" style={{ display: g.offered.length ? undefined : 'none' }}>
        <h3>Starting with · {describeDifficulty(g.settings.difficulty)}</h3>
        <div className="cat-list">
          {g.offered.map((id) => (
            <CategoryChip key={id} id={id} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function JoinView({ g, onJoined }: { g: GameRow; onJoined: () => Promise<void> }) {
  const [named, setNamed] = useState(!!getProfile().name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!named)
    return (
      <Shell>
        <p className="center">
          <strong>{g.host_name}</strong> challenged you!
        </p>
        <NameCard onDone={() => setNamed(true)} />
      </Shell>
    );

  const join = async () => {
    setBusy(true);
    setErr('');
    try {
      const me = getProfile();
      const why = await cannotJoin(me.id);
      if (why) {
        setErr(why);
        setBusy(false);
        return;
      }
      const ok = await backend.joinGame(g.id, { guest_id: me.id, guest_name: me.name || 'Player' });
      if (!ok) {
        setErr('Someone else already joined this duel.');
        setBusy(false);
        return;
      }
      rememberGame(g.id);
      await onJoined();
    } catch (e) {
      setErr(String((e as Error).message));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="card center">
        <div className="intro-emoji">⚔️</div>
        <h2>{g.host_name} challenges you!</h2>
        <p className="muted">
          {describeDifficulty(g.settings.difficulty)} · {roundCount(g)} rounds
        </p>
      </div>
      <div className="card" style={{ display: g.offered.length ? undefined : 'none' }}>
        <h3>Starting with</h3>
        <p className="muted small">After joining you each add one category of your choice.</p>
        <div className="cat-list">
          {g.offered.map((id) => (
            <CategoryChip key={id} id={id} />
          ))}
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <button className="btn primary wide big" disabled={busy} onClick={join}>
        {busy ? 'Joining…' : '⚔️ Join duel'}
      </button>
    </Shell>
  );
}

function RulesScreen({ g, refresh }: { g: GameRow; refresh: () => Promise<void> }) {
  const me = getProfile();
  const st = matchStatus(g, me.id);
  const [busy, setBusy] = useState(false);
  const hostReady = !!g.host_results.ready;
  const guestReady = !!g.guest_results.ready;
  const iAmReady = st.role === 'host' ? hostReady : guestReady;

  const ready = async () => {
    if (st.role === 'none') return;
    setBusy(true);
    sfx.join();
    try {
      await backend.saveResults(g.id, st.role, {
        ...st.mine,
        ready: { status: 'ready', score: 0, correct: 0, total: 0, errors: 0, timeUsed: 0 },
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const tick = (on: boolean) => <span className={`ready-mark ${on ? 'on' : ''}`}>{on ? '✓ Ready' : '…'}</span>;

  return (
    <Shell>
      <div className="card">
        <div className="lobby-players">
          <div className={`lp ${hostReady ? 'on' : ''}`}>
            {g.host_name} {tick(hostReady)}
          </div>
          <div className="vs">VS</div>
          <div className={`lp ${guestReady ? 'on' : ''}`}>
            {g.guest_name} {tick(guestReady)}
          </div>
        </div>
      </div>
      <div className="card rules">
        <h3>How this duel works</h3>
        <ol>
          <li>
            <strong>Pick:</strong>{' '}
            {g.offered.length === 0
              ? `nothing is random: you take turns picking ${picksEach(g)} categories each, ${g.host_name} first.`
              : `the match starts with ${g.offered.length === 1 ? '1 random category' : `${g.offered.length} random categories`}. Then ${g.host_name} adds one of their choice, then ${g.guest_name}.`}{' '}
            {PICK_SECONDS} seconds per pick, or a random one is added.
          </li>
          <li>
            <strong>{roundCount(g)} rounds</strong> · {describeDifficulty(g.settings.difficulty)}. Both of you get
            exactly the same questions.
          </li>
          <li>
            <strong>Play whenever you like</strong>, but each round only once: as soon as you press Start, it counts.
          </li>
          <li>
            <strong>Maps:</strong> type the names (English, German or Spanish, one wrong letter is fine) or tap the
            place. Wrong guesses cost points, finishing fast earns a bonus.
          </li>
          <li>
            <strong>Quizzes:</strong> faster right answers score more.
          </li>
          <li>You only see your opponent's score for a round after playing it yourself. Most points wins!</li>
        </ol>
      </div>
      <div className="card" style={{ display: g.offered.length ? undefined : 'none' }}>
        <h3>Starting with</h3>
        <div className="cat-list">
          {g.offered.map((id) => (
            <CategoryChip key={id} id={id} />
          ))}
        </div>
      </div>
      {st.role !== 'none' &&
        (iAmReady ? (
          <p className="waiting center">
            <span className="pulse" /> Waiting for {st.opponent} to get ready…
          </p>
        ) : (
          <button className="btn primary wide big sticky-cta" disabled={busy} onClick={ready} data-sfx="off">
            ✋ I'm ready
          </button>
        ))}
    </Shell>
  );
}

const pickRandom = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** A player's picks, stored comma-separated in host_veto / guest_veto. */
const picksOf = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const picksEach = (g: GameRow) => g.settings.picks ?? 1;
const roundCount = (g: GameRow) => roundsFor(g.offered.length, picksEach(g));
/** Whose turn it is: host and guest alternate, host first. */
function pickTurn(g: GameRow): 'host' | 'guest' | null {
  const h = picksOf(g.host_veto).length;
  const a = picksOf(g.guest_veto).length;
  const n = picksEach(g);
  if (h <= a && h < n) return 'host';
  if (a < n) return 'guest';
  return null;
}
/** All categories of the match in play order: random ones, then picks alternating host/guest. */
function matchCategories(g: GameRow): string[] {
  const h = picksOf(g.host_veto);
  const a = picksOf(g.guest_veto);
  const out = [...g.offered];
  for (let i = 0; i < Math.max(h.length, a.length); i++) {
    if (h[i]) out.push(h[i]);
    if (a[i]) out.push(a[i]);
  }
  return out;
}

/** Each player adds one category to the random starting ones: host first, then guest. */
function PickPhase({ g, refresh }: { g: GameRow; refresh: () => Promise<void> }) {
  const me = getProfile();
  const { role } = matchStatus(g, me.id);
  const turn = pickTurn(g);
  const myTurn = turn !== null && turn === role;
  const turnName = turn === 'host' ? g.host_name : g.guest_name;
  const chosen = matchCategories(g);
  const available = CATEGORIES.filter((c) => !chosen.includes(c.id)).map((c) => c.id);
  const totalRounds = roundCount(g);
  const [sending, setSending] = useState(false);
  const [genErr, setGenErr] = useState('');
  /** Category tapped but not confirmed yet (guards against accidental taps). */
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [turn]);

  const pick = async (who: 'host' | 'guest', cat: string) => {
    if (sending) return;
    setSending(true);
    sfx.correct();
    try {
      const prev = who === 'host' ? g.host_veto : g.guest_veto;
      await backend.setPicks(g.id, who, [...picksOf(prev), cat].join(','), prev);
      await refresh();
    } finally {
      setSending(false);
    }
  };

  // My turn: PICK_SECONDS, then a random pick. Their turn: wait a bit longer, then pick for them if they're away.
  const limit = myTurn ? PICK_SECONDS : PICK_SECONDS + AWAY_GRACE;
  const left = useCountdown(
    limit,
    turn !== null && role !== 'none' && !sending,
    () => {
      // Time's up: use the category waiting for confirmation, otherwise a random one
      if (turn) void pick(turn, myTurn && pending ? pending : pickRandom(available));
    },
    `${turn}-${g.host_veto}-${g.guest_veto}`,
  );
  const shown = Math.max(0, Math.ceil(left - (myTurn ? 0 : AWAY_GRACE)));

  // Sound when a pick turn begins
  useEffect(() => {
    if (!turn || role === 'none') return;
    if (myTurn) sfx.yourTurn();
    else sfx.theirTurn();
  }, [turn, myTurn, role]);

  // Soft tick for the last seconds of my own turn
  const lastTick = useRef(0);
  useEffect(() => {
    if (myTurn && shown <= 3 && shown > 0 && lastTick.current !== shown) sfx.tick();
    lastTick.current = shown;
  }, [myTurn, shown]);

  // Both picked: build the rounds. The guest does it right away; the host steps in if that stalls.
  useEffect(() => {
    if (turn !== null || g.rounds || role === 'none') return;
    let cancelled = false;
    const build = async () => {
      try {
        const rounds: RoundSpec[] = [];
        for (let i = 0; i < chosen.length; i++)
          rounds.push(await generateRound(chosen[i], levelForRound(g.settings.difficulty, i, chosen.length)));
        if (cancelled) return;
        await backend.setRounds(g.id, rounds);
        sfx.start();
        await refresh();
      } catch (e) {
        if (!cancelled) setGenErr(String((e as Error).message));
      }
    };
    const t = setTimeout(build, role === 'guest' ? 0 : 6000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, g.rounds, role, genErr === '']);

  const whose = (id: string) =>
    picksOf(g.host_veto).includes(id)
      ? role === 'host'
        ? 'your pick'
        : `${g.host_name}'s pick`
      : picksOf(g.guest_veto).includes(id)
        ? role === 'guest'
          ? 'your pick'
          : `${g.guest_name}'s pick`
        : 'random';

  const groups: { title: string; kind: string }[] = [
    { title: '🗺️ Maps', kind: 'map' },
    { title: '🏛️ Capitals', kind: 'capitals' },
    { title: '❓ Trivia', kind: 'trivia' },
  ];

  return (
    <Shell>
      <div className="card">
        <Players g={g} turn={turn} />
      </div>

      <div className="card">
        <h3>
          The match · {chosen.length}/{totalRounds} rounds
        </h3>
        <div className="cat-list">
          {chosen.map((id) => (
            <CategoryChip key={id} id={id} note={whose(id)} />
          ))}
          {Array.from({ length: totalRounds - chosen.length }, (_, i) => (
            <div key={`slot-${i}`} className="cat-slot">
              {i === 0 && turn ? `${myTurn ? 'Your' : `${turnName}'s`} pick…` : 'Next pick…'}
            </div>
          ))}
        </div>
      </div>

      <div className={`card veto-card ${myTurn ? 'mine' : ''}`}>
        {turn ? (
          <>
            <div className="veto-head">
              <h3>{myTurn ? 'Pick a category!' : `${turnName} is picking…`}</h3>
              <span className={`veto-timer ${shown <= 3 ? 'low' : ''}`}>{shown}s</span>
            </div>
            <div className="veto-bar">
              <div style={{ width: `${(Math.min(shown, PICK_SECONDS) / PICK_SECONDS) * 100}%` }} />
            </div>
            <p className="muted small">
              {myTurn
                ? 'Tap the category you want to add. If time runs out, a random one is added.'
                : shown === 0
                  ? `${turnName} seems away, picking a random one…`
                  : `Wait for ${turnName} to choose.`}
            </p>
            {myTurn &&
              groups.map((grp) => (
                <div key={grp.kind}>
                  <div className="pick-group">{grp.title}</div>
                  <div className="cat-grid pick-grid">
                    {available
                      .filter((id) => catById(id).kind === grp.kind)
                      .map((id) => (
                        <CategoryChip key={id} id={id} onClick={sending ? undefined : () => setPending(id)} />
                      ))}
                  </div>
                </div>
              ))}
          </>
        ) : (
          <div className="center">
            <h3>Preparing questions…</h3>
            {genErr ? (
              <>
                <p className="error">{genErr}</p>
                <button className="btn primary" onClick={() => setGenErr('')}>
                  Try again
                </button>
              </>
            ) : (
              <p className="waiting">
                <span className="pulse" /> Getting the {totalRounds} rounds ready
              </p>
            )}
          </div>
        )}
      </div>
      <p className="muted center small">
        {describeDifficulty(g.settings.difficulty)} · Code: {g.id}
      </p>
      {myTurn && pending && (
        <div className="confirm-backdrop" onClick={() => setPending(null)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <div className="intro-emoji">{catById(pending).emoji}</div>
            <h3>Add {catById(pending).name}?</h3>
            <span className={`veto-timer ${shown <= 3 ? 'low' : ''}`}>{shown}s</span>
            <div className="row-gap">
              <button className="btn ghost" onClick={() => setPending(null)}>
                Back
              </button>
              <button
                className="btn primary"
                data-sfx="off"
                disabled={sending}
                onClick={() => void pick(role as 'host' | 'guest', pending)}
              >
                ✓ Add it
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Scoreboard({ g }: { g: GameRow }) {
  const me = getProfile();
  const st = matchStatus(g, me.id);
  const spectator = st.role === 'none';
  const rounds = g.rounds ?? [];
  const leftName = spectator ? g.host_name : 'You';
  const rightName = spectator ? g.guest_name : st.opponent;
  const mine = spectator ? g.host_results : st.mine;
  const theirs = spectator ? g.guest_results : st.theirs;
  const nextRound = rounds.findIndex((_, i) => !mine[i]);

  const myTotal = total(mine);
  // Only reveal opponent scores for rounds you've already played
  const visibleTheirs = rounds.reduce((s, _, i) => s + (mine[i] || spectator ? theirs[i]?.score ?? 0 : 0), 0);

  // Boat race right after finishing a round
  const [raceRound, setRaceRound] = useState<number | null>(() => {
    try {
      const [code, r] = (sessionStorage.getItem('quizora:race') ?? '').split(':');
      return code === g.id && !spectator ? Number(r) : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem('quizora:race');
    } catch {
      /* ignore */
    }
  }, []);
  const sumExcept = (res: typeof mine, skip: number) =>
    rounds.reduce((s, _, i) => s + (i !== skip && mine[i] ? res[i]?.score ?? 0 : 0), 0);

  return (
    <Shell>
      {raceRound !== null && (
        <BoatRace
          title={`After round ${raceRound + 1} of ${rounds.length}`}
          me={{ name: 'You', before: sumExcept(mine, raceRound), after: myTotal, color: 'var(--teal)' }}
          them={{
            name: rightName ?? 'Opponent',
            before: sumExcept(theirs, raceRound),
            after: visibleTheirs,
            color: 'var(--pink)',
          }}
          note={theirs[raceRound]?.status === 'done' ? undefined : `${rightName} hasn't played round ${raceRound + 1} yet.`}
          onClose={() => setRaceRound(null)}
        />
      )}
      {st.finished && !spectator && (
        <div className={`banner ${st.tone}`}>
          {st.label === 'You won!' ? '🏆 You won!' : st.label === 'Draw' ? '🤝 Draw!' : `😅 ${rightName} won`}
        </div>
      )}
      <div className="versus card">
        <div className="side">
          <div className="vs-name">{leftName}</div>
          <div className="vs-score">{myTotal}</div>
        </div>
        <div className="vs">VS</div>
        <div className="side">
          <div className="vs-name">{rightName}</div>
          <div className="vs-score">{visibleTheirs}</div>
        </div>
      </div>

      <div className="rounds">
        {rounds.map((r, i) => {
          const c = catById(r.category);
          const a = mine[i];
          const b = theirs[i];
          const showB = !!a || spectator;
          return (
            <div key={i} className={`round-row ${i === nextRound ? 'next' : ''}`}>
              <div className="round-cat">
                <span className="cat-emoji">{c.emoji}</span>
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    Round {i + 1} · {LEVEL_NAMES[r.level]} · {r.type === 'map-type' ? 'name it' : r.type === 'map-locate' ? 'find it' : 'quiz'}
                  </small>
                </div>
              </div>
              <div className="round-scores">
                <span className={a && b && a.score > b.score ? 'lead' : ''}>{a ? a.score : '–'}</span>
                <span className={a && b && b.score > a.score ? 'lead' : ''}>
                  {b ? (showB ? b.score : '✓') : '–'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {!spectator && nextRound >= 0 && (
        <button className="btn primary wide big" onClick={() => go(`/m/${g.id}/play/${nextRound}`)}>
          ▶ Play round {nextRound + 1}
        </button>
      )}
      {!spectator && nextRound < 0 && !st.theirDone && (
        <p className="waiting center">
          <span className="pulse" /> You're done! Waiting for {rightName}…
        </p>
      )}
      {st.finished && (
        <button className="btn ghost wide" onClick={() => go('/new')}>
          ⚔️ New duel
        </button>
      )}
      {!spectator && !st.myDone && (
        <button
          className="link center forfeit"
          onClick={async () => {
            if (!confirm('Forfeit this duel? Your remaining rounds count as 0 points.')) return;
            const res = { ...mine };
            rounds.forEach((_, i) => {
              if (!res[i]) res[i] = { status: 'done', score: 0, correct: 0, total: 0, errors: 0, timeUsed: 0, gaveUp: true };
            });
            await backend.saveResults(g.id, st.role as 'host' | 'guest', res);
            go('/');
          }}
        >
          🏳️ Forfeit duel
        </button>
      )}
      {spectator && <p className="muted center">This duel already has two players. You're watching.</p>}
      <p className="muted center small">Code: {g.id}</p>
    </Shell>
  );
}

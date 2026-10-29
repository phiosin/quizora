import { useEffect, useRef, useState } from 'react';
import { backend } from '../lib/backend';
import { catById, describeDifficulty, LEVEL_NAMES, levelForRound } from '../lib/categories';
import { shareLink } from '../lib/codes';
import { generateRound } from '../lib/generate';
import { getProfile, rememberGame } from '../lib/profile';
import { go } from '../lib/router';
import { sfx } from '../lib/sound';
import type { GameRow, RoundSpec } from '../lib/types';
import { useCountdown } from '../lib/useCountdown';
import { Logo, NameCard } from './Home';
import { matchStatus, total } from './matchStatus';
import { CategoryChip } from './NewMatch';

/** Seconds each player gets to veto. */
const VETO_SECONDS = 10;
/** Extra wait before vetoing randomly for an opponent who seems to be away. */
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
  if (!g.rounds) return <VetoPhase g={g} refresh={refresh} />;
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
        <div className="muted">Your duel code</div>
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
          Stay on this screen. When your opponent joins, you take turns vetoing a category, {VETO_SECONDS} seconds
          each. You go first.
        </p>
      </div>
      <div className="card">
        <h3>On offer · {describeDifficulty(g.settings.difficulty)}</h3>
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
        <p className="muted">{describeDifficulty(g.settings.difficulty)} · 3 rounds</p>
      </div>
      <div className="card">
        <h3>On offer</h3>
        <p className="muted small">
          After joining you take turns vetoing one category, {VETO_SECONDS} seconds each. The other 3 get played.
        </p>
        <div className="cat-list">
          {g.offered.map((id) => (
            <CategoryChip key={id} id={id} vetoed={g.host_veto === id} />
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

const pickRandom = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function VetoPhase({ g, refresh }: { g: GameRow; refresh: () => Promise<void> }) {
  const me = getProfile();
  const { role } = matchStatus(g, me.id);
  const turn: 'host' | 'guest' | null = !g.host_veto ? 'host' : !g.guest_veto ? 'guest' : null;
  const myTurn = turn !== null && turn === role;
  const turnName = turn === 'host' ? g.host_name : g.guest_name;
  const open = g.offered.filter((c) => c !== g.host_veto && c !== g.guest_veto);
  const [sending, setSending] = useState(false);
  const [genErr, setGenErr] = useState('');

  const veto = async (who: 'host' | 'guest', cat: string) => {
    if (sending) return;
    setSending(true);
    sfx.veto();
    try {
      await backend.setVeto(g.id, who, cat);
      await refresh();
    } finally {
      setSending(false);
    }
  };

  // My turn: 10 s, then a random veto. Their turn: wait a bit longer, then veto for them if they're away.
  const limit = myTurn ? VETO_SECONDS : VETO_SECONDS + AWAY_GRACE;
  const left = useCountdown(
    limit,
    turn !== null && role !== 'none' && !sending,
    () => {
      if (turn) void veto(turn, pickRandom(open));
    },
    `${turn}-${g.host_veto}-${g.guest_veto}`,
  );
  const shown = Math.max(0, Math.ceil(left - (myTurn ? 0 : AWAY_GRACE)));

  // Soft tick for the last seconds of my own turn
  const lastTick = useRef(0);
  useEffect(() => {
    if (myTurn && shown <= 3 && shown > 0 && lastTick.current !== shown) sfx.tick();
    lastTick.current = shown;
  }, [myTurn, shown]);

  // Both vetoed: build the rounds. The guest does it right away; the host steps in if that stalls.
  useEffect(() => {
    if (turn !== null || g.rounds || role === 'none') return;
    let cancelled = false;
    const build = async () => {
      try {
        const rounds: RoundSpec[] = [];
        for (let i = 0; i < open.length; i++) rounds.push(await generateRound(open[i], levelForRound(g.settings.difficulty, i)));
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

  const note = (id: string) =>
    id === g.host_veto ? `${role === 'host' ? 'your' : `${g.host_name}'s`} veto` : id === g.guest_veto ? `${role === 'guest' ? 'your' : `${g.guest_name}'s`} veto` : undefined;

  return (
    <Shell>
      <div className="card">
        <Players g={g} turn={turn} />
      </div>
      <div className={`card veto-card ${myTurn ? 'mine' : ''}`}>
        {turn ? (
          <>
            <div className="veto-head">
              <h3>{myTurn ? 'Your veto!' : `${turnName} is vetoing…`}</h3>
              <span className={`veto-timer ${shown <= 3 ? 'low' : ''}`}>{shown}s</span>
            </div>
            <div className="veto-bar">
              <div style={{ width: `${(Math.min(shown, VETO_SECONDS) / VETO_SECONDS) * 100}%` }} />
            </div>
            <p className="muted small">
              {myTurn
                ? 'Tap the category you don’t want. If time runs out, a random one is vetoed.'
                : shown === 0
                  ? `${turnName} seems away, vetoing a random one…`
                  : `Wait for ${turnName} to pick.`}
            </p>
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
                <span className="pulse" /> Getting the 3 rounds ready
              </p>
            )}
          </div>
        )}
        <div className="cat-list">
          {g.offered.map((id) => {
            const gone = id === g.host_veto || id === g.guest_veto;
            return (
              <CategoryChip
                key={id}
                id={id}
                vetoed={gone}
                note={note(id)}
                onClick={myTurn && !gone && !sending ? () => void veto(role as 'host' | 'guest', id) : undefined}
              />
            );
          })}
        </div>
      </div>
      <p className="muted center small">
        {describeDifficulty(g.settings.difficulty)} · Code: {g.id}
      </p>
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

  return (
    <Shell>
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
      {spectator && <p className="muted center">This duel already has two players. You're watching.</p>}
      <p className="muted center small">Code: {g.id}</p>
    </Shell>
  );
}

import { useEffect, useState } from 'react';
import { backend } from '../lib/backend';
import { catById, describeDifficulty, LEVEL_NAMES, levelForRound } from '../lib/categories';
import { shareLink } from '../lib/codes';
import { generateRound } from '../lib/generate';
import { getProfile, rememberGame } from '../lib/profile';
import { go } from '../lib/router';
import type { GameRow, RoundSpec } from '../lib/types';
import { Logo, NameCard } from './Home';
import { matchStatus, total } from './matchStatus';
import { CategoryChip } from './NewMatch';

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
  return { g, setG, err };
}

export default function Match({ code }: { code: string }) {
  const { g, setG, err } = useGame(code);
  const me = getProfile();

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
  if (st.role === 'none' && !g.guest_id) return <JoinView g={g} onJoined={setG} />;
  if (st.role === 'host' && !g.guest_id) return <Waiting g={g} />;
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

function Waiting({ g }: { g: GameRow }) {
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
        <p className="waiting">
          <span className="pulse" /> Waiting for your opponent to join and veto…
        </p>
      </div>
      <div className="card">
        <h3>Offer · {describeDifficulty(g.settings.difficulty)}</h3>
        <div className="cat-list">
          {g.offered.map((id) => (
            <CategoryChip key={id} id={id} vetoed={g.host_veto === id} note={g.host_veto === id ? 'your veto' : undefined} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function JoinView({ g, onJoined }: { g: GameRow; onJoined: (g: GameRow) => void }) {
  const [named, setNamed] = useState(!!getProfile().name);
  const [veto, setVeto] = useState<string | null>(null);
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
    if (!veto) return;
    setBusy(true);
    setErr('');
    try {
      const me = getProfile();
      const cats = g.offered.filter((c) => c !== g.host_veto && c !== veto);
      const rounds: RoundSpec[] = [];
      for (let i = 0; i < cats.length; i++) {
        rounds.push(await generateRound(cats[i], levelForRound(g.settings.difficulty, i)));
      }
      const patch = { guest_id: me.id, guest_name: me.name || 'Player', guest_veto: veto, rounds };
      const ok = await backend.joinGame(g.id, patch);
      if (!ok) {
        setErr('Someone else already joined this duel.');
        setBusy(false);
        return;
      }
      rememberGame(g.id);
      onJoined({ ...g, ...patch });
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
        <h3>Veto one category</h3>
        <p className="muted">{g.host_name} already vetoed one. Pick yours; the other 3 get played.</p>
        <div className="cat-list">
          {g.offered.map((id) =>
            id === g.host_veto ? (
              <CategoryChip key={id} id={id} vetoed note={`${g.host_name}'s veto`} />
            ) : (
              <CategoryChip key={id} id={id} vetoed={veto === id} onClick={() => setVeto(veto === id ? null : id)} />
            ),
          )}
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <button className="btn primary wide big" disabled={!veto || busy} onClick={join}>
        {busy ? 'Preparing questions…' : veto ? 'Accept duel' : 'Veto a category first'}
      </button>
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

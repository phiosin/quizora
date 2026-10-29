import { buildTag } from '../lib/update';
import { isMuted, setMuted } from '../lib/sound';
import { useEffect, useRef, useState } from 'react';
import { backend } from '../lib/backend';
import { describeDifficulty, roundsFor } from '../lib/categories';
import { claimName, forgetGame, getProfile, myGames, rememberGame } from '../lib/profile';
import { computeStats, type Stats } from '../lib/stats';
import { cannotJoin, isActiveFor, MAX_ACTIVE } from '../lib/limits';
import { sfx } from '../lib/sound';
import { go } from '../lib/router';
import type { GameRow } from '../lib/types';
import { matchStatus } from './matchStatus';

export function NameCard({ onDone }: { onDone: () => void }) {
  const [name, setN] = useState(getProfile().name);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        const res = await claimName(name).catch(() => 'offline' as const);
        try {
          sessionStorage.setItem('quizora:hello', res);
        } catch {
          /* ignore */
        }
        onDone();
      }}
    >
      <h3>What should we call you?</h3>
      <p className="muted">
        Your opponent sees this name. Used it before on another phone? Type the same name and your profile and stats
        come along.
      </p>
      <input value={name} onChange={(e) => setN(e.target.value)} placeholder="Nickname" maxLength={20} autoFocus />
      <button className="btn primary wide" disabled={!name.trim() || busy}>
        {busy ? 'One moment…' : "Let's go"}
      </button>
    </form>
  );
}

export default function Home() {
  const [profile, setProfile] = useState(getProfile());
  const [editing, setEditing] = useState(!profile.name);
  const [games, setGames] = useState<GameRow[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(hiddenGames()));
  const [hello, setHello] = useState<string | null>(null);
  useEffect(() => {
    if (editing) return;
    try {
      setHello(sessionStorage.getItem('quizora:hello'));
    } catch {
      /* ignore */
    }
  }, [editing]);

  // Phones that already had a name: register it once per visit (links same-name profiles across devices)
  useEffect(() => {
    if (editing || !profile.name) return;
    let done = false;
    try {
      done = sessionStorage.getItem('quizora:claimed') === profile.id;
    } catch {
      /* ignore */
    }
    if (done) return;
    void claimName(profile.name).then(() => {
      const now = getProfile();
      try {
        sessionStorage.setItem('quizora:claimed', now.id);
      } catch {
        /* ignore */
      }
      if (now.id !== profile.id) setProfile(now);
    });
  }, [editing, profile.id, profile.name]);

  useEffect(() => {
    if (editing) return;
    let alive = true;
    // All duels of this profile (any device), plus ones remembered on this device
    (async () => {
      const mine = await backend.gamesOf(profile.id).catch(() => [] as GameRow[]);
      const known = new Set(mine.map((g) => g.id));
      const extra = await Promise.all(
        myGames()
          .map((g) => g.code)
          .filter((c) => !known.has(c))
          .map((c) => backend.getGame(c).catch(() => null)),
      );
      // Only duels this profile actually plays in (a shared phone may remember others)
      const ok = (g: GameRow | null): g is GameRow => !!g && (g.host_id === profile.id || g.guest_id === profile.id);
      if (alive) setGames([...mine, ...extra.filter(ok)]);
    })();
    return () => {
      alive = false;
    };
  }, [profile.id, editing]);

  if (editing) {
    return (
      <div className="screen">
        <Logo />
        <NameCard
          onDone={() => {
            setProfile(getProfile());
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <Logo />
      <div className="hello">
        {hello === 'welcome-back' ? 'Welcome back' : 'Hi'} <strong>{profile.name}</strong>{' '}
        <button className="link" onClick={() => setEditing(true)}>
          change
        </button>
      </div>
      <div className="menu">
        <button className="menu-btn pink" onClick={() => go('/new')}>
          <span className="menu-emoji">⚔️</span>
          <span>
            <strong>Open a game</strong>
            <small>Anyone on the menu can join you</small>
          </span>
        </button>
        <button className="menu-btn purple" onClick={() => go('/practice')}>
          <span className="menu-emoji">🎯</span>
          <span>
            <strong>Practice</strong>
            <small>Play any category solo</small>
          </span>
        </button>
      </div>

      <OpenGames myId={profile.id} />

      {games.some((g) => g.guest_id && !hidden.has(g.id)) && (
        <>
          <h3 className="section-title">
            Your duels{' '}
            <span className="muted small">
              · {games.filter((g) => isActiveFor(g, profile.id)).length}/{MAX_ACTIVE} active
            </span>
          </h3>
          <div className="game-list">
            {games.filter((g) => g.guest_id && !hidden.has(g.id)).map((g) => {
              const st = matchStatus(g, profile.id);
              return (
                <div key={g.id} className="game-row" onClick={() => go(`/m/${g.id}`)}>
                  <div>
                    <strong>vs {st.opponent ?? '…'}</strong>
                    <small className="code">{g.id}</small>
                  </div>
                  <span className={`status ${st.tone}`}>{st.label}</span>
                  <button
                    className="x"
                    aria-label="Remove from list"
                    onClick={(e) => {
                      e.stopPropagation();
                      forgetGame(g.id);
                      hideGame(g.id);
                      setHidden(new Set(hiddenGames()));
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Leaderboard myId={profile.id} />

      <p className="center small">
        <button className="link" onClick={() => go('/join')}>
          Got a code from a friend?
        </button>
      </p>

      {backend.mode === 'local' && (
        <p className="notice">Local mode: no server configured, so duels only work inside this browser.</p>
      )}
      <footer className="foot">
        No ads. No tracking. Just quizzing.
        <br />
        <small>build {buildTag()}</small>
      </footer>
    </div>
  );
}

const HIDE_KEY = 'quizora:hidden-games';
function hiddenGames(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDE_KEY) || '[]');
  } catch {
    return [];
  }
}
function hideGame(id: string) {
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify([...hiddenGames(), id].slice(-200)));
  } catch {
    /* ignore */
  }
}

/** Your record plus everyone's, from finished duels. */
function Leaderboard({ myId }: { myId: string }) {
  const [rows, setRows] = useState<Stats[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [games, players] = await Promise.all([
        backend.allGames().catch(() => [] as GameRow[]),
        backend.listPlayers().catch(() => []),
      ]);
      const stats = computeStats(games);
      // Current names come from profiles; players without finished duels still show up
      for (const p of players) {
        const s = stats.get(p.id);
        if (s) s.name = p.name;
        else stats.set(p.id, { id: p.id, name: p.name, played: 0, wins: 0, losses: 0, draws: 0, points: 0, best: 0 });
      }
      const list = [...stats.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.points - a.points);
      if (alive) setRows(list);
    })();
    return () => {
      alive = false;
    };
  }, [myId]);

  if (!rows || rows.length === 0) return null;
  const me = rows.find((r) => r.id === myId);
  const medal = (i: number, r: Stats) => (r.wins > 0 && i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1));
  return (
    <>
      {me && (
        <div className="card me-card">
          <div className="me-stat">
            <strong>{me.played}</strong>
            <small>played</small>
          </div>
          <div className="me-stat win">
            <strong>{me.wins}</strong>
            <small>won</small>
          </div>
          <div className="me-stat lose">
            <strong>{me.losses}</strong>
            <small>lost</small>
          </div>
          <div className="me-stat">
            <strong>{me.best}</strong>
            <small>best score</small>
          </div>
        </div>
      )}
      <h3 className="section-title">Leaderboard</h3>
      <div className="card board">
        {rows.slice(0, 20).map((r, i) => (
          <div key={r.id} className={'board-row ' + (r.id === myId ? 'me' : '')}>
            <span className="board-rank">{medal(i, r)}</span>
            <span className="board-name">{r.name}</span>
            <span className="board-rec">
              {r.wins}W {r.losses}L{r.draws ? ' ' + r.draws + 'D' : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Live list of games waiting for a second player. */
function OpenGames({ myId }: { myId: string }) {
  const [list, setList] = useState<GameRow[] | null>(null);
  const [joining, setJoining] = useState('');
  const [err, setErr] = useState('');
  const known = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    let first = true;
    const load = async () => {
      const rows = await backend.listOpenGames().catch(() => null);
      if (!alive || !rows) return;
      // Soft ping when someone else's game pops up
      if (!first && rows.some((g) => g.host_id !== myId && !known.current.has(g.id))) sfx.theirTurn();
      rows.forEach((g) => known.current.add(g.id));
      first = false;
      setList(rows);
    };
    void load();
    const off = backend.watchOpenGames(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, [myId]);

  const join = async (g: GameRow) => {
    setJoining(g.id);
    setErr('');
    try {
      const me = getProfile();
      const why = await cannotJoin(me.id);
      if (why) {
        setErr(why);
        setJoining('');
        return;
      }
      const ok = await backend.joinGame(g.id, { guest_id: me.id, guest_name: me.name || 'Player' });
      if (!ok) {
        setErr('Too late, someone else joined that one.');
        setJoining('');
        return;
      }
      rememberGame(g.id);
      go(`/m/${g.id}`);
    } catch (e) {
      setErr(String((e as Error).message));
      setJoining('');
    }
  };

  return (
    <>
      <h3 className="section-title">
        Open games <span className="live-dot" />
      </h3>
      <div className="game-list">
        {list === null && <p className="muted small center">Looking for games…</p>}
        {list?.length === 0 && (
          <p className="muted small center open-empty">No one is waiting right now. Open a game and it appears here for others.</p>
        )}
        {list?.map((g) => {
          const mine = g.host_id === myId;
          return (
            <div key={g.id} className={`game-row open-row ${mine ? 'mine' : ''}`} onClick={() => mine && go(`/m/${g.id}`)}>
              <div>
                <strong>{mine ? 'Your game' : g.host_name}</strong>
                <small>
                  {describeDifficulty(g.settings.difficulty)} · {roundsFor(g.settings.presets ?? 1, g.settings.picks ?? 1)} rounds
                </small>
              </div>
              {mine ? (
                <span className="status wait">Waiting…</span>
              ) : (
                <button className="btn small primary" disabled={!!joining} onClick={() => void join(g)}>
                  {joining === g.id ? 'Joining…' : 'Join'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {err && <p className="error center">{err}</p>}
    </>
  );
}

export function Logo() {
  const [muted, setM] = useState(isMuted);
  return (
    <div className="logo-row">
      <div className="logo" onClick={() => go('/')}>
        <span className="logo-q">🧭</span> Quiz<span>ora</span>
      </div>
      <button
        className="mute"
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        onClick={() => {
          setMuted(!muted);
          setM(!muted);
        }}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}

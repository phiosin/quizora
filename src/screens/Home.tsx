import { buildTag } from '../lib/update';
import { isMuted, setMuted } from '../lib/sound';
import { useEffect, useRef, useState } from 'react';
import { backend } from '../lib/backend';
import { describeDifficulty } from '../lib/categories';
import { forgetGame, getProfile, myGames, rememberGame, setName } from '../lib/profile';
import { sfx } from '../lib/sound';
import { go } from '../lib/router';
import type { GameRow } from '../lib/types';
import { matchStatus } from './matchStatus';

export function NameCard({ onDone }: { onDone: () => void }) {
  const [name, setN] = useState(getProfile().name);
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setName(name);
        onDone();
      }}
    >
      <h3>What should we call you?</h3>
      <p className="muted">Your opponent sees this name.</p>
      <input value={name} onChange={(e) => setN(e.target.value)} placeholder="Nickname" maxLength={20} autoFocus />
      <button className="btn primary wide" disabled={!name.trim()}>
        Let's go
      </button>
    </form>
  );
}

export default function Home() {
  const [profile, setProfile] = useState(getProfile());
  const [editing, setEditing] = useState(!profile.name);
  const [games, setGames] = useState<GameRow[]>([]);

  useEffect(() => {
    const codes = myGames().map((g) => g.code);
    Promise.all(codes.map((c) => backend.getGame(c).catch(() => null))).then((rows) =>
      setGames(rows.filter((g): g is GameRow => !!g)),
    );
  }, []);

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
        Hi <strong>{profile.name}</strong>{' '}
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

      {games.some((g) => g.guest_id) && (
        <>
          <h3 className="section-title">Your duels</h3>
          <div className="game-list">
            {games.filter((g) => g.guest_id).map((g) => {
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
                      setGames(games.filter((x) => x.id !== g.id));
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
                  {describeDifficulty(g.settings.difficulty)} · {(g.settings.presets ?? 1) + 2} rounds
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

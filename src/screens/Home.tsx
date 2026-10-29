import { isMuted, setMuted } from '../lib/sound';
import { useEffect, useState } from 'react';
import { backend } from '../lib/backend';
import { forgetGame, getProfile, myGames, setName } from '../lib/profile';
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
            <strong>New duel</strong>
            <small>Challenge a friend with a code</small>
          </span>
        </button>
        <button className="menu-btn teal" onClick={() => go('/join')}>
          <span className="menu-emoji">🔑</span>
          <span>
            <strong>Join duel</strong>
            <small>Got a code or link? Enter it here</small>
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

      {games.length > 0 && (
        <>
          <h3 className="section-title">Your duels</h3>
          <div className="game-list">
            {games.map((g) => {
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

      {backend.mode === 'local' && (
        <p className="notice">Local mode: no server configured, so duels only work inside this browser.</p>
      )}
      <footer className="foot">No ads. No tracking. Just quizzing.</footer>
    </div>
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

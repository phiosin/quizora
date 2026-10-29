import { useState } from 'react';
import { parseCode } from '../lib/codes';
import { go } from '../lib/router';
import { Logo } from './Home';

export default function Join() {
  const [code, setCode] = useState('');
  const parsed = parseCode(code);
  return (
    <div className="screen">
      <Logo />
      <button className="back" onClick={() => go('/')}>
        ← Back
      </button>
      <h2>Join a duel</h2>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed) go(`/m/${parsed}`);
        }}
      >
        <p className="muted">Enter the code your friend sent you (e.g. brave-otter-37), or paste the link.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="brave-otter-37"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="btn primary wide" disabled={!parsed}>
          Join
        </button>
      </form>
    </div>
  );
}

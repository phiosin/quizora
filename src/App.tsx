import { useRoute } from './lib/router';
import Home from './screens/Home';
import Join from './screens/Join';
import Match from './screens/Match';
import NewMatch from './screens/NewMatch';
import Play from './screens/Play';
import Practice from './screens/Practice';

export default function App() {
  const [a, b, c, d] = useRoute();
  if (a === 'new') return <NewMatch />;
  if (a === 'join') return <Join />;
  if (a === 'practice') return <Practice />;
  if (a === 'm' && b && c === 'play') return <Play key={`${b}-${d}`} code={b} round={Number(d)} />;
  if (a === 'm' && b) return <Match key={b} code={b} />;
  return <Home />;
}

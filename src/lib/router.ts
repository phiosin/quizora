import { useEffect, useState } from 'react';

const current = () => location.hash.replace(/^#/, '') || '/';

export function useRoute(): string[] {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const on = () => {
      setPath(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path.split('/').filter(Boolean);
}

export const go = (path: string) => {
  location.hash = path;
};

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installClickSounds } from './lib/sound';
import './styles.css';

installClickSounds();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

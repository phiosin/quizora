import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installClickSounds } from './lib/sound';
import { installUpdateChecks } from './lib/update';
import './styles.css';

installClickSounds();
installUpdateChecks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

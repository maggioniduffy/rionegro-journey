import { startGame } from './game';

// Debug hook: ?s=1800 starts the raft at route distance 1800 m; window.__rio exposes read-only state.
const startS = Number(new URLSearchParams(location.search).get('s')) || 0;

startGame(startS)
  .then((state) => {
    (window as unknown as { __rio: typeof state }).__rio = state;
  })
  .catch((e) => {
    console.error(e);
    document.body.textContent = `No se pudo cargar el mundo / Could not load the world: ${String(e)}`;
  });

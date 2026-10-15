import { Game } from './core/Game.js';
import { MISSIONS } from './game/missions.js';

const game = new Game();
// handy for debugging from the console / automated tests
window.__game = game;
window.__missions = MISSIONS;
game.init().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading-text');
  if (el) el.textContent = 'Something went wrong while starting the game: ' + (err && err.message ? err.message : err);
});

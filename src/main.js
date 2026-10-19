import './styles/main.css';
import { Game } from './Game.js';

const container = document.getElementById('game-container');

try {
  const game = new Game(container);
  game.init();
  if (import.meta.env.DEV) window.__game = game; // handy in the devtools console
} catch (err) {
  console.error(err);
  container.innerHTML = '<p style="padding:24px;font-family:sans-serif">Could not start the game. WebGL may be unavailable in this browser.</p>';
}

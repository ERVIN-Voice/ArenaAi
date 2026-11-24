import { Network } from './network.js';
import { UI } from './ui.js';
import { GameClient } from './game.js';

const ui = new UI();
const net = new Network();
const game = new GameClient(net, ui);

const savedName = localStorage.getItem('arena-shooter-name') || '';
if (savedName) ui.setPlayerName(savedName);

ui.onPlay(async () => {
  const name = ui.getPlayerName();
  localStorage.setItem('arena-shooter-name', name);
  ui.playBtn.disabled = true;
  ui.playBtn.textContent = 'Подключение...';
  // Request pointer lock in the user gesture
  document.getElementById('game').requestPointerLock?.();
  try {
    const welcome = await net.connect(name);
    game.start(welcome.id);
  } catch (err) {
    console.error(err);
    alert('Не удалось подключиться к серверу. Убедитесь, что сервер запущен.');
    ui.showMenu();
  } finally {
    ui.playBtn.disabled = false;
    ui.playBtn.textContent = 'Играть';
  }
});

// Allow clicking menu button also by Enter
document.getElementById('playerName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ui.playBtn.click();
});

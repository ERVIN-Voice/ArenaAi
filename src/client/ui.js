export class UI {
  constructor() {
    this.root = document.getElementById('ui');
    this.hud = document.getElementById('hud');
    this.menu = document.getElementById('menu');
    this.nameInput = document.getElementById('playerName');
    this.playBtn = document.getElementById('playBtn');
    this.hpFill = document.getElementById('hpFill');
    this.hpText = document.getElementById('hpText');
    this.ammoText = document.getElementById('ammoText');
    this.scoreText = document.getElementById('scoreText');
    this.killFeed = document.getElementById('killFeed');
    this.scoreboard = document.getElementById('scoreboard');
    this.scoreboardBody = document.getElementById('scoreboardBody');
    this.crosshair = document.getElementById('crosshair');
    this.deathOverlay = document.getElementById('deathOverlay');
    this.pingText = document.getElementById('pingText');
    this.playersCount = document.getElementById('playersCount');
    this.damageVignette = document.getElementById('damageVignette');
    this.reloadBar = document.getElementById('reloadBar');
    this.reloadFill = document.getElementById('reloadFill');
  }

  showMenu() {
    this.menu.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.crosshair.classList.add('hidden');
    document.exitPointerLock?.();
  }

  showHud() {
    this.menu.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.crosshair.classList.remove('hidden');
  }

  setPlayerName(name) { this.nameInput.value = name; }
  getPlayerName() { return this.nameInput.value.trim().slice(0, 16) || 'Player'; }

  onPlay(fn) { this.playBtn.addEventListener('click', fn); }

  updateHud(player, ping, playerCount) {
    const hp = Math.max(0, player?.hp ?? 0);
    const maxHp = player?.maxHp ?? 100;
    const pct = (hp / maxHp) * 100;
    this.hpFill.style.width = pct + '%';
    this.hpFill.style.background = pct > 50 ? 'linear-gradient(90deg,#3ecf8e,#63e6be)' : pct > 25 ? 'linear-gradient(90deg,#f59f00,#ffd43b)' : 'linear-gradient(90deg,#fa5252,#ff8787)';
    this.hpText.textContent = `${Math.ceil(hp)} HP`;
    const ammo = player?.ammo ?? 0;
    const reloading = player?.reloading;
    this.ammoText.textContent = reloading ? 'ПЕРЕЗАРЯДКА...' : `${ammo} / 30`;
    this.ammoText.classList.toggle('low', ammo <= 5 && !reloading);
    this.scoreText.textContent = `Счёт: ${player?.score ?? 0}  |  Убийств: ${player?.kills ?? 0}  |  Смертей: ${player?.deaths ?? 0}`;
    this.pingText.textContent = `${ping} ms`;
    this.playersCount.textContent = `${playerCount} игроков`;
    this.reloadBar.classList.toggle('hidden', !reloading);
  }

  showReload(active) {
    this.reloadBar.classList.toggle('hidden', !active);
  }

  showDeath(show, killerName) {
    this.deathOverlay.classList.toggle('hidden', !show);
    if (show) {
      this.deathOverlay.querySelector('.death-msg').textContent = killerName ? `Вас убил ${killerName}` : 'Вы погибли';
    }
  }

  flashDamage() {
    this.damageVignette.classList.remove('active');
    // force reflow
    void this.damageVignette.offsetWidth;
    this.damageVignette.classList.add('active');
  }

  addKillFeed(text) {
    const el = document.createElement('div');
    el.className = 'kill-item';
    el.textContent = text;
    this.killFeed.prepend(el);
    while (this.killFeed.children.length > 6) this.killFeed.lastChild.remove();
    setTimeout(() => el.remove(), 5000);
  }

  updateScoreboard(entities, myId) {
    const rows = [...entities].sort((a, b) => b.score - a.score || b.kills - a.kills);
    this.scoreboardBody.innerHTML = rows.map(e => {
      const me = e.id === myId ? ' class="me"' : '';
      const status = e.dead ? '☠' : '●';
      return `<tr${me}><td>${status}</td><td style="color:#${e.color.toString(16).padStart(6,'0')}">${escapeHtml(e.name)}</td><td>${e.score}</td><td>${e.kills}</td><td>${e.deaths}</td></tr>`;
    }).join('');
  }

  toggleScoreboard(show) {
    this.scoreboard.classList.toggle('hidden', !show);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── MENU ──
function toggleMenu() {
  document.getElementById('menu-dropdown').classList.toggle('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#menu-btn') && !e.target.closest('#menu-dropdown')) {
    document.getElementById('menu-dropdown').classList.remove('open');
  }
});

function openAbout() {
  document.getElementById('menu-dropdown').classList.remove('open');
  document.getElementById('about-modal').classList.add('open');
}

function closeAbout(e) {
  if (!e || e.target === document.getElementById('about-modal') || e.target === document.getElementById('about-close')) {
    document.getElementById('about-modal').classList.remove('open');
  }
}

// ── CANVAS ──
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const cam = { x: 0, y: 0 };
const ARENA_R = 2200;
let score = 0, totalPoints = 0, life = 5, gameActive = true;
let adUsed = false;
let mouseX = 0, mouseY = 0;
let cannonAngle = 0;
let invincible = 0, hitFlash = 0;

// ── DIFFICULTY ──
let elapsedSec = 0, lastWave = 1;

function getWave()              { return Math.floor(elapsedSec / 30) + 1; }
function getMaxEnemies()        { return Math.min(2 + Math.floor(elapsedSec / 20), 20); }
function getSpawnInterval()     { return Math.max(600, 3000 - elapsedSec * 15); }
function getEnemyHP()           { return Math.max(1, Math.floor(1 + elapsedSec / 40)); }
function getEnemySpeed()        { return 0.07 + elapsedSec * 0.0006; }
function getEnemyBulletSpeed()  { return 3.04 + elapsedSec * 0.015; }
function getEnemyShootInterval(){ return Math.max(400, 1600 - elapsedSec * 3); }

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

const upg = { size: 1, speed: 1, rate: 1, move: 1, dmg: 1, pierce: 1 };


function getBR() { return 5 + (upg.size - 1) * 3; }
function getBS() { return 7 + (upg.speed - 1) * 2; }
function getFI() { return Math.max(150, 1000 - (upg.rate - 1) * 150); }
function getBD() { return upg.dmg; }

const bullets = [], eBullets = [], enemies = [], particles = [], pickups = [], floatTexts = [], shockwaves = [];
let shotTimer = 0, enemyTimer = 0, scoreTimer = 0, pickupTimer = 0;
let playerMoveX = 0, playerMoveY = 0;

function fireBullet() {
  const a = cannonAngle, s = getBS(), r = getBR();
  const pierceRate = (1 + (upg.pierce - 1) * 2) / 100;
  if (Math.random() < pierceRate) {
    bullets.push({ x: cam.x, y: cam.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: r * 1.5, life: 800, pierce: true, hit: new Set() });
  } else {
    bullets.push({ x: cam.x, y: cam.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, life: 200 });
  }
}

function spawnEnemy() {
  if (enemies.length >= getMaxEnemies()) return;
  const moveLen = Math.sqrt(playerMoveX * playerMoveX + playerMoveY * playerMoveY);
  const a = moveLen > 0.3
    ? Math.atan2(playerMoveY, playerMoveX) + (Math.random() - 0.5) * Math.PI
    : Math.random() * Math.PI * 2;
  const d = 420 + Math.random() * 220;
  const hue = 180 + Math.random() * 80;
  const hp = getEnemyHP();
  enemies.push({
    x: cam.x + Math.cos(a) * d,
    y: cam.y + Math.sin(a) * d,
    vx: 0, vy: 0, r: 22,
    hp, maxHp: hp,
    shootTimer: 0,
    spawnDelay: 1000,
    aliveTime: 0,
    awakened: false,
    speedMul: 0.9 + Math.random() * 0.2,
    shootInterval: getEnemyShootInterval(),
    canonAngle: 0,
    bob: Math.random() * Math.PI * 2,
    color: `hsl(${hue},80%,50%)`,
    hue
  });
}

function enemyFire(e) {
  const dx = cam.x - e.x, dy = cam.y - e.y;
  const a = Math.atan2(dy, dx);
  const spd = getEnemyBulletSpeed() * (e.awakened ? 1.2 : 1);
  const br = e.awakened ? 10.5 : 7;
  eBullets.push({
    x: e.x + Math.cos(a) * (e.r + 8),
    y: e.y + Math.sin(a) * (e.r + 8),
    vx: Math.cos(a) * spd,
    vy: Math.sin(a) * spd,
    r: br, life: 240, awakened: e.awakened
  });
  e.canonAngle = a;
}

// ── PICKUPS ──
const PICKUP_DEFS = [
  { type: 'move',  color: '#ff3344', label: 'MOV', name: 'Move Speed' },
  { type: 'size',  color: '#3399ff', label: 'SIZ', name: 'Blt.Size'   },
  { type: 'speed', color: '#ff8800', label: 'VEL', name: 'Blt.Speed'  },
  { type: 'rate',  color: '#aa44ff', label: 'RTE', name: 'Fire Rate'  },
  { type: 'dmg',   color: '#aaaaaa', label: 'PWR', name: 'Blt.Power'  },
  { type: 'heart', color: '#ff44aa', label: '♥',   name: 'Heart'      },
  { type: 'pts',   color: '#22cc44', label: 'PTS', name: 'Points'     },
  { type: 'pierce', color: '#111111', label: 'PRC', name: 'Pierce'    },
  { type: 'bomb',   color: '#ffdd00', label: 'BOM', name: 'Bomb'      },
];
const UPG_MAX = { size: 8 }; // per-type overrides; default is 10
const PICKUP_R = 12;
const PICKUP_INTERVAL = 15000;
const MAX_PICKUPS = 7;

function spawnFloat(wx, wy, text, color) {
  floatTexts.push({ x: wx, y: wy, text, color, life: 1.0 });
}

function spawnPickup() {
  if (pickups.length >= MAX_PICKUPS) return;
  const a = Math.random() * Math.PI * 2;
  const d = 100 + Math.random() * 280;
  let px = cam.x + Math.cos(a) * d;
  let py = cam.y + Math.sin(a) * d;
  const pdist = Math.sqrt(px * px + py * py);
  if (pdist > ARENA_R - 80) { px *= (ARENA_R - 80) / pdist; py *= (ARENA_R - 80) / pdist; }
  const def = PICKUP_DEFS[Math.floor(Math.random() * PICKUP_DEFS.length)];
  pickups.push({ x: px, y: py, r: PICKUP_R, bob: Math.random() * Math.PI * 2, morphTimer: 0, flash: 0, ...def });
}

function drawPickup(p) {
  const { sx, sy } = wToS(p.x, p.y + Math.sin(p.bob) * 5);
  ctx.save();
  // outer pulse ring
  const pulse = (Math.sin(p.bob * 2) * 0.5 + 0.5);
  ctx.beginPath(); ctx.arc(sx, sy, p.r * (1.6 + pulse * 0.5), 0, Math.PI * 2);
  ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.35 + pulse * 0.25;
  ctx.stroke();
  // glow fill
  ctx.globalAlpha = 0.92;
  ctx.shadowColor = p.color; ctx.shadowBlur = 14;
  const g = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 1, sx, sy, p.r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, p.color);
  g.addColorStop(1, p.color + '99');
  ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  // label
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(p.label, sx, sy);
  // morph flash burst
  if (p.flash > 0) {
    ctx.globalAlpha = p.flash * 0.8;
    ctx.beginPath(); ctx.arc(sx, sy, p.r * (1.5 + (1 - p.flash) * 2), 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

function explode(wx, wy, col, n = 20) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 5;
    particles.push({
      x: wx, y: wy,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: 2 + Math.random() * 3,
      life: 40 + Math.random() * 30,
      col
    });
  }
}

function feed(txt) {
  const kf = document.getElementById('kill-feed');
  const el = document.createElement('div');
  el.className = 'kf';
  el.textContent = txt;
  kf.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 1500);
  }, 2200);
}

// ── DRAW HELPERS ──
function wToS(wx, wy) {
  return { sx: wx - cam.x + W / 2, sy: wy - cam.y + H / 2 };
}

function drawGrid() {
  const gs = 80;
  const ox = ((-(cam.x % gs)) + gs) % gs;
  const oy = ((-(cam.y % gs)) + gs) % gs;
  ctx.save();
  ctx.strokeStyle = 'rgba(180,190,220,0.38)';
  ctx.lineWidth = 1;
  for (let x = ox - gs; x < W + gs; x += gs) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = oy - gs; y < H + gs; y += gs) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(148,160,200,0.55)';
  for (let x = ox - gs; x < W + gs; x += gs) {
    for (let y = oy - gs; y < H + gs; y += gs) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Arena boundary
  const { sx: bx, sy: by } = wToS(0, 0);
  ctx.beginPath(); ctx.arc(bx, by, ARENA_R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220,80,30,0.7)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(255,100,30,0.5)';
  ctx.shadowBlur = 10;
  ctx.setLineDash([14, 12]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function hslToRgba(hsl, alpha) {
  const m = hsl.match(/hsl\(([^,]+),([^,]+)%,([^)]+)%\)/);
  if (!m) return `rgba(100,180,255,${alpha})`;
  let h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hu2 = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 0.5)   return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hu2(p, q, h + 1 / 3);
    g = hu2(p, q, h);
    b = hu2(p, q, h - 1 / 3);
  }
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
}

function brightHsl(hsl) {
  return hsl.replace(/,(\d+)%\)$/, (m, v) => `,${Math.min(90, parseInt(v) + 22)}%)`);
}

function drawChar(sx, sy, angle, isPlayer, color, r) {
  ctx.save();
  ctx.translate(sx, sy);

  const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8);
  g.addColorStop(0, hslToRgba(color, 0.28));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();

  const bg = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 1, 0, 0, r);
  bg.addColorStop(0, brightHsl(color));
  bg.addColorStop(1, color);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = bg; ctx.fill();

  ctx.strokeStyle = isPlayer ? 'rgba(255,100,30,0.5)' : 'rgba(80,160,220,0.5)';
  ctx.lineWidth = 2; ctx.stroke();

  ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = isPlayer ? 'rgba(255,100,30,0.22)' : 'rgba(80,160,220,0.22)';
  ctx.lineWidth = 1.5; ctx.stroke();

  ctx.rotate(angle);
  ctx.shadowColor = isPlayer ? '#ff6b1a' : '#44aaff';
  ctx.shadowBlur = 10;
  ctx.fillStyle = isPlayer ? '#ff8c42' : '#44bbff';
  ctx.beginPath(); ctx.roundRect(r * 0.38, -5, r * 0.95, 10, 3); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = isPlayer ? '#cc4000' : '#1177aa'; ctx.fill();

  ctx.restore();
}

function drawBullet(sx, sy, r, c1, c2) {
  ctx.save();
  ctx.shadowColor = c1;
  ctx.shadowBlur = r * 2.5;
  const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 1, sx, sy, r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
}

function drawVignette() {
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  v.addColorStop(0, 'rgba(245,246,250,0)');
  v.addColorStop(1, 'rgba(200,210,230,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawCrosshair() {
  ctx.save();
  // outer arms
  ctx.strokeStyle = 'rgba(255,107,26,0.85)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(mouseX - 16, mouseY); ctx.lineTo(mouseX + 16, mouseY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mouseX, mouseY - 16); ctx.lineTo(mouseX, mouseY + 16); ctx.stroke();
  ctx.setLineDash([]);
  // outer ring
  ctx.beginPath(); ctx.arc(mouseX, mouseY, 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,107,26,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // center dot
  ctx.beginPath(); ctx.arc(mouseX, mouseY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff6b1a';
  ctx.shadowColor = '#ff6b1a';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.restore();
}

// ── FPS ──
let fps = 0, fpsFrames = 0, fpsLast = performance.now();

function tickFPS(now) {
  fpsFrames++;
  if (now - fpsLast >= 500) {
    fps = Math.round(fpsFrames / ((now - fpsLast) / 1000));
    fpsFrames = 0;
    fpsLast = now;
    document.getElementById('fps-box').textContent = 'FPS: ' + fps;
  }
}

const UPG_STATS = [
  { key: 'move',  color: '#ff3344', label: 'MOV' },
  { key: 'size',  color: '#3399ff', label: 'SIZ' },
  { key: 'speed', color: '#ff8800', label: 'VEL' },
  { key: 'rate',  color: '#aa44ff', label: 'RTE' },
  { key: 'dmg',    color: '#aaaaaa', label: 'PWR' },
  { key: 'pierce', color: '#111111', label: 'PRC' },
];

function updateUI() {
  document.getElementById('score-val').textContent = totalPoints.toLocaleString() + ' pts';
  document.getElementById('upg-status').innerHTML = UPG_STATS.map(d =>
    `<div class="upg-stat">
      <span class="upg-stat-label" style="color:${d.color}">${d.label}</span>
      <span class="upg-stat-val"   style="color:${d.color}">+${upg[d.key] - 1}</span>
    </div>`
  ).join('');
  const w = getWave();
  document.getElementById('wave-val').textContent = w;
  for (let i = 0; i < 5; i++) {
    document.getElementById('h' + i).classList.toggle('dead', i >= life);
  }
  if (w > lastWave) {
    lastWave = w;
    feed('⚠ WAVE ' + w + ' — Difficulty increased!');
  }
}

let adCountdownInterval = null;

function triggerGameOver() {
  gameActive = false;
  bullets.length = 0; eBullets.length = 0; enemies.length = 0; particles.length = 0;
  document.getElementById('final-score').textContent = totalPoints.toLocaleString();
  document.getElementById('final-wave').textContent = getWave();
  document.getElementById('lb-form').style.display = '';
  document.getElementById('lb-status').textContent = '';
  document.getElementById('lb-submit-btn').disabled = false;
  document.getElementById('lb-name').value = localStorage.getItem('cannonPlayerName') || '';
  const continueBtn = document.getElementById('continue-ad-btn');
  continueBtn.style.display = adUsed ? 'none' : '';
  continueBtn.disabled = false;
  document.getElementById('msg-overlay').classList.add('show');
  document.getElementById('msg-overlay').scrollTop = 0;
  fetchLeaderboard();
}

function showAdOverlay() {
  document.getElementById('continue-ad-btn').disabled = true;
  document.getElementById('ad-overlay').classList.add('show');

  // Recreate <ins> element so AdSense reloads the ad each time
  const container = document.getElementById('ad-container');
  container.innerHTML = '<div id="ad-fallback">Ad loading...</div>';
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.cssText = 'display:block;width:100%;min-height:400px;';
  ins.dataset.adClient = 'ca-pub-2904828185240062';
  ins.dataset.adSlot = 'XXXXXXXXXX';
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  container.insertBefore(ins, container.firstChild);
  try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}

  // 5-second countdown
  let t = 5;
  const timerEl = document.getElementById('ad-timer');
  const btn = document.getElementById('ad-continue-btn');
  const countdownText = document.getElementById('ad-countdown-text');
  btn.disabled = true;
  timerEl.textContent = t;
  countdownText.style.display = '';

  if (adCountdownInterval) clearInterval(adCountdownInterval);
  adCountdownInterval = setInterval(() => {
    t--;
    timerEl.textContent = t;
    if (t <= 0) {
      clearInterval(adCountdownInterval);
      adCountdownInterval = null;
      btn.disabled = false;
      countdownText.style.display = 'none';
    }
  }, 1000);
}

function continueFromAd() {
  if (adCountdownInterval) { clearInterval(adCountdownInterval); adCountdownInterval = null; }
  adUsed = true;

  // Halve all upgrade levels (min 1)
  for (const k of Object.keys(upg)) {
    upg[k] = Math.max(1, Math.ceil(upg[k] / 2));
  }

  // Halve elapsed time → halves wave
  elapsedSec = Math.floor(elapsedSec / 2);
  lastWave = getWave();

  // Halve score
  score = Math.floor(score / 2);
  totalPoints = Math.floor(totalPoints / 2);

  // Restore 3 hearts on continue
  life = 3;

  // Clear active objects
  bullets.length = 0; eBullets.length = 0; enemies.length = 0; particles.length = 0;
  pickups.length = 0; floatTexts.length = 0; shockwaves.length = 0;
  shotTimer = 0; enemyTimer = 0; scoreTimer = 0; invincible = 0; hitFlash = 0;
  playerMoveX = 0; playerMoveY = 0;

  gameActive = true;
  document.getElementById('ad-overlay').classList.remove('show');
  document.getElementById('msg-overlay').classList.remove('show');
}

function submitLeaderboard() {
  const name = document.getElementById('lb-name').value.trim();
  if (!name) { document.getElementById('lb-status').textContent = 'Enter your name first!'; return; }
  const btn = document.getElementById('lb-submit-btn');
  btn.disabled = true;
  document.getElementById('lb-status').textContent = 'Submitting...';
  fetch('leaderboard/api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score: totalPoints, wave: getWave() })
  })
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        localStorage.setItem('cannonPlayerName', name);
        document.getElementById('lb-status').textContent = 'Score submitted! You ranked #' + d.rank;
        document.getElementById('lb-form').style.display = 'none';
        renderLeaderboard(d.scores, d.rank - 1);
      } else {
        document.getElementById('lb-status').textContent = 'Error: ' + (d.error || 'unknown');
        btn.disabled = false;
      }
    })
    .catch(() => {
      document.getElementById('lb-status').textContent = 'Could not reach server.';
      btn.disabled = false;
    });
}


function fetchLeaderboard() {
  document.getElementById('lb-board').innerHTML = '<div class="lb-loading">Loading...</div>';
  fetch('leaderboard/api.php')
    .then(r => r.json())
    .then(d => { if (d.ok) renderLeaderboard(d.scores, -1); })
    .catch(() => { document.getElementById('lb-board').innerHTML = '<div class="lb-empty">Could not load scores.</div>'; });
}

function renderLeaderboard(scores, highlightIdx) {
  const el = document.getElementById('lb-board');
  if (!scores || !scores.length) {
    el.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>';
    return;
  }
  el.innerHTML = scores.map((s, i) => {
    const cls = i === 0 ? 'lb-gold' : i === 1 ? 'lb-silver' : i === 2 ? 'lb-bronze' : '';
    const hl  = i === highlightIdx ? ' lb-highlighted' : '';
    return `<div class="lb-row ${cls}${hl}">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-name">${escHtml(s.name)}</span>
      <span class="lb-score">${Number(s.score).toLocaleString()}</span>
      <span class="lb-wave">W${s.wave}</span>
    </div>`;
  }).join('');
  if (highlightIdx >= 0) {
    const rows = el.querySelectorAll('.lb-row');
    if (rows[highlightIdx]) rows[highlightIdx].scrollIntoView({ block: 'nearest' });
  }
}

function escHtml(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function restartGame() {
  score = 0; totalPoints = 0; life = 5; gameActive = true;
  adUsed = false;
  cam.x = 0; cam.y = 0;
  bullets.length = 0; eBullets.length = 0; enemies.length = 0; particles.length = 0;
  upg.size = 1; upg.speed = 1; upg.rate = 1; upg.move = 1; upg.dmg = 1; upg.pierce = 1;
  pickups.length = 0; pickupTimer = 0; floatTexts.length = 0; shockwaves.length = 0;
  shotTimer = 0; enemyTimer = 0; scoreTimer = 0; invincible = 0; hitFlash = 0;
  playerMoveX = 0; playerMoveY = 0;
  elapsedSec = 0; lastWave = 1;
  if (adCountdownInterval) { clearInterval(adCountdownInterval); adCountdownInterval = null; }
  document.getElementById('ad-overlay').classList.remove('show');
  document.getElementById('msg-overlay').classList.remove('show');
}

// ── MAIN LOOP ──
let last = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(now - last, 50);
  last = now;
  const dtf = dt / 16.667; // normalized delta: 1.0 at 60fps
  tickFPS(now);

  ctx.fillStyle = '#f5f6fa';
  ctx.fillRect(0, 0, W, H);
  drawGrid();

  if (gameActive) {
    elapsedSec += dt / 1000;

    // Auto score: +wave pts per second
    scoreTimer += dt;
    if (scoreTimer >= 1000) { scoreTimer -= 1000; const passive = getWave(); score += passive; totalPoints += passive; }

    // Player movement
    const spd = 3.2 + (upg.move - 1) * 0.8;
    let mx = 0, my = 0;
    if (keys['ArrowLeft']  || keys['KeyA']) mx -= spd;
    if (keys['ArrowRight'] || keys['KeyD']) mx += spd;
    if (keys['ArrowUp']    || keys['KeyW']) my -= spd;
    if (keys['ArrowDown']  || keys['KeyS']) my += spd;
    if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    playerMoveX = playerMoveX * 0.9 + mx * 0.1;
    playerMoveY = playerMoveY * 0.9 + my * 0.1;
    cam.x += mx * dtf; cam.y += my * dtf;
    const distFromCenter = Math.sqrt(cam.x * cam.x + cam.y * cam.y);
    if (distFromCenter > ARENA_R) {
      const scale = ARENA_R / distFromCenter;
      cam.x *= scale; cam.y *= scale;
    }

    cannonAngle = Math.atan2(mouseY - H / 2, mouseX - W / 2);

    // Shooting
    shotTimer += dt;
    if (shotTimer >= getFI()) { shotTimer = 0; fireBullet(); }

    // Enemy spawning
    enemyTimer += dt;
    if (enemyTimer >= getSpawnInterval()) { enemyTimer = 0; spawnEnemy(); }

    // Enemy AI
    const espd = getEnemySpeed();
    enemies.forEach(e => {
      e.aliveTime += dt;
      if (!e.awakened && e.aliveTime >= 60000) { e.awakened = true; spawnFloat(e.x, e.y, 'AWAKENED!', '#ff3300'); }
      const spdMul = (e.awakened ? 1.7 : 1) * e.speedMul;
      const dx = cam.x - e.x, dy = cam.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > 85) { e.vx += (dx / d) * espd * spdMul * dtf; e.vy += (dy / d) * espd * spdMul * dtf; }
      e.vx *= Math.pow(0.92, dtf); e.vy *= Math.pow(0.92, dtf);
      e.x += e.vx * dtf; e.y += e.vy * dtf;
      e.bob += 0.03 * dtf;
      e.canonAngle = Math.atan2(cam.y - e.y, cam.x - e.x);
      if (e.spawnDelay > 0) { e.spawnDelay -= dt; }
      else { e.shootTimer += dt; if (e.shootTimer >= e.shootInterval) { e.shootTimer = 0; enemyFire(e); } }
    });

    // Player bullet collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dtf; b.y += b.vy * dtf; b.life -= dtf;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (b.pierce && b.hit.has(e)) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (b.r + e.r) ** 2) {
          if (b.pierce) b.hit.add(e);
          e.hp -= getBD();
          if (e.hp <= 0) {
            const bonus = 100 * getWave();
            explode(e.x, e.y, e.color, 35);
            score += bonus; totalPoints += bonus;
            feed('+' + bonus + ' ENEMY DESTROYED');
            enemies.splice(j, 1);
          } else {
            explode(e.x, e.y, e.color, 8);
            score += 20; totalPoints += 20;
          }
          if (!b.pierce) { bullets.splice(i, 1); hit = true; break; }
        }
      }
      if (hit) continue;
    }

    // Enemy bullet collisions
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      b.x += b.vx * dtf; b.y += b.vy * dtf; b.life -= dtf;
      if (b.life <= 0) { eBullets.splice(i, 1); continue; }
      if (invincible <= 0) {
        const dx = b.x - cam.x, dy = b.y - cam.y;
        if (dx * dx + dy * dy < (b.r + 24) ** 2) {
          eBullets.splice(i, 1);
          life--; hitFlash = 1.3; invincible = 80;
          explode(cam.x, cam.y, '#ff2222', 25);
          if (life <= 0) { triggerGameOver(); break; }
          continue;
        }
      }
    }

    if (invincible > 0) invincible -= dtf;

    // Pickup spawning
    pickupTimer += dt;
    if (pickupTimer >= PICKUP_INTERVAL) { pickupTimer = 0; spawnPickup(); }

    // Pickup bob + player collision
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.bob += 0.04 * dtf;
      p.morphTimer += dt;
      if (p.flash > 0) p.flash -= dtf * 0.08;
      if (p.morphTimer >= 5000) {
        p.morphTimer = 0; p.flash = 1;
        const next = PICKUP_DEFS[Math.floor(Math.random() * PICKUP_DEFS.length)];
        p.type = next.type; p.color = next.color; p.label = next.label; p.name = next.name;
      }
      const dx = p.x - cam.x, dy = p.y - cam.y;
      if (dx * dx + dy * dy < (p.r + 24) ** 2) {
        if (p.type === 'heart') {
          if (life < 5) { life++; spawnFloat(p.x, p.y, '+1 Heart', p.color); feed('PICKUP! +1 HEART (' + life + '/5)'); }
          else { spawnFloat(p.x, p.y, 'Heart FULL', p.color); feed('PICKUP! HEART — ALREADY FULL'); }
        } else if (p.type === 'pts') {
          const bonus = 100 * getWave();
          score += bonus; totalPoints += bonus;
          spawnFloat(p.x, p.y, '+' + bonus.toLocaleString() + ' Points', p.color);
          feed('PICKUP! +' + bonus.toLocaleString() + ' POINTS');
        } else if (p.type === 'bomb') {
          const BOMB_R = 700;
          let killed = 0;
          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            const dx = e.x - cam.x, dy = e.y - cam.y;
            if (dx * dx + dy * dy <= BOMB_R * BOMB_R) {
              explode(e.x, e.y, e.color, 20);
              const bonus = 100 * getWave();
              score += bonus; totalPoints += bonus;
              enemies.splice(j, 1);
              killed++;
            }
          }
          for (let j = eBullets.length - 1; j >= 0; j--) {
            const b = eBullets[j];
            const dx = b.x - cam.x, dy = b.y - cam.y;
            if (dx * dx + dy * dy <= BOMB_R * BOMB_R) eBullets.splice(j, 1);
          }
          explode(cam.x, cam.y, '#ffdd00', 60);
          shockwaves.push({ x: cam.x, y: cam.y, r: 0, maxR: BOMB_R, life: 1.0 });
          spawnFloat(p.x, p.y, 'BOOM!', p.color);
          feed('BOMB! ' + killed + ' ENEMIES CLEARED');
        } else if (p.type === 'pierce') {
          if (upg.pierce < 10) {
            upg.pierce++;
            const rate = 1 + (upg.pierce - 1) * 2;
            spawnFloat(p.x, p.y, 'Pierce ' + rate + '%', p.color);
            feed('PICKUP! PIERCE → ' + rate + '% RATE');
          } else {
            spawnFloat(p.x, p.y, 'Pierce MAX', p.color);
            feed('PICKUP! PIERCE — MAX LEVEL');
          }
        } else {
          if (upg[p.type] < (UPG_MAX[p.type] ?? 10)) {
            upg[p.type]++;
            spawnFloat(p.x, p.y, p.name + ' +1', p.color);
            feed('PICKUP! ' + p.name + ' → LV' + upg[p.type]);
          } else {
            spawnFloat(p.x, p.y, p.name + ' MAX', p.color);
            feed('PICKUP! ' + p.name + ' — MAX LEVEL');
          }
        }
        explode(p.x, p.y, p.color, 22);
        pickups.splice(i, 1);
      }
    }

    // Float texts
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.y -= 0.6 * dtf;
      ft.life -= 0.018 * dtf;
      if (ft.life <= 0) floatTexts.splice(i, 1);
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r += (sw.maxR / 18) * dtf;
      sw.life -= 0.055 * dtf;
      if (sw.life <= 0) shockwaves.splice(i, 1);
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dtf; p.y += p.vy * dtf;
      p.vx *= Math.pow(0.96, dtf); p.vy *= Math.pow(0.96, dtf);
      p.life -= dtf;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── DRAW ──
  shockwaves.forEach(sw => {
    const { sx, sy } = wToS(sw.x, sw.y);
    ctx.save();
    ctx.globalAlpha = sw.life * 0.6;
    ctx.beginPath(); ctx.arc(sx, sy, sw.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 3 + sw.life * 6;
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();
  });

  particles.forEach(p => {
    const { sx, sy } = wToS(p.x, p.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 60);
    ctx.fillStyle = p.col; ctx.shadowColor = p.col; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  pickups.forEach(p => drawPickup(p));

  floatTexts.forEach(ft => {
    const { sx, sy } = wToS(ft.x, ft.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.font = 'bold 20px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#444444';
    ctx.fillText(ft.text, sx, sy);
    ctx.restore();
  });

  eBullets.forEach(b => {
    const { sx, sy } = wToS(b.x, b.y);
    drawBullet(sx, sy, b.r, b.awakened ? '#ff4400' : '#66ddff', b.awakened ? '#990000' : '#0066bb');
  });

  bullets.forEach(b => {
    const { sx, sy } = wToS(b.x, b.y);
    ctx.save();
    ctx.globalAlpha = b.pierce ? 1 : Math.min(1, b.life / 20);
    if (b.pierce) drawBullet(sx, sy, b.r, '#ffffff', '#111111');
    else drawBullet(sx, sy, b.r, '#fff4aa', '#ff6b1a');
    ctx.restore();
  });

  enemies.forEach(e => {
    const bob = Math.sin(e.bob) * 3;
    const { sx, sy } = wToS(e.x, e.y + bob);
    if (e.awakened) {
      ctx.save();
      ctx.translate(sx, sy);
      const spikes = 8, ir = e.r * 1.15, or = e.r * 1.65;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i * Math.PI / spikes) + e.bob * 0.5;
        const rad = i % 2 === 0 ? or : ir;
        i === 0 ? ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad)
                : ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,50,0,0.25)';
      ctx.shadowColor = '#ff3300';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    drawChar(sx, sy, e.canonAngle, false, e.awakened ? 'hsl(10,90%,45%)' : e.color, e.r);
    ctx.save();
    ctx.fillStyle = 'rgba(200,210,230,0.8)';
    ctx.fillRect(sx - 24, sy - 38, 48, 6);
    const pct = e.hp / e.maxHp;
    ctx.fillStyle = pct > 0.6 ? '#44cc66' : pct > 0.3 ? '#ffaa22' : '#ff3333';
    ctx.fillRect(sx - 24, sy - 38, 48 * pct, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx - 24, sy - 38, 48, 6);
    ctx.restore();
  });

  if (!(invincible > 0 && Math.floor(invincible / 5) % 2 === 0)) {
    drawChar(W / 2, H / 2, cannonAngle, true, 'hsl(21,100%,55%)', 24);
  }

  drawVignette();
  drawCrosshair();

  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255,0,0,${hitFlash * 0.28})`;
    ctx.fillRect(0, 0, W, H);
    hitFlash -= 0.07 * dtf;
  }

  updateUI();
}

requestAnimationFrame(loop);

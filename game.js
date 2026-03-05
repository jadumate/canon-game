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
function getEnemyShootInterval(){ return Math.max(400, 1600 - elapsedSec * 6); }

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  handleKey(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

const upg = { size: 1, speed: 1, rate: 1, move: 1, dmg: 1 };

function getUpgCost(type) {
  return Math.round(1000 * Math.pow(1.15, upg[type] - 1));
}

function upgrade(type) {
  if (!gameActive) return;
  const cost = getUpgCost(type);
  if (score >= cost) {
    score -= cost;
    upg[type]++;
    document.getElementById('lv-' + type).textContent = 'LV ' + upg[type];
    feed('UPGRADE ' + type.toUpperCase() + ' → LV' + upg[type]);
  } else {
    feed('NOT ENOUGH SCORE (need ' + cost + ')');
  }
}

function handleKey(code) {
  if (code === 'KeyU') upgrade('size');
  if (code === 'KeyI') upgrade('speed');
  if (code === 'KeyO') upgrade('rate');
  if (code === 'KeyY') upgrade('move');
  if (code === 'KeyP') upgrade('dmg');
}

function getBR() { return 5 + (upg.size - 1) * 3; }
function getBS() { return 7 + (upg.speed - 1) * 2; }
function getFI() { return Math.max(150, 1000 - (upg.rate - 1) * 150); }
function getBD() { return upg.dmg; }

const bullets = [], eBullets = [], enemies = [], particles = [];
let shotTimer = 0, enemyTimer = 0, scoreTimer = 0;

function fireBullet() {
  const a = cannonAngle, s = getBS(), r = getBR();
  bullets.push({ x: cam.x, y: cam.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, life: 200 });
}

function spawnEnemy() {
  if (enemies.length >= getMaxEnemies()) return;
  const a = Math.random() * Math.PI * 2;
  const d = 420 + Math.random() * 220;
  const hue = 180 + Math.random() * 80;
  const hp = getEnemyHP();
  enemies.push({
    x: cam.x + Math.cos(a) * d,
    y: cam.y + Math.sin(a) * d,
    vx: 0, vy: 0, r: 22,
    hp, maxHp: hp,
    shootTimer: Math.random() * 1500,
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
  const spd = getEnemyBulletSpeed();
  eBullets.push({
    x: e.x + Math.cos(a) * (e.r + 8),
    y: e.y + Math.sin(a) * (e.r + 8),
    vx: Math.cos(a) * spd,
    vy: Math.sin(a) * spd,
    r: 7, life: 240
  });
  e.canonAngle = a;
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

function updateUI() {
  document.getElementById('score-val').textContent = score.toLocaleString();
  document.getElementById('total-val').textContent = totalPoints.toLocaleString();
  const w = getWave();
  document.getElementById('wave-val').textContent = w;
  for (let i = 0; i < 5; i++) {
    document.getElementById('h' + i).classList.toggle('dead', i >= life);
  }
  ['size', 'speed', 'rate', 'move', 'dmg'].forEach(k => {
    document.getElementById('cost-' + k).textContent = getUpgCost(k) + ' pts';
  });
  if (w > lastWave) {
    lastWave = w;
    feed('⚠ WAVE ' + w + ' — Difficulty increased!');
  }
}

function triggerGameOver() {
  gameActive = false;
  bullets.length = 0; eBullets.length = 0; enemies.length = 0; particles.length = 0;
  document.getElementById('final-score').textContent = totalPoints.toLocaleString();
  document.getElementById('final-wave').textContent = getWave();
  document.getElementById('lb-form').style.display = '';
  document.getElementById('lb-status').textContent = '';
  document.getElementById('lb-submit-btn').disabled = false;
  document.getElementById('lb-name').value = localStorage.getItem('cannonPlayerName') || '';
  document.getElementById('msg-overlay').classList.add('show');
  document.getElementById('msg-overlay').scrollTop = 0;
  fetchLeaderboard();
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
  cam.x = 0; cam.y = 0;
  bullets.length = 0; eBullets.length = 0; enemies.length = 0; particles.length = 0;
  upg.size = 1; upg.speed = 1; upg.rate = 1; upg.move = 1; upg.dmg = 1;
  ['size', 'speed', 'rate', 'move', 'dmg'].forEach(k => {
    document.getElementById('lv-' + k).textContent = 'LV 1';
  });
  shotTimer = 0; enemyTimer = 0; scoreTimer = 0; invincible = 0; hitFlash = 0;
  elapsedSec = 0; lastWave = 1;
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
      const dx = cam.x - e.x, dy = cam.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > 85) { e.vx += (dx / d) * espd * dtf; e.vy += (dy / d) * espd * dtf; }
      e.vx *= Math.pow(0.92, dtf); e.vy *= Math.pow(0.92, dtf);
      e.x += e.vx * dtf; e.y += e.vy * dtf;
      e.bob += 0.03 * dtf;
      e.canonAngle = Math.atan2(cam.y - e.y, cam.x - e.x);
      e.shootTimer += dt;
      if (e.shootTimer >= e.shootInterval) { e.shootTimer = 0; enemyFire(e); }
    });

    // Player bullet collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dtf; b.y += b.vy * dtf; b.life -= dtf;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (b.r + e.r) ** 2) {
          e.hp -= getBD();
          bullets.splice(i, 1);
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
          hit = true;
          break;
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
  particles.forEach(p => {
    const { sx, sy } = wToS(p.x, p.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 60);
    ctx.fillStyle = p.col; ctx.shadowColor = p.col; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  eBullets.forEach(b => {
    const { sx, sy } = wToS(b.x, b.y);
    drawBullet(sx, sy, b.r, '#66ddff', '#0066bb');
  });

  bullets.forEach(b => {
    const { sx, sy } = wToS(b.x, b.y);
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life / 20);
    drawBullet(sx, sy, b.r, '#fff4aa', '#ff6b1a');
    ctx.restore();
  });

  enemies.forEach(e => {
    const bob = Math.sin(e.bob) * 3;
    const { sx, sy } = wToS(e.x, e.y + bob);
    drawChar(sx, sy, e.canonAngle, false, e.color, e.r);
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

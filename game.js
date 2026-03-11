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
let W, H, zoom = 1;
let vignetteCache = null;
let isMobile = false;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  zoom = isMobile ? W / 960 : 1;
  // Pre-render vignette
  const vc = document.createElement('canvas');
  vc.width = W; vc.height = H;
  const vctx = vc.getContext('2d');
  const vg = vctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(245,246,250,0)');
  vg.addColorStop(1, 'rgba(200,210,230,0.45)');
  vctx.fillStyle = vg;
  vctx.fillRect(0, 0, W, H);
  vignetteCache = vc;
}
resize();
window.addEventListener('resize', resize);
canvas.tabIndex = -1;
canvas.focus();

const cam = { x: 0, y: 0 };
const ARENA_R = 2200;
let score = 0, totalPoints = 0, life = 5, gameActive = true;
let adUsed = false;
let mouseX = 0, mouseY = 0;

// ── MOBILE JOYSTICKS ──
const JOY_MAX = 42; // max thumb travel px
const joyL = { active: false, id: -1, startX: 0, startY: 0, dx: 0, dy: 0 };
const joyR = { active: false, id: -1, startX: 0, startY: 0 };

function checkMobile() {
  isMobile = window.innerHeight > window.innerWidth;
  document.getElementById('mobile-controls').classList.toggle('visible', isMobile);
  zoom = isMobile ? W / 960 : 1;
}
window.addEventListener('resize', checkMobile);
let cannonAngle = 0;
let invincible = 0, hitFlash = 0;

// ── DIFFICULTY ──
let elapsedSec = 0, lastWave = 1;

function getWave()              { return Math.floor(elapsedSec / 30) + 1; }
function getMaxEnemies()        { return Math.min(2 + Math.floor(elapsedSec / 20), 20); }
function getSpawnInterval()     { return Math.max(600, 3000 - elapsedSec * 15); }
function getEnemyHP()           { return Math.max(1, Math.floor(1 + elapsedSec / 40)); }
function getEnemySpeed()        { return 0.07 + elapsedSec * 0.0006; }
function getEnemyBulletSpeed()  { return 2.74 + elapsedSec * 0.0135; }
function getEnemyShootInterval(){ return Math.max(400, 1600 - elapsedSec * 3); }

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

const upg = { size: 1, speed: 1, rate: 1, move: 1, dmg: 1, pierce: 1, arrow: 1 };


function getBR() { return 5 + (upg.size - 1) * 3; }
function getBS() { return 7 + (upg.speed - 1) * 2; }
function getFI() { return Math.max(150, 1000 - (upg.rate - 1) * 150); }
function getBD() { return upg.dmg; }

const bullets = [], eBullets = [], enemies = [], particles = [], pickups = [], floatTexts = [], shockwaves = [], minimees = [], sprouts = [];
let shotTimer = 0, enemyTimer = 0, scoreTimer = 0, pickupTimer = 0, sproutTimer = 0;
const SPROUT_INTERVAL = 18000; // ms between sprout spawns
const SPROUT_SHIELD_R = 115;   // tree bullet-block radius (world units)
let playerMoveX = 0, playerMoveY = 0;

function fireBullet() {
  const a = cannonAngle, s = getBS(), r = getBR();
  const pierceRate = (1 + (upg.pierce - 1) * 2) / 100;
  const arrowRate  = (1 + (upg.arrow  - 1) * 2) / 100;
  // Spawn at cannon barrel tip (r=24, tip = 24*(0.38+0.95) ≈ 32) to avoid being hidden behind player body
  const ox = Math.cos(a) * 32, oy = Math.sin(a) * 32;
  if (Math.random() < pierceRate) {
    bullets.push({ x: cam.x + ox, y: cam.y + oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: r * 1.5, life: 800, pierce: true, hit: new Set() });
  } else if (Math.random() < arrowRate && enemies.length > 0) {
    let nearestE = null, nearestD = Infinity;
    enemies.forEach(e => { const d2 = (e.x - cam.x) ** 2 + (e.y - cam.y) ** 2; if (d2 < nearestD) { nearestD = d2; nearestE = e; } });
    const aa = nearestE ? Math.atan2(nearestE.y - cam.y, nearestE.x - cam.x) : a;
    bullets.push({ x: cam.x + ox, y: cam.y + oy, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, r: r * 1.2, life: 500, arrow: true });
  } else {
    bullets.push({ x: cam.x + ox, y: cam.y + oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, life: 200 });
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
  { type: 'heart', color: '#ff1aff', label: '♥',   name: 'Heart'      },
  { type: 'pts',   color: '#22cc44', label: 'PTS', name: 'Points'     },
  { type: 'pierce',  color: '#111111', label: 'PRC', name: 'Pierce'   },
  { type: 'bomb',    color: '#ffdd00', label: 'BOM', name: 'Bomb'     },
  { type: 'minimee', color: '#1a3aaa', label: 'MIN', name: 'Minimee'  },
  { type: 'arrow',   color: '#00ddff', label: 'ARW', name: 'Homing'   },
];
const UPG_MAX = { size: 6 }; // per-type overrides; default is 10
const PICKUP_R = 12;
const PICKUP_INTERVAL = 14000;
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
  const pool = [...PICKUP_DEFS];
  const upgDefs = PICKUP_DEFS.filter(d => upg.hasOwnProperty(d.type));
  if (upgDefs.length > 0) {
    const lowest = upgDefs.reduce((a, b) => upg[a.type] <= upg[b.type] ? a : b);
    pool.push(lowest);
  }
  const def = pool[Math.floor(Math.random() * pool.length)];
  pickups.push({ x: px, y: py, r: PICKUP_R, bob: Math.random() * Math.PI * 2, morphTimer: 0, flash: 0, ...def });
}

function spawnSprout() {
  if (sprouts.length >= 5) return;
  const a = Math.random() * Math.PI * 2;
  const d = 180 + Math.random() * 320;
  let sx = cam.x + Math.cos(a) * d;
  let sy = cam.y + Math.sin(a) * d;
  const dist = Math.sqrt(sx * sx + sy * sy);
  if (dist > ARENA_R - 100) { sx *= (ARENA_R - 100) / dist; sy *= (ARENA_R - 100) / dist; }
  sprouts.push({ x: sx, y: sy, level: 1, touchCooldown: 0, r: 16, isTree: false, treeTimer: 0, pulse: 0 });
}

function drawSprout(s) {
  const { sx, sy } = wToS(s.x, s.y);
  ctx.save();
  if (s.isTree) {
    const treePulse = (Math.sin(s.pulse) * 0.12 + 0.88);
    // Shield aura
    ctx.globalAlpha = 0.10 + Math.sin(s.pulse * 1.3) * 0.05;
    ctx.beginPath(); ctx.arc(sx, sy, SPROUT_SHIELD_R, 0, Math.PI * 2);
    ctx.fillStyle = '#33ee66'; ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#22dd55'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Trunk
    ctx.fillStyle = '#7a4f2a';
    ctx.fillRect(sx - 6, sy - 4, 12, 22);
    // Canopy layers
    ctx.fillStyle = '#1db845';
    if (!lowSpec) { ctx.shadowColor = '#33ff77'; ctx.shadowBlur = 14 * treePulse; }
    ctx.beginPath(); ctx.arc(sx, sy - 18, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#28d455';
    ctx.beginPath(); ctx.arc(sx - 12, sy - 8, 16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 12, sy - 8, 16, 0, Math.PI * 2); ctx.fill();
    // Timer bar
    const frac = s.treeTimer / (8 * 60);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx - 24, sy - 46, 48, 5);
    ctx.fillStyle = `hsl(${120 * frac}, 80%, 45%)`;
    ctx.fillRect(sx - 24, sy - 46, 48 * frac, 5);
  } else {
    const lv = s.level;
    // Ground shadow
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, sy + 6, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // Stem
    ctx.strokeStyle = '#3a8a3a'; ctx.lineWidth = 2.5;
    const stemH = 6 + lv * 5;
    ctx.beginPath(); ctx.moveTo(sx, sy + 4); ctx.lineTo(sx, sy - stemH); ctx.stroke();
    // Leaves per level
    ctx.fillStyle = '#33cc55'; ctx.shadowColor = '#33cc55'; ctx.shadowBlur = 6;
    if (lv >= 1) {
      ctx.beginPath(); ctx.ellipse(sx - 7, sy - stemH + 4, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    if (lv >= 2) {
      ctx.beginPath(); ctx.ellipse(sx + 8, sy - stemH, 8, 4, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy - stemH - 2, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (lv >= 3) {
      ctx.fillStyle = '#22aa44';
      ctx.beginPath(); ctx.arc(sx - 10, sy - stemH - 6, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 10, sy - stemH - 6, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy - stemH - 12, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
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
  if (!lowSpec) {
    ctx.shadowColor = p.color; ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 1, sx, sy, p.r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, p.color); g.addColorStop(1, p.color + '99');
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
  }
  // label
  ctx.shadowBlur = 4; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.globalAlpha = 1;
  ctx.font = 'bold 8px Orbitron, monospace';
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
  ctx.beginPath();
  for (let x = ox - gs; x < W + gs; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = oy - gs; y < H + gs; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(148,160,200,0.55)';
  ctx.beginPath();
  for (let x = ox - gs; x < W + gs; x += gs) {
    for (let y = oy - gs; y < H + gs; y += gs) {
      ctx.moveTo(x + 2, y); ctx.arc(x, y, 2, 0, Math.PI * 2);
    }
  }
  ctx.fill();
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

  if (!lowSpec) {
    const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8);
    g.addColorStop(0, hslToRgba(color, 0.28));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();
  }

  if (!lowSpec) {
    const bg = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 1, 0, 0, r);
    bg.addColorStop(0, brightHsl(color));
    bg.addColorStop(1, color);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  }

  ctx.strokeStyle = isPlayer ? 'rgba(255,100,30,0.5)' : 'rgba(80,160,220,0.5)';
  ctx.lineWidth = 2; ctx.stroke();

  ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = isPlayer ? 'rgba(255,100,30,0.22)' : 'rgba(80,160,220,0.22)';
  ctx.lineWidth = 1.5; ctx.stroke();

  ctx.rotate(angle);
  if (!lowSpec) { ctx.shadowColor = isPlayer ? '#ff6b1a' : '#44aaff'; ctx.shadowBlur = 6; }
  ctx.fillStyle = isPlayer ? '#ff8c42' : '#44bbff';
  ctx.beginPath(); ctx.roundRect(r * 0.38, -5, r * 0.95, 10, 3); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = isPlayer ? '#cc4000' : '#1177aa'; ctx.fill();

  ctx.restore();
}

function drawBullet(sx, sy, r, c1, c2) {
  ctx.save();
  if (!lowSpec) {
    ctx.shadowColor = c1; ctx.shadowBlur = r * 1.2;
    const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 1, sx, sy, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = c1;
  }
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawArrowBullet(sx, sy, angle, r) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  if (!lowSpec) { ctx.shadowColor = '#00ffff'; ctx.shadowBlur = r * 3; }
  ctx.fillStyle = '#00ffff';
  ctx.beginPath();
  ctx.moveTo(r * 1.8, 0);
  ctx.lineTo(-r, -r * 0.75);
  ctx.lineTo(-r * 0.35, 0);
  ctx.lineTo(-r, r * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(r * 1.2, 0);
  ctx.lineTo(-r * 0.2, -r * 0.35);
  ctx.lineTo(-r * 0.2, r * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawVignette() {
  if (vignetteCache) ctx.drawImage(vignetteCache, 0, 0);
}

function drawCrosshair() {
  ctx.save();
  const cx = mouseX, cy = mouseY;
  if (!lowSpec) {
    // white glow pass (under everything)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx + 26, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy + 26); ctx.stroke();
  }
  // orange arms
  ctx.strokeStyle = '#ff6b1a';
  ctx.lineWidth = 2.5;
  if (!lowSpec) { ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 14; }
  ctx.beginPath(); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx + 26, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy + 26); ctx.stroke();
  // ring
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.strokeStyle = '#ff6b1a'; ctx.lineWidth = 2;
  if (!lowSpec) { ctx.shadowBlur = 12; }
  ctx.stroke();
  // center dot
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  if (!lowSpec) { ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 16; }
  ctx.fill();
  ctx.restore();
}

// ── FPS ──
let fps = 0, fpsFrames = 0, fpsLast = performance.now();
let lowSpec = false;

function tickFPS(now) {
  fpsFrames++;
  if (now - fpsLast >= 500) {
    fps = Math.round(fpsFrames / ((now - fpsLast) / 1000));
    fpsFrames = 0;
    fpsLast = now;
    if (!lowSpec && fps < 40) { lowSpec = true; }
    else if (lowSpec && fps > 80) { lowSpec = false; }
    document.getElementById('fps-box').textContent = 'FPS: ' + fps + (lowSpec ? ' ⚡' : '');
  }
}

const UPG_STATS = [
  { key: 'move',  color: '#ff3344', label: 'MOV' },
  { key: 'size',  color: '#3399ff', label: 'SIZ' },
  { key: 'speed', color: '#ff8800', label: 'VEL' },
  { key: 'rate',  color: '#aa44ff', label: 'RTE' },
  { key: 'dmg',    color: '#aaaaaa', label: 'PWR' },
  { key: 'pierce', color: '#111111', label: 'PRC' },
  { key: 'arrow',  color: '#00ddff', label: 'ARW' },
];

// ── DOM cache ──
const _dom = {};
let _uiScore = -1, _uiUpgHash = '', _uiWave = -1, _uiLife = -1;
function initDomCache() {
  _dom.scoreVal  = document.getElementById('score-val');
  _dom.upgStatus = document.getElementById('upg-status');
  _dom.waveVal   = document.getElementById('wave-val');
  _dom.hearts    = Array.from({ length: 5 }, (_, i) => document.getElementById('h' + i));
}

function updateUI() {
  if (totalPoints !== _uiScore) {
    _uiScore = totalPoints;
    _dom.scoreVal.textContent = totalPoints.toLocaleString() + ' pts';
  }
  const upgHash = UPG_STATS.map(d => upg[d.key]).join(',');
  if (upgHash !== _uiUpgHash) {
    _uiUpgHash = upgHash;
    _dom.upgStatus.innerHTML = UPG_STATS.map(d =>
      `<div class="upg-stat">
        <span class="upg-stat-label" style="color:${d.color}">${d.label}</span>
        <span class="upg-stat-val"   style="color:${d.color}">+${upg[d.key] - 1}</span>
      </div>`
    ).join('');
  }
  const w = getWave();
  if (w !== _uiWave) {
    _uiWave = w;
    _dom.waveVal.textContent = w;
    if (w > lastWave) { lastWave = w; feed('⚠ WAVE ' + w + ' — Difficulty increased!'); }
  }
  if (life !== _uiLife) {
    _uiLife = life;
    for (let i = 0; i < 5; i++) _dom.hearts[i].classList.toggle('dead', i >= life);
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
  ins.style.cssText = 'display:block;text-align:center;min-height:250px;width:100%;';
  ins.dataset.adClient = 'ca-pub-2904828185240062';
  ins.dataset.adSlot = '4131080299';
  ins.dataset.adFormat = 'autorelaxed';
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

  // Reduce all upgrade levels by 1 (min 1)
  for (const k of Object.keys(upg)) {
    upg[k] = Math.max(1, upg[k] - 1);
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
  pickups.length = 0; floatTexts.length = 0; shockwaves.length = 0; minimees.length = 0; sprouts.length = 0;
  shotTimer = 0; enemyTimer = 0; scoreTimer = 0; invincible = 0; hitFlash = 0; sproutTimer = 0;
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
  fetch('leaderboard/api.php?action=token')
    .then(r => r.json())
    .then(t => {
      if (!t.ok) throw new Error('token');
      return fetch('leaderboard/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score: totalPoints, wave: getWave(), nonce: t.nonce, token: t.token })
      });
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
  upg.size = 1; upg.speed = 1; upg.rate = 1; upg.move = 1; upg.dmg = 1; upg.pierce = 1; upg.arrow = 1;
  pickups.length = 0; pickupTimer = 0; floatTexts.length = 0; shockwaves.length = 0; minimees.length = 0; sprouts.length = 0; sproutTimer = 0;
  shotTimer = 0; enemyTimer = 0; scoreTimer = 0; invincible = 0; hitFlash = 0;
  playerMoveX = 0; playerMoveY = 0;
  elapsedSec = 0; lastWave = 1;
  if (adCountdownInterval) { clearInterval(adCountdownInterval); adCountdownInterval = null; }
  document.getElementById('ad-overlay').classList.remove('show');
  document.getElementById('msg-overlay').classList.remove('show');
}

// ── JOYSTICK SETUP ──
(function setupJoysticks() {
  checkMobile();
  const panel = document.getElementById('mobile-controls');
  const lThumb = document.getElementById('joy-left-thumb');
  const rThumb = document.getElementById('joy-right-thumb');

  function resetThumb(el) { el.style.transform = 'translate(-50%, -50%)'; }

  panel.addEventListener('touchstart', e => {
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const isLeft = (t.clientX - rect.left) < rect.width / 2;
      if (isLeft && !joyL.active) {
        joyL.active = true; joyL.id = t.identifier;
        joyL.startX = t.clientX; joyL.startY = t.clientY;
        joyL.dx = 0; joyL.dy = 0;
      } else if (!isLeft && !joyR.active) {
        joyR.active = true; joyR.id = t.identifier;
        joyR.startX = t.clientX; joyR.startY = t.clientY;
      }
    }
  }, { passive: false });

  panel.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyL.id) {
        let dx = t.clientX - joyL.startX;
        let dy = t.clientY - joyL.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > JOY_MAX) { const s = JOY_MAX / dist; dx *= s; dy *= s; }
        joyL.dx = dx / JOY_MAX; joyL.dy = dy / JOY_MAX;
        lThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === joyR.id) {
        const dx = t.clientX - joyR.startX;
        const dy = t.clientY - joyR.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 8) {
          cannonAngle = Math.atan2(dy, dx);
          const s = dist > JOY_MAX ? JOY_MAX / dist : 1;
          rThumb.style.transform = `translate(calc(-50% + ${dx * s}px), calc(-50% + ${dy * s}px))`;
        }
      }
    }
  }, { passive: false });

  function onEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === joyL.id) {
        joyL.active = false; joyL.id = -1; joyL.dx = 0; joyL.dy = 0;
        resetThumb(lThumb);
      } else if (t.identifier === joyR.id) {
        joyR.active = false; joyR.id = -1;
        resetThumb(rThumb);
      }
    }
  }
  panel.addEventListener('touchend', onEnd);
  panel.addEventListener('touchcancel', onEnd);

  // Prevent scroll/zoom on canvas touches
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
})();

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
    if (joyL.active) {
      mx = joyL.dx * spd; my = joyL.dy * spd;
    } else {
      if (keys['ArrowLeft']  || keys['KeyA']) mx -= spd;
      if (keys['ArrowRight'] || keys['KeyD']) mx += spd;
      if (keys['ArrowUp']    || keys['KeyW']) my -= spd;
      if (keys['ArrowDown']  || keys['KeyS']) my += spd;
      if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    }
    playerMoveX = playerMoveX * 0.9 + mx * 0.1;
    playerMoveY = playerMoveY * 0.9 + my * 0.1;
    cam.x += mx * dtf; cam.y += my * dtf;
    const distFromCenter = Math.sqrt(cam.x * cam.x + cam.y * cam.y);
    if (distFromCenter > ARENA_R) {
      const scale = ARENA_R / distFromCenter;
      cam.x *= scale; cam.y *= scale;
    }

    if (!joyR.active) cannonAngle = Math.atan2(mouseY - H / 2, mouseX - W / 2);

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
      const nearTree = sprouts.some(s => { if (!s.isTree) return false; const tx = e.x - s.x, ty = e.y - s.y; return tx * tx + ty * ty < (SPROUT_SHIELD_R + e.r) ** 2; });
      if (e.spawnDelay > 0) { e.spawnDelay -= dt; }
      else { e.shootTimer += dt; if (!nearTree && e.shootTimer >= e.shootInterval) { e.shootTimer = 0; enemyFire(e); } }
      // Tree shield pushback
      for (let si = 0; si < sprouts.length; si++) {
        const s = sprouts[si];
        if (!s.isTree) continue;
        const tdx = e.x - s.x, tdy = e.y - s.y;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const minDist = SPROUT_SHIELD_R + e.r;
        if (tdist < minDist) {
          e.x = s.x + (tdx / tdist) * minDist;
          e.y = s.y + (tdy / tdist) * minDist;
          const dot = e.vx * (tdx / tdist) + e.vy * (tdy / tdist);
          if (dot < 0) { e.vx -= dot * (tdx / tdist); e.vy -= dot * (tdy / tdist); }
        }
      }
    });

    // Minimee AI
    const miniMaxSpd = (3.2 + (upg.move - 1) * 0.8) * 0.8;
    minimees.forEach(m => {
      m.bob += 0.03 * dtf;
      if (m.invincible > 0) m.invincible -= dtf;
      // Orbit around player at 70 world units
      const orbitAngle = m.offsetAngle + elapsedSec * 0.4;
      const targetX = cam.x + Math.cos(orbitAngle) * 70;
      const targetY = cam.y + Math.sin(orbitAngle) * 70;
      const dx = targetX - m.x, dy = targetY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      m.vx += (dx / dist) * 0.18 * dtf;
      m.vy += (dy / dist) * 0.18 * dtf;
      m.vx *= Math.pow(0.88, dtf); m.vy *= Math.pow(0.88, dtf);
      const spd2 = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      if (spd2 > miniMaxSpd) { m.vx *= miniMaxSpd / spd2; m.vy *= miniMaxSpd / spd2; }
      m.x += m.vx * dtf; m.y += m.vy * dtf;
      // Shoot at nearest enemy
      m.shootTimer += dt;
      if (m.shootTimer >= getFI() && enemies.length > 0) {
        m.shootTimer = 0;
        let nearestE = null, nearestD = Infinity;
        enemies.forEach(e => { const d2 = (e.x - m.x) ** 2 + (e.y - m.y) ** 2; if (d2 < nearestD) { nearestD = d2; nearestE = e; } });
        if (nearestE) {
          const a = Math.atan2(nearestE.y - m.y, nearestE.x - m.x);
          m.cannonAngle = a;
          bullets.push({ x: m.x + Math.cos(a) * 24, y: m.y + Math.sin(a) * 24, vx: Math.cos(a) * getBS(), vy: Math.sin(a) * getBS(), r: getBR(), life: 200 });
        }
      }
    });

    // Player bullet collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.arrow && enemies.length > 0) {
        let nearestE = null, nearestD = Infinity;
        enemies.forEach(e => { const d2 = (e.x - b.x) ** 2 + (e.y - b.y) ** 2; if (d2 < nearestD) { nearestD = d2; nearestE = e; } });
        if (nearestE) {
          const targetA = Math.atan2(nearestE.y - b.y, nearestE.x - b.x);
          const curA = Math.atan2(b.vy, b.vx);
          let diff = targetA - curA;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-0.1, Math.min(0.1, diff)) * dtf;
          const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          const newA = curA + turn;
          b.vx = Math.cos(newA) * spd; b.vy = Math.sin(newA) * spd;
        }
      }
      b.x += b.vx * dtf; b.y += b.vy * dtf; b.life -= dtf;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (b.pierce && b.hit.has(e)) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (b.r + e.r) ** 2) {
          if (b.pierce) b.hit.add(e);
          e.hp -= b.arrow ? e.maxHp : getBD();
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
      // Minimee hit check
      let miniHit = false;
      for (let mi = minimees.length - 1; mi >= 0; mi--) {
        const m = minimees[mi];
        if (m.invincible > 0) continue;
        const dmx = b.x - m.x, dmy = b.y - m.y;
        if (dmx * dmx + dmy * dmy < (b.r + m.r) ** 2) {
          eBullets.splice(i, 1);
          m.hp--; m.invincible = 60;
          explode(m.x, m.y, '#1a3aaa', 10);
          if (m.hp <= 0) { explode(m.x, m.y, '#1a3aaa', 35); minimees.splice(mi, 1); feed('MINIMEE DESTROYED!'); }
          miniHit = true; break;
        }
      }
      if (miniHit) continue;
      // Tree shield check
      let treeBlocked = false;
      for (let si = 0; si < sprouts.length; si++) {
        const s = sprouts[si];
        if (!s.isTree) continue;
        const tdx = b.x - s.x, tdy = b.y - s.y;
        if (tdx * tdx + tdy * tdy < SPROUT_SHIELD_R ** 2) {
          eBullets.splice(i, 1);
          explode(s.x + tdx * 0.5, s.y + tdy * 0.5, '#33ff77', 5);
          treeBlocked = true; break;
        }
      }
      if (treeBlocked) continue;
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
        const morphPool = [...PICKUP_DEFS];
        const morphUpgDefs = PICKUP_DEFS.filter(d => upg.hasOwnProperty(d.type));
        if (morphUpgDefs.length > 0) {
          const morphLowest = morphUpgDefs.reduce((a, b) => upg[a.type] <= upg[b.type] ? a : b);
          morphPool.push(morphLowest, morphLowest, morphLowest);
        }
        const next = morphPool[Math.floor(Math.random() * morphPool.length)];
        p.type = next.type; p.color = next.color; p.label = next.label; p.name = next.name;
      }
      const dx = p.x - cam.x, dy = p.y - cam.y;
      if (dx * dx + dy * dy < (p.r + 24) ** 2) {
        if (p.type === 'heart') {
          if (life < 5) { life++; spawnFloat(p.x, p.y, '+1 Heart', p.color); feed('PICKUP! +1 HEART (' + life + '/5)'); }
          else { spawnFloat(p.x, p.y, 'Heart FULL', p.color); feed('PICKUP! HEART — ALREADY FULL'); }
        } else if (p.type === 'pts') {
          const bonus = 100 * getWave() * (Math.floor(Math.random() * 10) + 1);
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
        } else if (p.type === 'minimee') {
          if (minimees.length < 3) {
            const offsetAngle = minimees.length * (Math.PI * 2 / 3);
            minimees.push({ x: cam.x, y: cam.y, vx: 0, vy: 0, hp: 5, maxHp: 5, r: 18, shootTimer: 0, bob: Math.random() * Math.PI * 2, cannonAngle: 0, invincible: 0, offsetAngle });
            spawnFloat(p.x, p.y, 'MINIMEE!', p.color);
            feed('PICKUP! MINIMEE COMPANION (' + minimees.length + '/3)');
          } else {
            spawnFloat(p.x, p.y, 'MIN FULL', p.color);
            feed('PICKUP! MINIMEE — MAX COMPANIONS');
          }
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
        } else if (p.type === 'arrow') {
          if (upg.arrow < 10) {
            upg.arrow++;
            const rate = 1 + (upg.arrow - 1) * 2;
            spawnFloat(p.x, p.y, 'Homing ' + rate + '%', p.color);
            feed('PICKUP! HOMING → ' + rate + '% RATE');
          } else {
            spawnFloat(p.x, p.y, 'Homing MAX', p.color);
            feed('PICKUP! HOMING — MAX LEVEL');
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

    // Sprout spawning
    sproutTimer += dt;
    if (sproutTimer >= SPROUT_INTERVAL) { sproutTimer = 0; spawnSprout(); }

    // Sprout + tree update
    for (let i = sprouts.length - 1; i >= 0; i--) {
      const s = sprouts[i];
      s.pulse += 0.05 * dtf;
      if (s.isTree) {
        s.treeTimer -= dtf;
        if (s.treeTimer <= 0) {
          explode(s.x, s.y, '#22aa44', 20);
          spawnFloat(s.x, s.y, 'Tree gone', '#22aa44');
          feed('TREE SHIELD EXPIRED');
          sprouts.splice(i, 1);
        }
        continue;
      }
      if (s.touchCooldown > 0) s.touchCooldown -= dtf;
      const sdx = s.x - cam.x, sdy = s.y - cam.y;
      if (sdx * sdx + sdy * sdy < (s.r + 24) ** 2 && s.touchCooldown <= 0) {
        s.level++;
        s.touchCooldown = 60;
        explode(s.x, s.y, '#33cc55', 8);
        if (s.level >= 4) {
          s.isTree = true;
          s.treeTimer = 9.6 * 60;
          spawnFloat(s.x, s.y, 'TREE!', '#22dd55');
          feed('SPROUT → TREE! BULLET SHIELD ACTIVE 8s');
        } else {
          spawnFloat(s.x, s.y, 'Sprout ' + s.level + '/4', '#33cc55');
          feed('SPROUT GROWS ' + s.level + '/4 — touch again in 1s!');
        }
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
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);

  shockwaves.forEach(sw => {
    const { sx, sy } = wToS(sw.x, sw.y);
    ctx.save();
    ctx.globalAlpha = sw.life * 0.6;
    ctx.beginPath(); ctx.arc(sx, sy, sw.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 3 + sw.life * 6;
    if (!lowSpec) { ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 20; }
    ctx.stroke();
    ctx.restore();
  });

  particles.forEach(p => {
    const { sx, sy } = wToS(p.x, p.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 60);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  pickups.forEach(p => drawPickup(p));
  sprouts.forEach(s => drawSprout(s));

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
    ctx.globalAlpha = (b.pierce || b.arrow) ? 1 : Math.min(1, b.life / 20);
    if (b.pierce) drawBullet(sx, sy, b.r, '#ffffff', '#111111');
    else if (b.arrow) drawArrowBullet(sx, sy, Math.atan2(b.vy, b.vx), b.r);
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

  minimees.forEach(m => {
    const bob = Math.sin(m.bob) * 3;
    const { sx, sy } = wToS(m.x, m.y + bob);
    const flash = m.invincible > 0 && Math.floor(m.invincible / 5) % 2 === 0;
    if (!flash) drawChar(sx, sy, m.cannonAngle, true, 'hsl(21,100%,55%)', m.r);
    ctx.save();
    ctx.fillStyle = 'rgba(200,210,230,0.8)';
    ctx.fillRect(sx - 20, sy - 30, 40, 5);
    ctx.fillStyle = '#1a6aee';
    ctx.fillRect(sx - 20, sy - 30, 40 * (m.hp / m.maxHp), 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx - 20, sy - 30, 40, 5);
    ctx.restore();
  });

  if (!(invincible > 0 && Math.floor(invincible / 5) % 2 === 0)) {
    drawChar(W / 2, H / 2, cannonAngle, true, 'hsl(21,100%,55%)', 24);
  }

  ctx.restore(); // end zoom transform

  drawVignette();
  drawCrosshair();

  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255,0,0,${hitFlash * 0.28})`;
    ctx.fillRect(0, 0, W, H);
    hitFlash -= 0.07 * dtf;
  }

  updateUI();
}

initDomCache();
requestAnimationFrame(loop);

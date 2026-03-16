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
let spice = 0;
let spiceProductType = 'a'; // future: 'a','b','c'...
let spiceProductCount = 0;
function getSpiceCost() { return Math.floor(50 * Math.pow(1.1, spiceProductCount)); }
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
function getEnemyShootInterval(){ return Math.max(400, 1600 - elapsedSec * 1.3); }

const SPICE_PRODUCTS = { a: 'MINE', b: 'MINIMEE', c: 'ICE TURRET' };
function setSpiceProduct(p) {
  spiceProductType = p;
  feed('SPICE PRODUCT: [' + p.toUpperCase() + '] ' + SPICE_PRODUCTS[p]);
}

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  if ((e.code === 'KeyE' || e.code === 'Digit1') && gameActive) {
    const order = ['a', 'b', 'c'];
    setSpiceProduct(order[(order.indexOf(spiceProductType) + 1) % order.length]);
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

const upg = { size: 1, speed: 1, rate: 1, move: 1, dmg: 1, pierce: 1, arrow: 1 };


function getBR() { return 5 + (upg.size - 1) * 1.5; }
function getBS() { return 7 + (upg.speed - 1) * 2; }
function getFI() { return Math.max(150, 1000 - (upg.rate - 1) * 150); }
function getBD() { return upg.dmg; }

const bullets = [], eBullets = [], enemies = [], particles = [], pickups = [], floatTexts = [], shockwaves = [], minimees = [], sprouts = [], spices = [], mines = [], iceTurrets = [], bosses = [], extraPickups = [];
let shotTimer = 0, enemyTimer = 0, scoreTimer = 0, pickupTimer = 0, sproutTimer = 0, spiceTimer = 0;
let lastExtraWave = 0;
const EXTRA_LETTERS = ['e', 'x', 't', 'r', 'a'];
const extraCollected = { e: false, x: false, t: false, r: false, a: false };
let lastBossWave = 0;
const SPROUT_INTERVAL = 18000; // ms between sprout spawns
const SPICE_INTERVAL = 10000;  // ms between spice spawns
const MAX_SPICES = 6;
const MINE_R = 16;
const ICE_TURRET_LIFE = 600;   // ~10s at 60fps baseline
const ICE_FREEZE_TIME = 600;   // ~10s at 60fps baseline
const MINIMEE_LIFETIME = 15000; // ms before minimee expires
const SPROUT_SHIELD_R = 130;   // tree bullet-block radius (world units)
const SPROUT_MAX_LEVEL = 5;    // touches required to grow into a tree
const MIASMA_R = 130;          // miasma tree damage radius (world units)
const MIASMA_DMG_INTERVAL = 30; // frames between miasma damage ticks
const MIASMA_LIFE = 9.6 * 60;  // miasma tree lifetime (frames)
const BARRIER_WALL_LEN = 200;  // full barrier wall length (world units)
const BARRIER_WALL_LIFE = 3600; // ~60s at 60fps baseline
const BARRIER_THICKNESS = 8;   // collision half-thickness (world units)
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
    hue,
    frozen: false, frozenTimer: 0,
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
  { type: 'pts',   color: '#22cc44', label: 'PTS', name: 'Points'     },
  { type: 'pierce',  color: '#111111', label: 'PRC', name: 'Pierce'   },
  { type: 'bomb',    color: '#ffdd00', label: 'BOM', name: 'Bomb'     },
  { type: 'arrow',   color: '#00ddff', label: 'ARW', name: 'Homing'   },
];
const UPG_MAX = { size: 10 }; // per-type overrides; default is 10
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

function spawnBoss(wave) {
  const a = Math.random() * Math.PI * 2;
  const hp = 20 * (wave / 5);
  bosses.push({
    x: cam.x + Math.cos(a) * 520,
    y: cam.y + Math.sin(a) * 520,
    vx: 0, vy: 0,
    r: 40,
    hp, maxHp: hp,
    shootTimer: 0,
    canonAngle: 0,
    bob: Math.random() * Math.PI * 2,
    pulse: 0,
    frozen: false, frozenTimer: 0,
    wave,
  });
  feed('⚠ BOSS INCOMING — WAVE ' + wave + '!');
  spawnFloat(cam.x, cam.y, 'BOSS!', '#ff0055');
}

function spawnSprout() {
  if (sprouts.length >= 8) return;
  const a = Math.random() * Math.PI * 2;
  const d = 180 + Math.random() * 320;
  let sx = cam.x + Math.cos(a) * d;
  let sy = cam.y + Math.sin(a) * d;
  const dist = Math.sqrt(sx * sx + sy * sy);
  if (dist > ARENA_R - 100) { sx *= (ARENA_R - 100) / dist; sy *= (ARENA_R - 100) / dist; }
  const rnd = Math.random();
  const kind = rnd < 0.34 ? 'aegis' : rnd < 0.67 ? 'miasma' : 'barrier';
  sprouts.push({ x: sx, y: sy, level: 1, touchCooldown: 0, r: 16, isTree: false, isMiasma: false, isBarrier: false, treeTimer: 0, miasmaTimer: 0, barrierTimer: kind === 'barrier' ? BARRIER_WALL_LIFE : 0, dmgTick: 0, pulse: 0, kind, angle: Math.random() * Math.PI });
}

function spawnSpice() {
  if (spices.length >= MAX_SPICES) return;
  const a = Math.random() * Math.PI * 2;
  const d = 150 + Math.random() * 350;
  let sx = cam.x + Math.cos(a) * d;
  let sy = cam.y + Math.sin(a) * d;
  const dist = Math.sqrt(sx * sx + sy * sy);
  if (dist > ARENA_R - 80) { sx *= (ARENA_R - 80) / dist; sy *= (ARENA_R - 80) / dist; }
  const amount = Math.floor(Math.random() * (getWave() + 10)) + 1;
  spices.push({ x: sx, y: sy, r: 10, bob: Math.random() * Math.PI * 2, amount });
}

function spawnExtraLetter() {
  const letter = EXTRA_LETTERS[Math.floor(Math.random() * EXTRA_LETTERS.length)];
  const a = Math.random() * Math.PI * 2;
  const d = 120 + Math.random() * 260;
  let px = cam.x + Math.cos(a) * d;
  let py = cam.y + Math.sin(a) * d;
  const pdist = Math.sqrt(px * px + py * py);
  if (pdist > ARENA_R - 80) { px *= (ARENA_R - 80) / pdist; py *= (ARENA_R - 80) / pdist; }
  extraPickups.push({ x: px, y: py, r: 14, bob: Math.random() * Math.PI * 2, letter });
}

function updateExtraBoard() {
  EXTRA_LETTERS.forEach(l => {
    const el = document.getElementById('el-' + l);
    if (el) el.classList.toggle('lit', extraCollected[l]);
  });
}

function drawExtraPickup(p) {
  const { sx, sy } = wToS(p.x, p.y + Math.sin(p.bob) * 5);
  ctx.save();
  const pulse = Math.sin(p.bob * 2) * 0.5 + 0.5;
  const s = p.r * 2; // side length
  // outer pulse ring (square)
  ctx.globalAlpha = 0.3 + pulse * 0.25;
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1.5;
  const os = s * (1.5 + pulse * 0.35);
  ctx.strokeRect(sx - os / 2, sy - os / 2, os, os);
  // filled square
  ctx.globalAlpha = 0.92;
  if (!lowSpec) {
    ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 14;
    const g = ctx.createLinearGradient(sx - p.r, sy - p.r, sx + p.r, sy + p.r);
    g.addColorStop(0, '#fff9cc'); g.addColorStop(0.5, '#ffcc00'); g.addColorStop(1, '#ff8800');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = '#ffcc00';
  }
  ctx.beginPath(); ctx.roundRect(sx - p.r, sy - p.r, s, s, 3); ctx.fill();
  // border
  if (!lowSpec) { ctx.shadowBlur = 4; ctx.shadowColor = 'rgba(0,0,0,0.4)'; }
  ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 1.5; ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.roundRect(sx - p.r, sy - p.r, s, s, 3); ctx.stroke();
  // letter
  ctx.shadowBlur = 3; ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.font = 'bold 12px Orbitron, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(p.letter.toUpperCase(), sx, sy);
  ctx.restore();
}

function drawSpice(s) {
  const { sx, sy } = wToS(s.x, s.y + Math.sin(s.bob) * 4);
  ctx.save();
  if (!lowSpec) { ctx.shadowColor = '#d4a017'; ctx.shadowBlur = 10; }
  ctx.fillStyle = '#e8b820';
  ctx.strokeStyle = '#c49010';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - s.r * 1.3);
  ctx.lineTo(sx + s.r, sy);
  ctx.lineTo(sx, sy + s.r * 1.3);
  ctx.lineTo(sx - s.r, sy);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 3; ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.font = 'bold 8px Orbitron, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a3a00';
  ctx.fillText(s.amount, sx, sy);
  ctx.restore();
}

function drawIceTurret(t) {
  const { sx, sy } = wToS(t.x, t.y);
  ctx.save();
  if (!lowSpec) { ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 12; }
  // Base
  ctx.beginPath(); ctx.arc(sx, sy, t.r, 0, Math.PI * 2);
  ctx.fillStyle = '#1a4a6a'; ctx.fill();
  ctx.strokeStyle = '#44aaff'; ctx.lineWidth = 2.5; ctx.stroke();
  // Inner ring
  ctx.beginPath(); ctx.arc(sx, sy, t.r * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = '#2266aa'; ctx.fill();
  // Barrel
  ctx.save();
  ctx.translate(sx, sy); ctx.rotate(t.angle);
  if (!lowSpec) { ctx.shadowColor = '#88ddff'; ctx.shadowBlur = 6; }
  ctx.fillStyle = '#88ccff';
  ctx.beginPath(); ctx.roundRect(t.r * 0.3, -4, t.r * 0.95, 8, 2); ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
  // Life bar
  const lifeFrac = t.life / ICE_TURRET_LIFE;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(sx - 22, sy - t.r - 8, 44, 4);
  ctx.fillStyle = `hsl(${200 * lifeFrac},80%,60%)`;
  ctx.fillRect(sx - 22, sy - t.r - 8, 44 * lifeFrac, 4);
  // Label
  ctx.font = 'bold 7px Orbitron, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#aaddff';
  ctx.fillText('ICE', sx, sy + t.r + 3);
  ctx.restore();
}

function drawMine(m) {
  const { sx, sy } = wToS(m.x, m.y);
  ctx.save();
  if (!lowSpec) { ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 10; }
  ctx.beginPath(); ctx.arc(sx, sy, m.r, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2a2a'; ctx.fill();
  ctx.strokeStyle = '#ff4400'; ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - m.r * 0.6, sy - m.r * 0.6); ctx.lineTo(sx + m.r * 0.6, sy + m.r * 0.6);
  ctx.moveTo(sx + m.r * 0.6, sy - m.r * 0.6); ctx.lineTo(sx - m.r * 0.6, sy + m.r * 0.6);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff2200'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = 'bold 7px Orbitron, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffaa00';
  ctx.fillText('MINE', sx, sy + m.r + 3);
  ctx.restore();
}

function drawBoss(b) {
  const bob = Math.sin(b.bob) * 4;
  const { sx, sy } = wToS(b.x, b.y + bob);
  ctx.save();
  ctx.translate(sx, sy);
  // Outer aura
  if (!lowSpec) {
    const aura = ctx.createRadialGradient(0, 0, b.r * 0.5, 0, 0, b.r * 2.5);
    aura.addColorStop(0, 'rgba(200,0,60,0.22)');
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, b.r * 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Spike ring
  const spikes = 12, ir = b.r * 1.1, or = b.r * 1.75;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (i * Math.PI / spikes) + b.pulse * 0.3;
    const rad = i % 2 === 0 ? or : ir;
    i === 0 ? ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad)
            : ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  ctx.closePath();
  if (!lowSpec) { ctx.shadowColor = '#ff0055'; ctx.shadowBlur = 20; }
  ctx.fillStyle = 'rgba(200,0,60,0.3)';
  ctx.fill();
  ctx.strokeStyle = '#ff0055'; ctx.lineWidth = 2; ctx.stroke();
  // Body
  ctx.shadowBlur = 0;
  if (!lowSpec) {
    const bg = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.3, 2, 0, 0, b.r);
    bg.addColorStop(0, '#ff3377'); bg.addColorStop(1, '#880022');
    ctx.fillStyle = bg;
  } else { ctx.fillStyle = '#880022'; }
  ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,0,80,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, b.r * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,100,150,0.3)'; ctx.lineWidth = 2; ctx.stroke();
  // Barrel
  ctx.rotate(b.canonAngle);
  if (!lowSpec) { ctx.shadowColor = '#ff0055'; ctx.shadowBlur = 8; }
  ctx.fillStyle = '#cc0044';
  ctx.beginPath(); ctx.roundRect(b.r * 0.4, -7, b.r * 1.1, 14, 3); ctx.fill();
  ctx.restore();
  // HP bar + label
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(sx - 44, sy - b.r - bob - 16, 88, 8);
  const pct = b.hp / b.maxHp;
  ctx.fillStyle = pct > 0.6 ? '#ff0055' : pct > 0.3 ? '#ff6600' : '#ff3300';
  ctx.fillRect(sx - 44, sy - b.r - bob - 16, 88 * pct, 8);
  ctx.strokeStyle = 'rgba(255,0,80,0.4)'; ctx.lineWidth = 1;
  ctx.strokeRect(sx - 44, sy - b.r - bob - 16, 88, 8);
  ctx.font = 'bold 8px Orbitron, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffaacc';
  ctx.fillText('BOSS W' + b.wave, sx, sy - b.r - bob - 17);
  ctx.restore();
  // Frozen overlay
  if (b.frozen) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#88ddff';
    ctx.beginPath(); ctx.arc(sx, sy, b.r * 1.12, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    for (let ci = 0; ci < 8; ci++) {
      const ca = ci * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ca) * b.r * 1.35, sy + Math.sin(ca) * b.r * 1.35);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx - 44, sy - b.r - bob - 28, 88, 4);
    ctx.fillStyle = '#44ddff';
    ctx.fillRect(sx - 44, sy - b.r - bob - 28, 88 * (b.frozenTimer / ICE_FREEZE_TIME), 4);
    ctx.restore();
  }
}

function drawSprout(s) {
  const { sx, sy } = wToS(s.x, s.y);
  ctx.save();
  if (s.isBarrier) {
    const c = Math.cos(s.angle), sn = Math.sin(s.angle);
    const hl = BARRIER_WALL_LEN / 2;
    const x1s = sx - c * hl, y1s = sy - sn * hl;
    const x2s = sx + c * hl, y2s = sy + sn * hl;
    if (!lowSpec) { ctx.shadowColor = '#8b5a2b'; ctx.shadowBlur = 18; }
    ctx.strokeStyle = 'rgba(139,90,43,0.3)';
    ctx.lineWidth = 18; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1s, y1s); ctx.lineTo(x2s, y2s); ctx.stroke();
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#a0622a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x1s, y1s); ctx.lineTo(x2s, y2s); ctx.stroke();
    ctx.strokeStyle = '#f0d0a0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1s, y1s); ctx.lineTo(x2s, y2s); ctx.stroke();
    const frac = s.barrierTimer / BARRIER_WALL_LIFE;
    const secsLeft = Math.ceil(s.barrierTimer / 60);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(sx - 30, sy - 18, 60, 8);
    ctx.fillStyle = `hsl(${30 * frac + 10}, 65%, 40%)`;
    ctx.fillRect(sx - 30, sy - 18, 60 * frac, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx - 30, sy - 18, 60, 8);
    ctx.font = 'bold 7px Orbitron, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#f0d0a0';
    ctx.fillText(secsLeft + 's', sx, sy - 19);
  } else if (s.isMiasma) {
    const mp = Math.sin(s.pulse);
    // Miasma aura
    ctx.globalAlpha = 0.08 + mp * 0.06;
    ctx.beginPath(); ctx.arc(sx, sy, MIASMA_R, 0, Math.PI * 2);
    ctx.fillStyle = '#cc44ff'; ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#aa22ee'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Dead/rotted trunk
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(sx - 5, sy - 2, 10, 20);
    // Miasma cloud puffs
    if (!lowSpec) { ctx.shadowColor = '#cc44ff'; ctx.shadowBlur = 18 * (0.8 + mp * 0.2); }
    const puffs = [
      { ox: 0, oy: -22, r: 22 },
      { ox: -14, oy: -10, r: 14 },
      { ox: 14, oy: -10, r: 14 },
      { ox: -8, oy: -34, r: 13 },
      { ox: 8, oy: -34, r: 13 },
    ];
    puffs.forEach(({ ox, oy, r }, pi) => {
      const drift = Math.sin(s.pulse * 0.7 + pi) * 2;
      ctx.globalAlpha = 0.7 + mp * 0.15;
      ctx.fillStyle = pi % 2 === 0 ? '#9922cc' : '#bb44ee';
      ctx.beginPath(); ctx.arc(sx + ox, sy + oy + drift, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
    // Timer bar
    const frac = s.miasmaTimer / MIASMA_LIFE;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx - 24, sy - 54, 48, 5);
    ctx.fillStyle = `hsl(${280 - (1 - frac) * 60}, 80%, 50%)`;
    ctx.fillRect(sx - 24, sy - 54, 48 * frac, 5);
  } else if (s.isTree) {
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
  } else if (s.kind === 'barrier') {
    const len = s.level * 35;
    const c = Math.cos(s.angle), sn = Math.sin(s.angle);
    const x1s = sx - c * len / 2, y1s = sy - sn * len / 2;
    const x2s = sx + c * len / 2, y2s = sy + sn * len / 2;
    if (!lowSpec) { ctx.shadowColor = '#a0622a'; ctx.shadowBlur = 8; }
    ctx.strokeStyle = '#6b3d1a';
    ctx.lineWidth = 4 + s.level;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1s, y1s); ctx.lineTo(x2s, y2s); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#d4935a';
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
  } else {
    const lv = s.level;
    const isMiasmaSprout = s.kind === 'miasma';
    const leafColor = isMiasmaSprout ? '#aa33dd' : '#33cc55';
    const leafColor2 = isMiasmaSprout ? '#882bbb' : '#22aa44';
    const stemColor = isMiasmaSprout ? '#6a3a8a' : '#3a8a3a';
    // Ground shadow
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, sy + 6, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // Stem
    ctx.strokeStyle = stemColor; ctx.lineWidth = 2.5;
    const stemH = 6 + lv * 5;
    ctx.beginPath(); ctx.moveTo(sx, sy + 4); ctx.lineTo(sx, sy - stemH); ctx.stroke();
    // Leaves per level
    ctx.fillStyle = leafColor; ctx.shadowColor = leafColor; ctx.shadowBlur = 6;
    if (lv >= 1) {
      ctx.beginPath(); ctx.ellipse(sx - 7, sy - stemH + 4, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    if (lv >= 2) {
      ctx.beginPath(); ctx.ellipse(sx + 8, sy - stemH, 8, 4, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy - stemH - 2, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (lv >= 3) {
      ctx.fillStyle = leafColor2;
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

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function barrierEndpoints(s) {
  const len = s.isBarrier ? BARRIER_WALL_LEN : s.level * 35;
  const c = Math.cos(s.angle), sn = Math.sin(s.angle);
  return { x1: s.x - c * len / 2, y1: s.y - sn * len / 2, x2: s.x + c * len / 2, y2: s.y + sn * len / 2 };
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
let _uiScore = -1, _uiUpgHash = '', _uiWave = -1, _uiLife = -1, _uiSpice = -1, _uiSpiceCost = -1, _uiProduct = '';
function initDomCache() {
  _dom.scoreVal  = document.getElementById('score-val');
  _dom.upgStatus = document.getElementById('upg-status');
  _dom.waveVal   = document.getElementById('wave-val');
  _dom.hearts    = Array.from({ length: 6 }, (_, i) => document.getElementById('h' + i));
  _dom.spiceVal  = document.getElementById('spice-val');
  _dom.spiceFill = document.getElementById('spice-fill');
  _dom.spiceCap  = document.getElementById('spice-cap');
  _dom.sprodA    = document.getElementById('sprod-a');
  _dom.sprodB    = document.getElementById('sprod-b');
  _dom.sprodC    = document.getElementById('sprod-c');
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
    for (let i = 0; i < 6; i++) _dom.hearts[i].classList.toggle('dead', i >= life);
  }
  const cost = getSpiceCost();
  if (spice !== _uiSpice || cost !== _uiSpiceCost) {
    _uiSpice = spice; _uiSpiceCost = cost;
    _dom.spiceVal.textContent = spice;
    _dom.spiceCap.textContent = '/' + cost;
    _dom.spiceFill.style.width = Math.min(100, (spice / cost) * 100) + '%';
  }
  if (spiceProductType !== _uiProduct) {
    _uiProduct = spiceProductType;
    _dom.sprodA.classList.toggle('active', spiceProductType === 'a');
    _dom.sprodB.classList.toggle('active', spiceProductType === 'b');
    _dom.sprodC.classList.toggle('active', spiceProductType === 'c');
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

  // Reduce all upgrade levels and spice product count by 2/3
  for (const k of Object.keys(upg)) {
    upg[k] = Math.max(1, Math.floor(upg[k] * 2 / 3));
  }
  spiceProductCount = Math.floor(spiceProductCount * 2 / 3);

  // Halve elapsed time → halves wave
  elapsedSec = Math.floor(elapsedSec / 2);
  lastWave = getWave();
  bosses.length = 0;
  lastBossWave = Math.floor(getWave() / 5) * 5;

  // Halve score
  score = Math.floor(score / 2);
  totalPoints = Math.floor(totalPoints / 2);

  // Restore 3 hearts on continue
  life = 3;

  // Clear active objects
  bullets.length = 0; eBullets.length = 0; enemies.length = 0; particles.length = 0;
  pickups.length = 0; floatTexts.length = 0; shockwaves.length = 0; minimees.length = 0; sprouts.length = 0;
  spices.length = 0; mines.length = 0; iceTurrets.length = 0; spiceTimer = 0;
  spice = 0; spiceProductCount = 0;
  extraPickups.length = 0; lastExtraWave = getWave(); EXTRA_LETTERS.forEach(l => extraCollected[l] = false); updateExtraBoard();
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
  spice = 0; spiceProductCount = 0;
  adUsed = false;
  cam.x = 0; cam.y = 0;
  bullets.length = 0; eBullets.length = 0; enemies.length = 0; particles.length = 0;
  upg.size = 1; upg.speed = 1; upg.rate = 1; upg.move = 1; upg.dmg = 1; upg.pierce = 1; upg.arrow = 1;
  pickups.length = 0; pickupTimer = 0; floatTexts.length = 0; shockwaves.length = 0; minimees.length = 0; sprouts.length = 0; sproutTimer = 0;
  spices.length = 0; mines.length = 0; iceTurrets.length = 0; spiceTimer = 0;
  extraPickups.length = 0; lastExtraWave = getWave(); EXTRA_LETTERS.forEach(l => extraCollected[l] = false); updateExtraBoard();
  shotTimer = 0; enemyTimer = 0; scoreTimer = 0; invincible = 0; hitFlash = 0;
  playerMoveX = 0; playerMoveY = 0;
  elapsedSec = 0; lastWave = 1; lastExtraWave = 0;
  bosses.length = 0; lastBossWave = 0;
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
    // Barrier blocking for player
    for (let si = 0; si < sprouts.length; si++) {
      const s = sprouts[si];
      if (s.kind !== 'barrier') continue;
      const { x1, y1, x2, y2 } = barrierEndpoints(s);
      const bDist = distToSeg(cam.x, cam.y, x1, y1, x2, y2);
      const blockR = 24 + BARRIER_THICKNESS;
      if (bDist < blockR) {
        const sdx = x2 - x1, sdy = y2 - y1;
        const l2 = sdx * sdx + sdy * sdy || 1;
        const t2 = Math.max(0, Math.min(1, ((cam.x - x1) * sdx + (cam.y - y1) * sdy) / l2));
        const cx2 = x1 + t2 * sdx, cy2 = y1 + t2 * sdy;
        const nx = cam.x - cx2, ny = cam.y - cy2;
        const nd = Math.sqrt(nx * nx + ny * ny) || 1;
        cam.x = cx2 + (nx / nd) * blockR;
        cam.y = cy2 + (ny / nd) * blockR;
      }
    }

    if (!joyR.active) cannonAngle = Math.atan2(mouseY - H / 2, mouseX - W / 2);

    // Shooting
    shotTimer += dt;
    if (shotTimer >= getFI()) { shotTimer = 0; fireBullet(); }

    // Enemy spawning
    enemyTimer += dt;
    if (enemyTimer >= getSpawnInterval()) { enemyTimer = 0; spawnEnemy(); }

    // Boss spawn check (every 5 waves)
    const waveNow = getWave();
    if (waveNow >= 5 && waveNow % 5 === 0 && waveNow !== lastBossWave) {
      lastBossWave = waveNow;
      spawnBoss(waveNow);
    }

    // EXTRA letter spawn on wave-up
    if (waveNow > 1 && waveNow > lastExtraWave) {
      lastExtraWave = waveNow;
      spawnExtraLetter();
    }

    // Enemy AI
    const espd = getEnemySpeed();
    enemies.forEach(e => {
      e.aliveTime += dt;
      if (!e.awakened && e.aliveTime >= 60000) { e.awakened = true; spawnFloat(e.x, e.y, 'AWAKENED!', '#ff3300'); }
      // Frozen: skip movement and shooting
      if (e.frozen) {
        e.frozenTimer -= dtf;
        e.bob += 0.008 * dtf;
        e.canonAngle = Math.atan2(cam.y - e.y, cam.x - e.x);
        if (e.frozenTimer <= 0) {
          const bonus = 100 * getWave();
          explode(e.x, e.y, '#88ddff', 30);
          score += bonus; totalPoints += bonus;
          feed('FROZEN SOLID! +' + bonus);
          enemies.splice(enemies.indexOf(e), 1);
        }
        return;
      }
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
      // Barrier pushback
      for (let si = 0; si < sprouts.length; si++) {
        const s = sprouts[si];
        if (s.kind !== 'barrier') continue;
        const { x1, y1, x2, y2 } = barrierEndpoints(s);
        const bDist = distToSeg(e.x, e.y, x1, y1, x2, y2);
        const blockR = e.r + BARRIER_THICKNESS;
        if (bDist < blockR) {
          const sdx = x2 - x1, sdy = y2 - y1;
          const l2 = sdx * sdx + sdy * sdy || 1;
          const t2 = Math.max(0, Math.min(1, ((e.x - x1) * sdx + (e.y - y1) * sdy) / l2));
          const cx2 = x1 + t2 * sdx, cy2 = y1 + t2 * sdy;
          const nx = e.x - cx2, ny = e.y - cy2;
          const nd = Math.sqrt(nx * nx + ny * ny) || 1;
          e.x = cx2 + (nx / nd) * blockR;
          e.y = cy2 + (ny / nd) * blockR;
          const dot = e.vx * (nx / nd) + e.vy * (ny / nd);
          if (dot < 0) { e.vx -= dot * (nx / nd); e.vy -= dot * (ny / nd); }
        }
      }
    });

    // Minimee AI
    const miniMaxSpd = (3.2 + (upg.move - 1) * 0.8) * 0.8;
    for (let mi = minimees.length - 1; mi >= 0; mi--) {
      const m = minimees[mi];
      // Expire after 15 seconds
      if (performance.now() - m.spawnTime >= MINIMEE_LIFETIME) {
        explode(m.x, m.y, '#1a3aaa', 20);
        feed('MINIMEE EXPIRED');
        minimees.splice(mi, 1);
        continue;
      }
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
      // Shoot at nearest enemy (halved speed, damage, doubled interval vs player)
      const miniFI = getFI() * 2;
      const miniBS = getBS() / 2;
      const miniDmg = Math.max(1, getBD() / 2);
      m.shootTimer += dt;
      if (m.shootTimer >= miniFI && enemies.length > 0) {
        m.shootTimer = 0;
        let nearestE = null, nearestD = Infinity;
        enemies.forEach(e => { const d2 = (e.x - m.x) ** 2 + (e.y - m.y) ** 2; if (d2 < nearestD) { nearestD = d2; nearestE = e; } });
        if (nearestE) {
          const a = Math.atan2(nearestE.y - m.y, nearestE.x - m.x);
          m.cannonAngle = a;
          bullets.push({ x: m.x + Math.cos(a) * 24, y: m.y + Math.sin(a) * 24, vx: Math.cos(a) * miniBS, vy: Math.sin(a) * miniBS, r: getBR(), life: 200, miniDmg });
        }
      }
    }

    // Boss AI
    for (let bi = bosses.length - 1; bi >= 0; bi--) {
      const b = bosses[bi];
      b.bob += 0.025 * dtf;
      b.pulse += 0.04 * dtf;
      if (b.frozen) {
        b.frozenTimer -= dtf;
        if (b.frozenTimer <= 0) { b.frozen = false; spawnFloat(b.x, b.y, 'UNFROZEN!', '#88ddff'); }
        continue;
      }
      const bdx = cam.x - b.x, bdy = cam.y - b.y;
      const bd = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
      const bspd = 0.045;
      if (bd > 200) { b.vx += (bdx / bd) * bspd * dtf; b.vy += (bdy / bd) * bspd * dtf; }
      else if (bd < 150) { b.vx -= (bdx / bd) * bspd * dtf; b.vy -= (bdy / bd) * bspd * dtf; }
      b.vx *= Math.pow(0.94, dtf); b.vy *= Math.pow(0.94, dtf);
      b.x += b.vx * dtf; b.y += b.vy * dtf;
      // Barrier blocking for boss
      for (let si = 0; si < sprouts.length; si++) {
        const s = sprouts[si];
        if (s.kind !== 'barrier') continue;
        const { x1, y1, x2, y2 } = barrierEndpoints(s);
        const bDist = distToSeg(b.x, b.y, x1, y1, x2, y2);
        const blockR = b.r + BARRIER_THICKNESS;
        if (bDist < blockR) {
          const sdx = x2 - x1, sdy = y2 - y1;
          const l2 = sdx * sdx + sdy * sdy || 1;
          const t2 = Math.max(0, Math.min(1, ((b.x - x1) * sdx + (b.y - y1) * sdy) / l2));
          const cx2 = x1 + t2 * sdx, cy2 = y1 + t2 * sdy;
          const nx = b.x - cx2, ny = b.y - cy2;
          const nd = Math.sqrt(nx * nx + ny * ny) || 1;
          b.x = cx2 + (nx / nd) * blockR;
          b.y = cy2 + (ny / nd) * blockR;
          const dot = b.vx * (nx / nd) + b.vy * (ny / nd);
          if (dot < 0) { b.vx -= dot * (nx / nd); b.vy -= dot * (ny / nd); }
        }
      }
      b.canonAngle = Math.atan2(cam.y - b.y, cam.x - b.x);
      // Burst fire: bullets spread 18° apart, count scales with wave
      b.shootTimer += dt;
      if (b.shootTimer >= 1800) {
        b.shootTimer = 0;
        const bulletCount = Math.floor(b.wave / 5) + 2; // W5→3, W10→4, W15→5, W20→6…
        const spread = Math.PI / 10;
        const half = (bulletCount - 1) / 2;
        const bspeed = getEnemyBulletSpeed() * 1.3;
        for (let si = 0; si < bulletCount; si++) {
          const a = b.canonAngle + (si - half) * spread;
          eBullets.push({ x: b.x + Math.cos(a) * (b.r + 12), y: b.y + Math.sin(a) * (b.r + 12), vx: Math.cos(a) * bspeed, vy: Math.sin(a) * bspeed, r: 11, life: 300, boss: true });
        }
      }
    }

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
          e.hp -= b.miniDmg !== undefined ? b.miniDmg : b.iceDmg !== undefined ? b.iceDmg : (b.arrow ? getBD() * 2 : getBD());
          if (b.ice && !e.frozen) { e.frozen = true; e.frozenTimer = ICE_FREEZE_TIME; spawnFloat(e.x, e.y, 'FROZEN!', '#88ddff'); }
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

    // Player bullet vs boss
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.ice) continue; // ice turret bullets don't affect boss
      for (let bi = bosses.length - 1; bi >= 0; bi--) {
        const boss = bosses[bi];
        if (b.pierce && b.hit && b.hit.has(boss)) continue;
        const dx = b.x - boss.x, dy = b.y - boss.y;
        if (dx * dx + dy * dy < (b.r + boss.r) ** 2) {
          if (b.pierce) b.hit.add(boss);
          const dmg = b.miniDmg !== undefined ? b.miniDmg : (b.arrow ? getBD() * 2 : getBD());
          boss.hp -= dmg;
          if (b.ice && !boss.frozen) { boss.frozen = true; boss.frozenTimer = ICE_FREEZE_TIME; spawnFloat(boss.x, boss.y, 'BOSS FROZEN!', '#88ddff'); }
          explode(boss.x, boss.y, '#ff0055', 12);
          if (boss.hp <= 0) {
            const bonus = 500 * getWave();
            explode(boss.x, boss.y, '#ff0055', 80);
            shockwaves.push({ x: boss.x, y: boss.y, r: 0, maxR: 350, life: 1.0 });
            for (let si = 0; si < 3; si++) {
              const sa = Math.random() * Math.PI * 2, sd = 30 + Math.random() * 80;
              spices.push({ x: boss.x + Math.cos(sa) * sd, y: boss.y + Math.sin(sa) * sd, r: 10, bob: Math.random() * Math.PI * 2, amount: boss.wave });
            }
            score += bonus; totalPoints += bonus;
            feed('BOSS DEFEATED! +' + bonus.toLocaleString());
            spawnFloat(boss.x, boss.y, 'BOSS DOWN!', '#ff0055');
            bosses.splice(bi, 1);
          }
          if (!b.pierce) { bullets.splice(i, 1); break; }
        }
      }
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
      // Barrier wall check
      let barrierBlocked = false;
      for (let si = 0; si < sprouts.length; si++) {
        const s = sprouts[si];
        if (s.kind !== 'barrier') continue;
        const { x1, y1, x2, y2 } = barrierEndpoints(s);
        if (distToSeg(b.x, b.y, x1, y1, x2, y2) < b.r + BARRIER_THICKNESS) {
          eBullets.splice(i, 1);
          explode(b.x, b.y, '#a0622a', 5);
          barrierBlocked = true; break;
        }
      }
      if (barrierBlocked) continue;
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
        if (p.type === 'pts') {
          const bonus = 100 * getWave() * (Math.floor(Math.random() * 10) + 1);
          score += bonus; totalPoints += bonus;
          spawnFloat(p.x, p.y, '+' + bonus.toLocaleString() + ' Points', p.color);
          feed('PICKUP! +' + bonus.toLocaleString() + ' POINTS');
        } else if (p.type === 'bomb') {
          const BOMB_R = 700;
          let converted = 0;
          const wave = getWave();
          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            const dx = e.x - cam.x, dy = e.y - cam.y;
            if (dx * dx + dy * dy <= BOMB_R * BOMB_R) {
              explode(e.x, e.y, e.color, 20);
              spices.push({ x: e.x, y: e.y, r: 10, bob: Math.random() * Math.PI * 2, amount: wave });
              enemies.splice(j, 1);
              converted++;
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
          feed('BOMB! ' + converted + ' ENEMIES → SPICE ×' + wave);
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

    // Spice spawning
    spiceTimer += dt;
    if (spiceTimer >= SPICE_INTERVAL) { spiceTimer = 0; spawnSpice(); }


    // Spice collection
    for (let i = spices.length - 1; i >= 0; i--) {
      const s = spices[i];
      s.bob += 0.04 * dtf;
      const dx = s.x - cam.x, dy = s.y - cam.y;
      if (dx * dx + dy * dy < (s.r + 24) ** 2) {
        spice += s.amount;
        explode(s.x, s.y, '#e8b820', 14);
        spawnFloat(s.x, s.y, '+' + s.amount + ' SPICE', '#d4a017');
        feed('SPICE ×' + s.amount + ' — Total: ' + spice);
        spices.splice(i, 1);
        // Auto-drop product when spice >= cost
        while (spice >= getSpiceCost()) {
          const cost = getSpiceCost();
          spice -= cost;
          spiceProductCount++;
          const nextCost = getSpiceCost();
          if (spiceProductType === 'a') {
            mines.push({ x: cam.x, y: cam.y, r: MINE_R, pulse: 0 });
            spawnFloat(cam.x, cam.y, 'MINE PLACED', '#ff6600');
            feed('MINE [M] PLACED — next cost: ' + nextCost);
          } else if (spiceProductType === 'b') {
            if (minimees.length < 3) {
              const offsetAngle = minimees.length * (Math.PI * 2 / 3);
              minimees.push({ x: cam.x, y: cam.y, vx: 0, vy: 0, hp: 5, maxHp: 5, r: 18, shootTimer: 0, bob: Math.random() * Math.PI * 2, cannonAngle: 0, invincible: 0, offsetAngle, spawnTime: performance.now() });
              spawnFloat(cam.x, cam.y, 'MINIMEE!', '#1a3aaa');
              feed('MINIMEE [N] SPAWNED (' + minimees.length + '/3) — next cost: ' + nextCost);
            } else {
              spice += cost; spiceProductCount--;
              feed('MINIMEE — MAX COMPANIONS (3/3)');
            }
          } else if (spiceProductType === 'c') {
            iceTurrets.push({ x: cam.x, y: cam.y, r: 18, shootTimer: 0, angle: 0, life: ICE_TURRET_LIFE });
            spawnFloat(cam.x, cam.y, 'ICE TURRET!', '#88ddff');
            feed('ICE TURRET [I] PLACED — next cost: ' + nextCost);
          }
        }
      }
    }

    // Extra letter pickup collision
    for (let i = extraPickups.length - 1; i >= 0; i--) {
      const p = extraPickups[i];
      p.bob += 0.04 * dtf;
      const dx = p.x - cam.x, dy = p.y - cam.y;
      if (dx * dx + dy * dy < (p.r + 24) ** 2) {
        extraCollected[p.letter] = true;
        extraPickups.splice(i, 1);
        explode(p.x, p.y, '#ffcc00', 20);
        spawnFloat(p.x, p.y, p.letter.toUpperCase() + '!', '#ffcc00');
        feed('EXTRA [' + p.letter.toUpperCase() + '] — ' + EXTRA_LETTERS.filter(l => extraCollected[l]).length + '/5');
        updateExtraBoard();
        if (EXTRA_LETTERS.every(l => extraCollected[l])) {
          let killed = 0;
          for (let ei = enemies.length - 1; ei >= 0; ei--) {
            explode(enemies[ei].x, enemies[ei].y, enemies[ei].color, 30);
            score += 100 * getWave(); totalPoints += 100 * getWave();
            enemies.splice(ei, 1); killed++;
          }
          for (let bi = bosses.length - 1; bi >= 0; bi--) {
            explode(bosses[bi].x, bosses[bi].y, '#ff0055', 60);
            score += 500 * getWave(); totalPoints += 500 * getWave();
            bosses.splice(bi, 1); killed++;
          }
          if (life < 6) life++;
          shockwaves.push({ x: cam.x, y: cam.y, r: 0, maxR: ARENA_R, life: 1.0 });
          feed('✦ E·X·T·R·A! ' + killed + ' ENEMIES DESTROYED + 1 HEART ✦');
          spawnFloat(cam.x, cam.y, 'E·X·T·R·A!', '#ffcc00');
          EXTRA_LETTERS.forEach(l => extraCollected[l] = false);
          updateExtraBoard();
        }
      }
    }

    // Mine — enemy collision
    for (let mi = mines.length - 1; mi >= 0; mi--) {
      const m = mines[mi];
      m.pulse += 0.08 * dtf;
      let triggered = false;
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        const dx = e.x - m.x, dy = e.y - m.y;
        if (dx * dx + dy * dy < (m.r + e.r) ** 2) {
          // Trigger: destroy all enemies within blast radius
          const BLAST_R = 200;
          explode(m.x, m.y, '#ff4400', 50);
          shockwaves.push({ x: m.x, y: m.y, r: 0, maxR: BLAST_R, life: 1.0 });
          let killed = 0;
          for (let bi = enemies.length - 1; bi >= 0; bi--) {
            const be = enemies[bi];
            const bdx = be.x - m.x, bdy = be.y - m.y;
            if (bdx * bdx + bdy * bdy < BLAST_R * BLAST_R) {
              explode(be.x, be.y, be.color, 25);
              const killBonus = 100 * getWave(); score += killBonus; totalPoints += killBonus;
              enemies.splice(bi, 1);
              killed++;
            }
          }
          mines.splice(mi, 1);
          feed('MINE TRIGGERED! ' + killed + ' ENEMIES DESTROYED');
          triggered = true;
          break;
        }
      }
      if (triggered) continue;
    }

    // Ice turret AI
    for (let ti = iceTurrets.length - 1; ti >= 0; ti--) {
      const t = iceTurrets[ti];
      t.life -= dtf;
      if (t.life <= 0) {
        explode(t.x, t.y, '#88ddff', 20);
        spawnFloat(t.x, t.y, 'TURRET GONE', '#88ddff');
        feed('ICE TURRET EXPIRED');
        iceTurrets.splice(ti, 1);
        continue;
      }
      t.shootTimer += dt;
      if (t.shootTimer >= 840 && enemies.length > 0) {
        t.shootTimer = 0;
        let nearestE = null, nearestD = Infinity;
        enemies.forEach(e => {
          if (e.frozen) return;
          const d2 = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
          if (d2 < nearestD) { nearestD = d2; nearestE = e; }
        });
        if (nearestE) {
          const a = Math.atan2(nearestE.y - t.y, nearestE.x - t.x);
          t.angle = a;
          bullets.push({ x: t.x + Math.cos(a) * 24, y: t.y + Math.sin(a) * 24, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, r: 8, life: 600, ice: true, iceDmg: 0 });
        }
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
      if (s.kind === 'barrier') {
        s.barrierTimer -= dtf;
        if (s.barrierTimer <= 0) {
          explode(s.x, s.y, '#a0622a', 20);
          spawnFloat(s.x, s.y, s.isBarrier ? 'Barrier gone' : 'Sprout gone', '#a0622a');
          feed(s.isBarrier ? 'BARRIER WALL EXPIRED' : 'BARRIER SPROUT EXPIRED');
          sprouts.splice(i, 1);
          continue;
        }
        if (s.isBarrier) continue;
      }
      if (s.isMiasma) {
        s.miasmaTimer -= dtf;
        if (s.miasmaTimer <= 0) {
          explode(s.x, s.y, '#9933cc', 20);
          spawnFloat(s.x, s.y, 'Miasma gone', '#9933cc');
          feed('MIASMA TREE EXPIRED');
          sprouts.splice(i, 1);
          continue;
        }
        s.dmgTick += dtf;
        if (s.dmgTick >= MIASMA_DMG_INTERVAL) {
          s.dmgTick = 0;
          for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            const mdx = e.x - s.x, mdy = e.y - s.y;
            if (mdx * mdx + mdy * mdy <= MIASMA_R * MIASMA_R) {
              e.hp--;
              if (e.hp <= 0) {
                const killBonus = 100 * getWave();
                score += killBonus; totalPoints += killBonus;
                explode(e.x, e.y, e.color, 20);
                spawnFloat(e.x, e.y, '+' + killBonus, '#ffdd00');
                feed('ENEMY KILLED BY MIASMA');
                enemies.splice(ei, 1);
              }
            }
          }
        }
        continue;
      }
      if (s.touchCooldown > 0) s.touchCooldown -= dtf;
      const sdx = s.x - cam.x, sdy = s.y - cam.y;
      const growColor = s.kind === 'miasma' ? '#bb44ee' : s.kind === 'barrier' ? '#a0622a' : '#33cc55';
      if (sdx * sdx + sdy * sdy < (s.r + 24) ** 2 && s.touchCooldown <= 0) {
        s.level++;
        s.touchCooldown = 120;
        explode(s.x, s.y, growColor, 8);
        if (s.level >= SPROUT_MAX_LEVEL) {
          if (s.kind === 'miasma') {
            s.isMiasma = true;
            s.miasmaTimer = MIASMA_LIFE;
            spawnFloat(s.x, s.y, 'MIASMA!', '#bb44ee');
            feed('SPROUT → MIASMA TREE! DAMAGE AURA ACTIVE');
          } else if (s.kind === 'barrier') {
            s.isBarrier = true;
            spawnFloat(s.x, s.y, 'BARRIER!', '#a0622a');
            feed('SPROUT → BARRIER WALL! Blocks bullets & movement');
          } else {
            s.isTree = true;
            s.treeTimer = 9.6 * 60;
            spawnFloat(s.x, s.y, 'TREE!', '#22dd55');
            feed('SPROUT → TREE! BULLET SHIELD ACTIVE 8s');
          }
        } else {
          const treeName = s.kind === 'miasma' ? 'MiasmaTree' : s.kind === 'barrier' ? 'Barrier' : 'AegisTree';
          spawnFloat(s.x, s.y, treeName + ' ' + s.level + '/' + SPROUT_MAX_LEVEL, growColor);
          feed('SPROUT GROWS ' + s.level + '/' + SPROUT_MAX_LEVEL + ' — touch again in 2s!');
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

  drawGrid();

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
  extraPickups.forEach(p => drawExtraPickup(p));
  spices.forEach(s => drawSpice(s));
  mines.forEach(m => drawMine(m));
  iceTurrets.forEach(t => drawIceTurret(t));
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
    const c1 = b.boss ? '#ff0066' : b.awakened ? '#ff4400' : '#66ddff';
    const c2 = b.boss ? '#880033' : b.awakened ? '#990000' : '#0066bb';
    drawBullet(sx, sy, b.r, c1, c2);
  });

  bullets.forEach(b => {
    const { sx, sy } = wToS(b.x, b.y);
    ctx.save();
    ctx.globalAlpha = (b.pierce || b.arrow) ? 1 : Math.min(1, b.life / 20);
    if (b.pierce) drawBullet(sx, sy, b.r, '#ffffff', '#111111');
    else if (b.arrow) drawArrowBullet(sx, sy, Math.atan2(b.vy, b.vx), b.r);
    else if (b.ice) drawBullet(sx, sy, b.r, '#aaeeff', '#0066aa');
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
    // Frozen overlay
    if (e.frozen) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (!lowSpec) { ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 10; }
      ctx.fillStyle = '#88ddff';
      ctx.beginPath(); ctx.arc(sx, sy, e.r * 1.12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      for (let ci = 0; ci < 6; ci++) {
        const ca = ci * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ca) * e.r * 1.35, sy + Math.sin(ca) * e.r * 1.35);
        ctx.stroke();
      }
      // Freeze timer bar
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(sx - 24, sy - 46, 48, 4);
      ctx.fillStyle = '#44ddff';
      ctx.fillRect(sx - 24, sy - 46, 48 * (e.frozenTimer / ICE_FREEZE_TIME), 4);
      ctx.restore();
    }
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

  bosses.forEach(b => drawBoss(b));

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
    // Countdown timer
    const secLeft = Math.ceil((MINIMEE_LIFETIME - (performance.now() - m.spawnTime)) / 1000);
    ctx.font = 'bold 9px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = secLeft <= 3 ? '#ff4444' : 'rgba(255,255,255,0.7)';
    ctx.fillText(secLeft + 's', sx, sy - 35);
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
updateExtraBoard();
requestAnimationFrame(loop);

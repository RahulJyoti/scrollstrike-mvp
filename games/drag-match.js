// ─────────────────────────────────────────────────────────────────
//  ScrollStrike · Drag Match mini-game
//  File: games/drag-match.js
// ─────────────────────────────────────────────────────────────────

let _container   = null;
let _onWin       = null;
let _onFail      = null;
let _timerRAF    = null;      // requestAnimationFrame handle
let _startTime   = null;
let _duration    = 10000;     // 10 s
let _resolved    = false;     // guard: onWin / onFail called once
let _hintTimeout = null;

// Per-shape drag state
const _drag = {
  active:    false,
  shapeKey:  null,   // 'circle' | 'square'
  el:        null,   // the dragging clone / element
  startX:    0,
  startY:    0,
  offsetX:   0,
  offsetY:   0,
};

// Keep refs to DOM nodes we'll manipulate
const _nodes = {
  root:         null,
  hud:          null,
  timerBar:     null,
  timerCount:   null,
  hint:         null,
  flash:        null,
  winOverlay:   null,
  failOverlay:  null,
  shapes:       {},  // { circle: el, square: el }
  targets:      {},  // { circle: el, square: el }
  origins:      {},  // { circle: {x,y}, square: {x,y} }
  matched:      { circle: false, square: false },
};

// ─── Helpers ──────────────────────────────────────────────────────

function _resolve(type) {
  if (_resolved) return;
  _resolved = true;
  cancelAnimationFrame(_timerRAF);

  if (type === 'win') {
    _showWin();
    setTimeout(() => _onWin && _onWin(), 800);
  } else {
    _showFail();
    setTimeout(() => _onFail && _onFail(), 1200);
  }
}

function _getCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function _dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ─── Animations ───────────────────────────────────────────────────

function _flashScreen(color = 'rgba(0,229,255,0.20)') {
  const f = _nodes.flash;
  if (!f) return;
  f.style.background = color;
  f.style.opacity    = '1';
  f.style.transition = 'none';
  requestAnimationFrame(() => {
    f.style.transition = 'opacity 0.15s ease';
    f.style.opacity    = '0';
  });
}

function _shakeScreen() {
  const r = _nodes.root;
  if (!r) return;
  r.style.animation = 'none';
  // Force reflow
  void r.offsetWidth;
  r.style.animation = 'ss-shake 0.4s ease';
}

function _scorePopAt(x, y) {
  const pop = document.createElement('div');
  pop.textContent  = '+1';
  pop.style.cssText = `
    position: fixed;
    left: ${x}px;
    top:  ${y}px;
    transform: translate(-50%, -50%);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px;
    color: #AAFF00;
    pointer-events: none;
    z-index: 9999;
    animation: ss-score-pop 0.6s ease forwards;
  `;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 620);
}

function _showWin() {
  const ov = _nodes.winOverlay;
  if (!ov) return;
  ov.style.display = 'flex';
  void ov.offsetWidth;
  ov.style.animation = 'ss-bounce-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
}

function _showFail() {
  const ov = _nodes.failOverlay;
  if (!ov) return;
  ov.style.display = 'flex';
  void ov.offsetWidth;
  ov.style.animation = 'ss-bounce-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
  _shakeScreen();
}

function _springBack(key) {
  const el  = _nodes.shapes[key];
  const org = _nodes.origins[key];
  if (!el || !org) return;

  el.style.transition = 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), left 0.45s cubic-bezier(0.34,1.56,0.64,1), top 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s';
  el.style.opacity    = '1';
  el.style.transform  = 'scale(1)';
  el.style.left       = org.x + 'px';
  el.style.top        = org.y + 'px';

  _shakeScreen();
}

function _snapToTarget(key) {
  const shape  = _nodes.shapes[key];
  const target = _nodes.targets[key];
  if (!shape || !target) return;

  const tc = _getCenter(target);
  const size = 64;

  shape.style.transition = 'left 0.2s ease, top 0.2s ease, transform 0.2s ease, opacity 0.2s';
  shape.style.opacity    = '1';
  shape.style.transform  = 'scale(1)';
  shape.style.left       = (tc.x - size / 2) + 'px';
  shape.style.top        = (tc.y - size / 2) + 'px';

  target.style.borderColor  = '#AAFF00';
  target.style.boxShadow    = '0 0 18px #AAFF00, 0 0 40px rgba(170,255,0,0.35)';
  target.style.transition   = 'border-color 0.2s, box-shadow 0.2s';

  _nodes.matched[key] = true;
  _flashScreen();

  const tc2 = _getCenter(target);
  _scorePopAt(tc2.x, tc2.y);

  if (_nodes.matched.circle && _nodes.matched.square) {
    setTimeout(() => _resolve('win'), 300);
  }
}

// ─── Timer ────────────────────────────────────────────────────────

function _tickTimer(ts) {
  if (_resolved) return;
  if (!_startTime) _startTime = ts;

  const elapsed  = ts - _startTime;
  const progress = Math.min(elapsed / _duration, 1);
  const remaining = Math.max(0, _duration - elapsed);
  const secs     = Math.ceil(remaining / 1000);

  if (_nodes.timerBar) {
    _nodes.timerBar.style.transform = `scaleX(${1 - progress})`;
  }
  if (_nodes.timerCount) {
    _nodes.timerCount.textContent = secs;
  }

  // Urgency at ≤ 3 s
  if (remaining <= 3000) {
    if (_nodes.timerBar) {
      _nodes.timerBar.style.background = '#FFFFFF';
      _nodes.timerBar.style.animation  = 'ss-timer-pulse 0.5s ease-in-out infinite';
    }
  }

  if (progress >= 1) {
    _resolve('fail');
    return;
  }

  _timerRAF = requestAnimationFrame(_tickTimer);
}

// ─── Touch Drag Handlers ──────────────────────────────────────────

function _onTouchStart(e) {
  if (_resolved || _drag.active) return;

  const touch = e.touches[0];
  const el    = e.currentTarget;
  const key   = el.dataset.shape;

  if (_nodes.matched[key]) return;  // already locked in

  e.preventDefault();

  _drag.active   = true;
  _drag.shapeKey = key;
  _drag.el       = el;

  const rect   = el.getBoundingClientRect();
  _drag.offsetX = touch.clientX - rect.left;
  _drag.offsetY = touch.clientY - rect.top;

  el.style.transition = 'none';
  el.style.opacity    = '0.75';
  el.style.transform  = 'scale(1.1)';
  el.style.zIndex     = '200';
}

function _onTouchMove(e) {
  if (!_drag.active) return;
  e.preventDefault();

  const touch = e.touches[0];
  const x     = touch.clientX - _drag.offsetX;
  const y     = touch.clientY - _drag.offsetY;

  _drag.el.style.left = x + 'px';
  _drag.el.style.top  = y + 'px';
}

function _onTouchEnd(e) {
  if (!_drag.active) return;
  e.preventDefault();

  const key    = _drag.shapeKey;
  const el     = _drag.el;
  const target = _nodes.targets[key];

  _drag.active = false;
  el.style.zIndex = '100';

  // Check hit
  const shapeCtr  = _getCenter(el);
  const targetCtr = _getCenter(target);
  const hit       = _dist(shapeCtr, targetCtr) <= 44;

  if (hit) {
    _snapToTarget(key);
  } else {
    // Check if dropped on WRONG target
    const wrongKey    = key === 'circle' ? 'square' : 'circle';
    const wrongTarget = _nodes.targets[wrongKey];
    const wrongCtr    = _getCenter(wrongTarget);
    const wrongHit    = _dist(shapeCtr, wrongCtr) <= 44;

    if (wrongHit) {
      _shakeScreen();
    }
    _springBack(key);
  }

  _drag.el = null;
}

// ─── Build DOM ────────────────────────────────────────────────────

function _injectKeyframes() {
  if (document.getElementById('ss-drag-match-kf')) return;
  const style = document.createElement('style');
  style.id = 'ss-drag-match-kf';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500&display=swap');

    @keyframes ss-shake {
      0%,100% { transform: translateX(0); }
      20%     { transform: translateX(-8px); }
      40%     { transform: translateX(8px); }
      60%     { transform: translateX(-8px); }
      80%     { transform: translateX(8px); }
    }
    @keyframes ss-score-pop {
      0%   { transform: translate(-50%,-50%) scale(0.6); opacity: 1; }
      60%  { transform: translate(-50%,-100%) scale(1.1); opacity: 1; }
      100% { transform: translate(-50%,-160%) scale(0.9); opacity: 0; }
    }
    @keyframes ss-bounce-in {
      0%   { transform: translate(-50%,-50%) scale(0.3); opacity: 0; }
      70%  { transform: translate(-50%,-50%) scale(1.08); opacity: 1; }
      100% { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
    }
    @keyframes ss-pulse-glow {
      0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0,229,255,0); }
      50%     { transform: scale(1.15); box-shadow: 0 0 16px 6px rgba(0,229,255,0.45); }
    }
    @keyframes ss-hint-fade {
      0%   { opacity: 0.35; }
      80%  { opacity: 0.35; }
      100% { opacity: 0; }
    }
    @keyframes ss-bounce-appear {
      0%   { transform: scale(0.3); opacity: 0; }
      70%  { transform: scale(1.08); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes ss-timer-pulse {
      0%,100% { opacity: 1; }
      50%     { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}

function _buildUI() {
  _injectKeyframes();

  // ── Root wrapper ──────────────────────────────────────────────
  const root = document.createElement('div');
  root.style.cssText = `
    position: relative;
    width: 100%;
    height: 100%;
    background: #0A0A0F;
    overflow: hidden;
    font-family: 'DM Sans', sans-serif;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  `;
  _nodes.root = root;

  // ── Screen flash overlay ──────────────────────────────────────
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: absolute; inset: 0;
    pointer-events: none;
    z-index: 500;
    opacity: 0;
    background: rgba(0,229,255,0.2);
  `;
  _nodes.flash = flash;
  root.appendChild(flash);

  // ── Hint label ────────────────────────────────────────────────
  const hint = document.createElement('div');
  hint.textContent = 'DRAG TO MATCH';
  hint.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'DM Mono', 'DM Sans', monospace;
    font-size: 11px;
    letter-spacing: 1.5px;
    color: rgba(255,255,255,0.35);
    pointer-events: none;
    z-index: 10;
    white-space: nowrap;
    animation: ss-hint-fade 1.5s ease forwards;
  `;
  _nodes.hint = hint;
  root.appendChild(hint);

  // ── Vertical divider ─────────────────────────────────────────
  const divider = document.createElement('div');
  divider.style.cssText = `
    position: absolute;
    left: 50%;
    top: 15%;
    height: 70%;
    width: 1px;
    background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.1) 80%, transparent);
    pointer-events: none;
    z-index: 1;
  `;
  root.appendChild(divider);

  // ── HUD ───────────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.style.cssText = `
    position: absolute;
    top: 0; left: 0; right: 0;
    padding: 16px 16px 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    pointer-events: none;
    z-index: 300;
  `;

  // Hearts (CSS clip-path hearts)
  const heartsEl = document.createElement('div');
  heartsEl.style.cssText = 'display:flex;gap:6px;align-items:center;';
  for (let i = 0; i < 3; i++) {
    const h = document.createElement('div');
    h.style.cssText = `
      width: 22px; height: 20px;
      background: #FF3B5C;
      clip-path: path('M11 18.5C11 18.5 2 13 2 7.5A5 5 0 0 1 12 5.5A5 5 0 0 1 22 7.5C22 13 13 18.5 11 18.5Z');
      /* Simpler heart via clip-path polygon approximation */
    `;
    // Use a reliable heart shape via SVG inline mask or just a styled div
    h.style.cssText = `
      width: 20px; height: 20px;
      background: #FF3B5C;
      position: relative;
      transform: rotate(-45deg);
      border-radius: 2px 0 2px 2px;
    `;
    const before = document.createElement('div');
    before.style.cssText = `
      content:'';
      position:absolute;
      width:20px; height:20px;
      background:#FF3B5C;
      border-radius:50% 50% 0 0;
      top:-10px; left:0;
    `;
    const after = document.createElement('div');
    after.style.cssText = `
      content:'';
      position:absolute;
      width:20px; height:20px;
      background:#FF3B5C;
      border-radius:50% 50% 0 0;
      top:0; left:10px;
    `;
    h.appendChild(before);
    h.appendChild(after);
    heartsEl.appendChild(h);
  }
  hud.appendChild(heartsEl);

  // Streak
  const streakWrap = document.createElement('div');
  streakWrap.style.cssText = 'text-align:right;display:flex;flex-direction:column;align-items:flex-end;';
  const streakLabel = document.createElement('div');
  streakLabel.textContent = 'STREAK';
  streakLabel.style.cssText = `
    font-family: 'DM Sans', monospace;
    font-size: 9px;
    color: rgba(255,255,255,0.4);
    letter-spacing: 1px;
  `;
  const streakNum = document.createElement('div');
  streakNum.textContent = '0';
  streakNum.style.cssText = `
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px;
    color: #FFFFFF;
    line-height: 1;
  `;
  streakWrap.appendChild(streakLabel);
  streakWrap.appendChild(streakNum);
  hud.appendChild(streakWrap);
  root.appendChild(hud);

  // ── Timer bar ─────────────────────────────────────────────────
  const timerWrap = document.createElement('div');
  timerWrap.style.cssText = `
    position: absolute;
    bottom: 0; left: 0; right: 0;
    padding: 0 0 env(safe-area-inset-bottom, 0);
    pointer-events: none;
    z-index: 300;
  `;
  const timerTrack = document.createElement('div');
  timerTrack.style.cssText = `
    width: 100%; height: 4px;
    background: #1C1C2E;
    overflow: visible;
    position: relative;
  `;
  const timerBar = document.createElement('div');
  timerBar.style.cssText = `
    position: absolute;
    left: 0; top: 0;
    width: 100%; height: 100%;
    background: #FF3B5C;
    transform-origin: left center;
    transform: scaleX(1);
    transition: none;
  `;
  const timerCount = document.createElement('div');
  timerCount.textContent = '10';
  timerCount.style.cssText = `
    width: 100%;
    text-align: center;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px;
    color: #FFFFFF;
    padding: 4px 0 8px;
  `;
  timerTrack.appendChild(timerBar);
  timerWrap.appendChild(timerTrack);
  timerWrap.appendChild(timerCount);
  root.appendChild(timerWrap);

  _nodes.hud        = hud;
  _nodes.timerBar   = timerBar;
  _nodes.timerCount = timerCount;

  // ── Game area ─────────────────────────────────────────────────
  // Measured in percentages so it adapts to any container size.
  // Left column = shapes, right column = targets.
  // We use fixed positioning relative to the container to allow
  // free-position dragging.

  const SHAPE_SIZE  = 64;
  const containerH  = _container.offsetHeight || window.innerHeight;
  const containerW  = _container.offsetWidth  || Math.min(window.innerWidth, 390);

  const midX   = containerW / 2;
  const midY   = containerH / 2;

  // Shape origins (left side, vertically centred ±80px)
  const shapeOrigins = {
    circle: { x: midX / 2 - SHAPE_SIZE / 2, y: midY - 90 },
    square: { x: midX / 2 - SHAPE_SIZE / 2, y: midY + 26 },
  };
  // Target positions (right side, mirror)
  const targetPos = {
    circle: { x: midX + midX / 2 - SHAPE_SIZE / 2, y: midY - 90 },
    square: { x: midX + midX / 2 - SHAPE_SIZE / 2, y: midY + 26 },
  };

  _nodes.origins = shapeOrigins;

  // ── Shapes ────────────────────────────────────────────────────
  const shapeConfigs = [
    { key: 'circle', color: '#00E5FF', radius: '50%' },
    { key: 'square', color: '#FF3B5C', radius: '10px' },
  ];

  shapeConfigs.forEach(({ key, color, radius }) => {
    const el = document.createElement('div');
    const org = shapeOrigins[key];
    el.dataset.shape = key;
    el.style.cssText = `
      position: absolute;
      left:   ${org.x}px;
      top:    ${org.y}px;
      width:  ${SHAPE_SIZE}px;
      height: ${SHAPE_SIZE}px;
      background: ${color};
      border-radius: ${radius};
      z-index: 100;
      cursor: grab;
      touch-action: none;
      animation: ss-pulse-glow 1.2s ease-in-out infinite, ss-bounce-appear 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
      animation-delay: 0s, ${key === 'square' ? '0.12s' : '0s'};
      box-shadow: 0 0 0 0 ${color};
      will-change: transform, left, top;
    `;

    el.addEventListener('touchstart', _onTouchStart, { passive: false });
    el.addEventListener('touchmove',  _onTouchMove,  { passive: false });
    el.addEventListener('touchend',   _onTouchEnd,   { passive: false });

    root.appendChild(el);
    _nodes.shapes[key] = el;
  });

  // ── Targets ───────────────────────────────────────────────────
  const targetConfigs = [
    { key: 'circle', radius: '50%' },
    { key: 'square', radius: '10px' },
  ];

  targetConfigs.forEach(({ key, radius }) => {
    const el  = document.createElement('div');
    const pos = targetPos[key];
    el.style.cssText = `
      position: absolute;
      left:   ${pos.x}px;
      top:    ${pos.y}px;
      width:  ${SHAPE_SIZE}px;
      height: ${SHAPE_SIZE}px;
      border: 2px dashed rgba(255,255,255,0.25);
      border-radius: ${radius};
      background: transparent;
      z-index: 5;
      pointer-events: none;
      animation: ss-bounce-appear 0.4s cubic-bezier(0.34,1.56,0.64,1) ${key === 'square' ? '0.18s' : '0.06s'} both;
    `;
    root.appendChild(el);
    _nodes.targets[key] = el;
  });

  // ── Labels under shapes and targets ──────────────────────────
  [
    { key: 'circle', side: 'shape' },
    { key: 'square', side: 'shape' },
    { key: 'circle', side: 'target' },
    { key: 'square', side: 'target' },
  ].forEach(({ key, side }) => {
    const label = document.createElement('div');
    const isShape  = side === 'shape';
    const pos      = isShape ? shapeOrigins[key] : targetPos[key];
    label.textContent = key.toUpperCase();
    label.style.cssText = `
      position: absolute;
      left:  ${pos.x}px;
      top:   ${pos.y + SHAPE_SIZE + 8}px;
      width: ${SHAPE_SIZE}px;
      text-align: center;
      font-family: 'DM Sans', sans-serif;
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      pointer-events: none;
      letter-spacing: 0.5px;
      z-index: 2;
    `;
    root.appendChild(label);
  });

  // ── Win overlay ───────────────────────────────────────────────
  const winOv = document.createElement('div');
  winOv.style.cssText = `
    display: none;
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%,-50%);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 88px;
    color: #AAFF00;
    white-space: nowrap;
    pointer-events: none;
    z-index: 800;
    text-shadow: 0 0 40px rgba(170,255,0,0.7);
  `;
  winOv.textContent = 'NICE! 🔥';
  _nodes.winOverlay = winOv;
  root.appendChild(winOv);

  // ── Fail overlay ──────────────────────────────────────────────
  const failOv = document.createElement('div');
  failOv.style.cssText = `
    display: none;
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%,-50%);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 80px;
    color: #FF3B5C;
    white-space: nowrap;
    pointer-events: none;
    z-index: 800;
    text-shadow: 0 0 30px rgba(255,59,92,0.7);
  `;
  failOv.textContent = 'FAILED ✗';
  _nodes.failOverlay = failOv;
  root.appendChild(failOv);

  // ── Mount ─────────────────────────────────────────────────────
  _container.appendChild(root);
}

// ─── Public API ───────────────────────────────────────────────────

export function init(container, onWin, onFail) {
  // Reset all state
  _container  = container;
  _onWin      = onWin;
  _onFail     = onFail;
  _resolved   = false;
  _startTime  = null;
  _drag.active = false;
  _nodes.matched.circle = false;
  _nodes.matched.square = false;

  // Prevent double-tap zoom on iOS
  container.style.touchAction = 'none';

  _buildUI();

  // Start timer on next frame so layout is settled
  _timerRAF = requestAnimationFrame(_tickTimer);
}

export function destroy() {
  // Cancel timer
  cancelAnimationFrame(_timerRAF);
  clearTimeout(_hintTimeout);

  // Remove touch listeners from shapes
  Object.values(_nodes.shapes).forEach(el => {
    el.removeEventListener('touchstart', _onTouchStart);
    el.removeEventListener('touchmove',  _onTouchMove);
    el.removeEventListener('touchend',   _onTouchEnd);
  });

  // Remove injected keyframes style tag
  const kf = document.getElementById('ss-drag-match-kf');
  if (kf) kf.remove();

  // Wipe the container
  if (_nodes.root && _nodes.root.parentNode) {
    _nodes.root.parentNode.removeChild(_nodes.root);
  }

  // Nullify all refs
  _container    = null;
  _onWin        = null;
  _onFail       = null;
  _nodes.root   = null;
  _nodes.timerBar   = null;
  _nodes.timerCount = null;
  _nodes.hint   = null;
  _nodes.flash  = null;
  _nodes.winOverlay  = null;
  _nodes.failOverlay = null;
  Object.keys(_nodes.shapes).forEach(k => { _nodes.shapes[k] = null; });
  Object.keys(_nodes.targets).forEach(k => { _nodes.targets[k] = null; });
  Object.keys(_nodes.origins).forEach(k => { _nodes.origins[k] = null; });
  _drag.active  = false;
  _drag.el      = null;
}

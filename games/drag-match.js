// ─────────────────────────────────────────────────────────────────
//  ScrollStrike · Drag Match mini-game
//  File: games/drag-match.js
// ─────────────────────────────────────────────────────────────────

import { setGameInstruction, clearGameInstruction } from '/game-engine.js';

let _container   = null;
let _onWin       = null;
let _onFail      = null;
let _timerRAF    = null;
let _startTime   = null;
let _duration    = 10000; // 10 s
let _resolved    = false;

// Per-shape drag state
const _drag = {
  active:    false,
  shapeKey:  null,
  el:        null,
  offsetX:   0,
  offsetY:   0,
};

// DOM node refs
const _nodes = {
  root:         null,
  timerBar:     null,
  timerCount:   null,
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

  const tc   = _getCenter(target);
  const size = 64;

  shape.style.transition = 'left 0.2s ease, top 0.2s ease, transform 0.2s ease, opacity 0.2s';
  shape.style.opacity    = '1';
  shape.style.transform  = 'scale(1)';
  shape.style.left       = (tc.x - size / 2) + 'px';
  shape.style.top        = (tc.y - size / 2) + 'px';

  target.style.borderColor = '#AAFF00';
  target.style.boxShadow   = '0 0 18px #AAFF00, 0 0 40px rgba(170,255,0,0.35)';
  target.style.transition  = 'border-color 0.2s, box-shadow 0.2s';

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

  const elapsed   = ts - _startTime;
  const progress  = Math.min(elapsed / _duration, 1);
  const remaining = Math.max(0, _duration - elapsed);
  const secs      = Math.ceil(remaining / 1000);

  if (_nodes.timerBar) {
    _nodes.timerBar.style.transform = `scaleX(${1 - progress})`;
  }
  if (_nodes.timerCount) {
    _nodes.timerCount.textContent = secs;
  }

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

  if (_nodes.matched[key]) return;

  e.preventDefault();

  _drag.active   = true;
  _drag.shapeKey = key;
  _drag.el       = el;

  const rect    = el.getBoundingClientRect();
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

  const shapeCtr  = _getCenter(el);
  const targetCtr = _getCenter(target);
  const hit       = _dist(shapeCtr, targetCtr) <= 44;

  if (hit) {
    _snapToTarget(key);
  } else {
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

  _nodes.timerBar   = timerBar;
  _nodes.timerCount = timerCount;

  // ── Layout measurements ───────────────────────────────────────
  const SHAPE_SIZE  = 64;
  const containerH  = _container.offsetHeight || window.innerHeight;
  const containerW  = _container.offsetWidth  || Math.min(window.innerWidth, 390);

  const midX = containerW / 2;
  // Shift vertically down slightly to avoid the #game-instruction label
  const midY = containerH / 2 + 20;

  const shapeOrigins = {
    circle: { x: midX / 2 - SHAPE_SIZE / 2, y: midY - 80 },
    square: { x: midX / 2 - SHAPE_SIZE / 2, y: midY + 36 },
  };
  const targetPos = {
    circle: { x: midX + midX / 2 - SHAPE_SIZE / 2, y: midY - 80 },
    square: { x: midX + midX / 2 - SHAPE_SIZE / 2, y: midY + 36 },
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
    { key: 'circle', pos: shapeOrigins.circle },
    { key: 'square', pos: shapeOrigins.square },
    { key: 'circle', pos: targetPos.circle },
    { key: 'square', pos: targetPos.square },
  ].forEach(({ key, pos }) => {
    const label = document.createElement('div');
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
  _container  = container;
  _onWin      = onWin;
  _onFail     = onFail;
  _resolved   = false;
  _startTime  = null;
  _drag.active = false;
  _nodes.matched.circle = false;
  _nodes.matched.square = false;

  container.style.touchAction = 'none';

  _buildUI();
  setGameInstruction('DRAG TO MATCH');

  // Start timer on next frame so layout is settled
  _timerRAF = requestAnimationFrame(_tickTimer);
}

export function destroy() {
  clearGameInstruction();
  cancelAnimationFrame(_timerRAF);

  Object.values(_nodes.shapes).forEach(el => {
    if (!el) return;
    el.removeEventListener('touchstart', _onTouchStart);
    el.removeEventListener('touchmove',  _onTouchMove);
    el.removeEventListener('touchend',   _onTouchEnd);
  });

  if (_nodes.root && _nodes.root.parentNode) {
    _nodes.root.parentNode.removeChild(_nodes.root);
  }

  _container    = null;
  _onWin        = null;
  _onFail       = null;
  _nodes.root         = null;
  _nodes.timerBar     = null;
  _nodes.timerCount   = null;
  _nodes.flash        = null;
  _nodes.winOverlay   = null;
  _nodes.failOverlay  = null;
  Object.keys(_nodes.shapes).forEach(k  => { _nodes.shapes[k]  = null; });
  Object.keys(_nodes.targets).forEach(k => { _nodes.targets[k] = null; });
  Object.keys(_nodes.origins).forEach(k => { _nodes.origins[k] = null; });
  _drag.active = false;
  _drag.el     = null;
}

// ─────────────────────────────────────────────────────────────────
//  ScrollStrike · Drag Match mini-game
//  File: games/drag-match.js
// ─────────────────────────────────────────────────────────────────

import { setGameInstruction, clearGameInstruction } from '/game-engine.js';

let _container  = null;
let _onWin      = null;
let _onFail     = null;
let _timerRAF   = null;
let _startTime  = null;
const _duration = 10000;
let _resolved   = false;

const _drag = {
  active:   false,
  shapeKey: null,
  el:       null,
  // offset from the shape's top-left corner to the touch point (container space)
  offsetX:  0,
  offsetY:  0,
};

const _nodes = {
  root:       null,
  timerBar:   null,
  timerCount: null,
  flash:      null,
  shapes:     {},   // key → DOM element
  targets:    {},   // key → DOM element
};

// Stored positions in container-local coordinates (top-left of each element)
const _origins  = {};   // key → { x, y }
const _targetPos = {};  // key → { x, y }  (top-left, container space)
const _matched  = { circle: false, square: false };

const SHAPE_SIZE    = 64;   // px — shapes AND targets are exactly this
const HIT_RADIUS    = 60;   // px — centre-to-centre drop detection

// ─── Coordinate helpers ───────────────────────────────────────────

/**
 * Return the centre of an absolutely-positioned element in CONTAINER space.
 * el.style.left / el.style.top are already container-local, so we read them
 * directly — no getBoundingClientRect() mixing of coordinate spaces.
 */
function _centerOfEl(el) {
  return {
    x: parseFloat(el.style.left) + SHAPE_SIZE / 2,
    y: parseFloat(el.style.top)  + SHAPE_SIZE / 2,
  };
}

function _dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ─── Resolve ──────────────────────────────────────────────────────

function _resolve(type) {
  if (_resolved) return;
  _resolved = true;
  cancelAnimationFrame(_timerRAF);

  if (type === 'win') {
    setTimeout(() => _onWin && _onWin(), 800);
  } else {
    _shakeScreen();
    setTimeout(() => _onFail && _onFail(), 1200);
  }
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

function _scorePopAt(containerX, containerY) {
  // Convert container-local coords to viewport coords for the fixed overlay
  const rect = _container.getBoundingClientRect();
  const vx   = rect.left + containerX;
  const vy   = rect.top  + containerY;

  const pop = document.createElement('div');
  pop.textContent = '+1';
  pop.style.cssText = `
    position: fixed;
    left: ${vx}px; top: ${vy}px;
    transform: translate(-50%, -50%);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px; color: #AAFF00;
    pointer-events: none; z-index: 9999;
    animation: ss-score-pop 0.6s ease forwards;
  `;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 620);
}

function _springBack(key) {
  const el  = _nodes.shapes[key];
  const org = _origins[key];
  if (!el || !org) return;

  el.style.transition = 'left 0.45s cubic-bezier(0.34,1.56,0.64,1), top 0.45s cubic-bezier(0.34,1.56,0.64,1), transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s';
  el.style.opacity    = '1';
  el.style.transform  = 'scale(1)';
  el.style.left       = org.x + 'px';
  el.style.top        = org.y + 'px';

  _shakeScreen();
}

/**
 * Snap shape to be perfectly centred inside its target outline.
 * Target top-left is _targetPos[key]; shape top-left must equal that
 * exactly — both are SHAPE_SIZE × SHAPE_SIZE, so top-lefts align perfectly.
 */
function _snapToTarget(key) {
  const shape  = _nodes.shapes[key];
  const target = _nodes.targets[key];
  if (!shape || !target) return;

  const tx = _targetPos[key].x;
  const ty = _targetPos[key].y;

  shape.style.transition = 'left 0.2s ease, top 0.2s ease, transform 0.2s ease, opacity 0.2s';
  shape.style.opacity    = '1';
  shape.style.transform  = 'scale(1)';
  shape.style.left       = tx + 'px';
  shape.style.top        = ty + 'px';
  shape.style.zIndex     = '10';   // sit on top of target outline

  target.style.borderColor = '#AAFF00';
  target.style.boxShadow   = '0 0 18px #AAFF00, 0 0 40px rgba(170,255,0,0.35)';
  target.style.transition  = 'border-color 0.2s, box-shadow 0.2s';

  _matched[key] = true;
  _flashScreen();

  // Score pop appears at the centre of the target (container coords)
  const cx = tx + SHAPE_SIZE / 2;
  const cy = ty + SHAPE_SIZE / 2;
  _scorePopAt(cx, cy);

  if (_matched.circle && _matched.square) {
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

  if (_nodes.timerBar)   _nodes.timerBar.style.transform   = `scaleX(${1 - progress})`;
  if (_nodes.timerCount) _nodes.timerCount.textContent     = secs;

  if (remaining <= 3000 && _nodes.timerBar) {
    _nodes.timerBar.style.background = '#FFFFFF';
    _nodes.timerBar.style.animation  = 'ss-timer-pulse 0.5s ease-in-out infinite';
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

  const touch   = e.touches[0];
  const el      = e.currentTarget;
  const key     = el.dataset.shape;

  if (_matched[key]) return;
  e.preventDefault();

  // Convert viewport touch coords → container-local coords
  const rect    = _container.getBoundingClientRect();
  const localX  = touch.clientX - rect.left;
  const localY  = touch.clientY - rect.top;

  // Offset = touch position relative to shape's top-left corner
  _drag.offsetX  = localX - parseFloat(el.style.left);
  _drag.offsetY  = localY - parseFloat(el.style.top);

  _drag.active   = true;
  _drag.shapeKey = key;
  _drag.el       = el;

  el.style.transition = 'none';
  el.style.opacity    = '0.85';
  el.style.transform  = 'scale(1.08)';
  el.style.zIndex     = '200';
}

function _onTouchMove(e) {
  if (!_drag.active) return;
  e.preventDefault();

  const touch  = e.touches[0];
  const rect   = _container.getBoundingClientRect();

  // Keep shape top-left such that the touch point stays at offsetX/Y inside it
  const newLeft = (touch.clientX - rect.left) - _drag.offsetX;
  const newTop  = (touch.clientY - rect.top)  - _drag.offsetY;

  _drag.el.style.left = newLeft + 'px';
  _drag.el.style.top  = newTop  + 'px';
}

function _onTouchEnd(e) {
  if (!_drag.active) return;
  e.preventDefault();

  const key    = _drag.shapeKey;
  const el     = _drag.el;

  _drag.active = false;
  el.style.zIndex = '100';

  // All centres in container-local space
  const shapeCtr     = _centerOfEl(el);
  const ownTargetCtr = {
    x: _targetPos[key].x + SHAPE_SIZE / 2,
    y: _targetPos[key].y + SHAPE_SIZE / 2,
  };

  if (_dist(shapeCtr, ownTargetCtr) <= HIT_RADIUS) {
    _snapToTarget(key);
  } else {
    // Check if accidentally dropped onto the wrong target
    const wrongKey = key === 'circle' ? 'square' : 'circle';
    const wrongCtr = {
      x: _targetPos[wrongKey].x + SHAPE_SIZE / 2,
      y: _targetPos[wrongKey].y + SHAPE_SIZE / 2,
    };
    if (_dist(shapeCtr, wrongCtr) <= HIT_RADIUS) {
      _shakeScreen();
    }
    _springBack(key);
  }

  _drag.el = null;
}

// ─── Keyframes ────────────────────────────────────────────────────

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
    @keyframes ss-pulse-glow {
      0%,100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
      50%     { box-shadow: 0 0 16px 6px rgba(0,229,255,0.45); }
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

// ─── Build DOM ────────────────────────────────────────────────────

function _buildUI() {
  _injectKeyframes();

  const root = document.createElement('div');
  root.style.cssText = `
    position: relative; width: 100%; height: 100%;
    background: #0A0A0F; overflow: hidden;
    font-family: 'DM Sans', sans-serif;
    touch-action: none; user-select: none; -webkit-user-select: none;
  `;
  _nodes.root = root;

  // Screen flash overlay
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: absolute; inset: 0;
    pointer-events: none; z-index: 500; opacity: 0;
    background: rgba(0,229,255,0.2);
  `;
  _nodes.flash = flash;
  root.appendChild(flash);

  // Vertical divider
  const divider = document.createElement('div');
  divider.style.cssText = `
    position: absolute; left: 50%; top: 0; height: 100%; width: 1px;
    background: linear-gradient(to bottom, transparent,
      rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent);
    pointer-events: none; z-index: 1;
  `;
  root.appendChild(divider);

  // Timer bar
  const timerWrap  = document.createElement('div');
  timerWrap.style.cssText = `
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 0 0 env(safe-area-inset-bottom, 0);
    pointer-events: none; z-index: 300;
  `;
  const timerTrack = document.createElement('div');
  timerTrack.style.cssText = `
    width: 100%; height: 4px; background: #1C1C2E;
    overflow: visible; position: relative;
  `;
  const timerBar = document.createElement('div');
  timerBar.style.cssText = `
    position: absolute; left: 0; top: 0;
    width: 100%; height: 100%; background: #FF3B5C;
    transform-origin: left center; transform: scaleX(1);
  `;
  const timerCount = document.createElement('div');
  timerCount.textContent = '10';
  timerCount.style.cssText = `
    width: 100%; text-align: center;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px; color: #FFFFFF;
    padding: 4px 0 8px;
  `;
  timerTrack.appendChild(timerBar);
  timerWrap.appendChild(timerTrack);
  timerWrap.appendChild(timerCount);
  root.appendChild(timerWrap);

  _nodes.timerBar   = timerBar;
  _nodes.timerCount = timerCount;

  // ── Layout maths ──────────────────────────────────────────────
  // All positions are in container-local pixels (top-left origin).
  // Safe zone: top 20% → bottom 20% excluded → usable middle 60%.
  const cH   = _container.offsetHeight || window.innerHeight;
  const cW   = _container.offsetWidth  || Math.min(window.innerWidth, 390);

  const safeTop    = cH * 0.20;
  const safeHeight = cH * 0.60;          // middle 60%
  const midY       = safeTop + safeHeight / 2;   // vertical midpoint of safe zone

  const halfW      = cW / 2;
  const shapeColCX = halfW * 0.5;        // centre of left column
  const targetColCX = halfW + halfW * 0.5; // centre of right column

  const SPACING    = SHAPE_SIZE + 24;    // gap between circle row and square row

  // Top-left positions (shapes and targets share identical SHAPE_SIZE)
  _origins['circle']   = { x: shapeColCX  - SHAPE_SIZE / 2, y: midY - SPACING / 2 - SHAPE_SIZE / 2 };
  _origins['square']   = { x: shapeColCX  - SHAPE_SIZE / 2, y: midY + SPACING / 2 - SHAPE_SIZE / 2 };
  _targetPos['circle'] = { x: targetColCX - SHAPE_SIZE / 2, y: midY - SPACING / 2 - SHAPE_SIZE / 2 };
  _targetPos['square'] = { x: targetColCX - SHAPE_SIZE / 2, y: midY + SPACING / 2 - SHAPE_SIZE / 2 };

  // ── Draw target outlines first (low z-index) ──────────────────
  const targetCfg = [
    { key: 'circle', radius: '50%' },
    { key: 'square', radius: '10px' },
  ];
  targetCfg.forEach(({ key, radius }, i) => {
    const el  = document.createElement('div');
    const pos = _targetPos[key];
    el.style.cssText = `
      position: absolute;
      left:   ${pos.x}px;
      top:    ${pos.y}px;
      width:  ${SHAPE_SIZE}px;
      height: ${SHAPE_SIZE}px;
      border: 2px dashed rgba(255,255,255,0.25);
      border-radius: ${radius};
      background: transparent;
      z-index: 5; pointer-events: none;
      box-sizing: border-box;
      animation: ss-bounce-appear 0.4s cubic-bezier(0.34,1.56,0.64,1)
                 ${i * 0.08}s both;
    `;
    root.appendChild(el);
    _nodes.targets[key] = el;
  });

  // ── Draw draggable shapes ─────────────────────────────────────
  const shapeCfg = [
    { key: 'circle', color: '#00E5FF', radius: '50%',  delay: '0s' },
    { key: 'square', color: '#FF3B5C', radius: '10px', delay: '0.12s' },
  ];
  shapeCfg.forEach(({ key, color, radius, delay }) => {
    const el  = document.createElement('div');
    const org = _origins[key];
    el.dataset.shape = key;
    el.style.cssText = `
      position: absolute;
      left:   ${org.x}px;
      top:    ${org.y}px;
      width:  ${SHAPE_SIZE}px;
      height: ${SHAPE_SIZE}px;
      background: ${color};
      border-radius: ${radius};
      box-sizing: border-box;
      z-index: 100; touch-action: none;
      animation: ss-pulse-glow 1.2s ease-in-out infinite,
                 ss-bounce-appear 0.4s cubic-bezier(0.34,1.56,0.64,1) ${delay} both;
      will-change: transform, left, top;
    `;
    el.addEventListener('touchstart', _onTouchStart, { passive: false });
    el.addEventListener('touchmove',  _onTouchMove,  { passive: false });
    el.addEventListener('touchend',   _onTouchEnd,   { passive: false });
    root.appendChild(el);
    _nodes.shapes[key] = el;
  });

  // ── Column labels ─────────────────────────────────────────────
  const labelCfg = [
    { text: 'DRAG', x: shapeColCX,   y: safeTop + safeHeight * 0.82 },
    { text: 'DROP', x: targetColCX,  y: safeTop + safeHeight * 0.82 },
  ];
  labelCfg.forEach(({ text, x, y }) => {
    const label = document.createElement('div');
    label.textContent = text;
    label.style.cssText = `
      position: absolute;
      left: ${x - 30}px; top: ${y}px;
      width: 60px; text-align: center;
      font-family: 'DM Mono', monospace;
      font-size: 9px; letter-spacing: 1.5px;
      color: rgba(255,255,255,0.25);
      pointer-events: none; z-index: 2;
    `;
    root.appendChild(label);
  });

  _container.appendChild(root);
}

// ─── Public API ───────────────────────────────────────────────────

export function init(container, onWin, onFail) {
  _container = container;
  _onWin     = onWin;
  _onFail    = onFail;
  _resolved  = false;
  _startTime = null;

  _drag.active   = false;
  _drag.el       = null;
  _matched.circle = false;
  _matched.square = false;

  // Clear node refs
  _nodes.shapes  = {};
  _nodes.targets = {};

  container.style.touchAction = 'none';

  _buildUI();
  setGameInstruction('DRAG SHAPES TO MATCHING OUTLINES');

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

  _container        = null;
  _onWin            = null;
  _onFail           = null;
  _nodes.root       = null;
  _nodes.timerBar   = null;
  _nodes.timerCount = null;
  _nodes.flash      = null;
  _nodes.shapes     = {};
  _nodes.targets    = {};
  _drag.active      = false;
  _drag.el          = null;
}
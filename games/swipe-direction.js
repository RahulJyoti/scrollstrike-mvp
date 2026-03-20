// ScrollStrike — Swipe Direction Mini Game
// games/swipe-direction.js

import { setGameInstruction, clearGameInstruction } from '/game-engine.js';

// ─── Module state ────────────────────────────────────────────────────────────
let _container  = null;
let _onWin      = null;
let _onFail     = null;
let _timers     = [];
let _listeners  = [];

let _score      = 0;
let _strikes    = 0;
let _finished   = false;
let _accepting  = true;

let _currentDir = null;
let _touchStart = null;

let _arrowEl    = null;
let _circleEl   = null;
let _scoreEl    = null;
let _strikesEl  = null;

const WIN_TARGET  = 4;
const MAX_STRIKES = 2;
const GAME_SECS   = 10;
const MIN_SWIPE   = 50;

// Bug 2: safe zone — arrow circle must live in middle 60%
const SAFE_TOP_PCT = 0.20;
const SAFE_BOT_PCT = 0.20;

const ARROWS = { left: '←', up: '↑', right: '→', down: '↓' };
const DIRS   = Object.keys(ARROWS);

// ─── Public API ──────────────────────────────────────────────────────────────
export function init(container, onWin, onFail) {
  _container = container;
  _onWin     = onWin;
  _onFail    = onFail;
  _score     = 0;
  _strikes   = 0;
  _finished  = false;
  _accepting = true;
  _timers    = [];
  _listeners = [];

  _buildDOM();
  _startArrow();
  _startTimer();
  setGameInstruction('SWIPE THE DIRECTION');
}

export function destroy() {
  clearGameInstruction();
  _timers.forEach(id => { clearTimeout(id); clearInterval(id); });
  _timers = [];
  _listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
  _listeners = [];
  if (_container) _container.innerHTML = '';
  _container = _arrowEl = _circleEl = _scoreEl = _strikesEl = null;
}

// ─── DOM construction ────────────────────────────────────────────────────────
function _buildDOM() {
  _container.innerHTML = '';
  _container.style.cssText = `
    position: relative;
    width: 100%;
    height: 100%;
    background: #0A0A0F;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  `;

  // Bug 2: push circle into the safe zone by clamping its vertical position.
  // We override the flex centering with an absolute position calculated after
  // the container renders.
  _container.style.justifyContent = 'flex-start';

  if (!document.getElementById('sd-keyframes')) {
    const style = document.createElement('style');
    style.id = 'sd-keyframes';
    style.textContent = `
      @keyframes sd-pulse {
        0%, 100% { transform: scale(1);    box-shadow: 0 0 0px rgba(0,229,255,0); }
        50%       { transform: scale(1.15); box-shadow: 0 0 22px rgba(0,229,255,0.35); }
      }
      @keyframes sd-bounce-in {
        0%   { transform: scale(0.3); opacity: 0; }
        60%  { transform: scale(1.12); opacity: 1; }
        80%  { transform: scale(0.93); }
        100% { transform: scale(1); }
      }
      @keyframes sd-shake {
        0%,100% { transform: translateX(0); }
        15%     { transform: translateX(-8px); }
        30%     { transform: translateX( 8px); }
        45%     { transform: translateX(-8px); }
        60%     { transform: translateX( 8px); }
        75%     { transform: translateX(-8px); }
        90%     { transform: translateX( 8px); }
      }
      @keyframes sd-flash-correct {
        0%   { opacity: 1; }
        50%  { opacity: 0.7; background: rgba(0,229,255,0.2); }
        100% { opacity: 1; background: transparent; }
      }
      @keyframes sd-score-pop {
        0%   { transform: translateY(0);   opacity: 1; }
        100% { transform: translateY(-60px); opacity: 0; }
      }
      @keyframes sd-win-bounce {
        0%   { transform: scale(0.3); opacity: 0; }
        60%  { transform: scale(1.1); opacity: 1; }
        80%  { transform: scale(0.95); }
        100% { transform: scale(1); }
      }
      @keyframes sd-strike-pop {
        0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
        60%  { transform: scale(1.2) rotate(5deg); opacity: 1; }
        100% { transform: scale(1) rotate(0deg); opacity: 1; }
      }
      @keyframes sd-arrow-lime {
        0%   { color: #FFFFFF; text-shadow: none; }
        30%  { color: #AAFF00; text-shadow: 0 0 30px rgba(170,255,0,0.7); }
        100% { color: #FFFFFF; text-shadow: none; }
      }
      @keyframes sd-arrow-red {
        0%   { color: #FFFFFF; }
        30%  { color: #FF3B5C; text-shadow: 0 0 20px rgba(255,59,92,0.6); }
        100% { color: #FFFFFF; }
      }
      @keyframes sd-timer-pulse {
        0%,100% { opacity: 1; }
        50%     { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
  }

  // Score + strikes HUD (top-right of game area)
  const hudEl = document.createElement('div');
  hudEl.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    pointer-events: none;
    z-index: 10;
  `;

  _scoreEl = document.createElement('div');
  _scoreEl.style.cssText = `
    font-family: 'DM Sans', 'DM Mono', monospace;
    font-size: 12px;
    color: rgba(255,255,255,0.4);
    letter-spacing: 0.08em;
  `;
  _scoreEl.textContent = `0 / ${WIN_TARGET}`;

  _strikesEl = document.createElement('div');
  _strikesEl.style.cssText = `display: flex; gap: 5px; align-items: center;`;

  hudEl.appendChild(_scoreEl);
  hudEl.appendChild(_strikesEl);
  _container.appendChild(hudEl);
  _renderStrikes();

  // Bug 2: position circle in safe zone (middle 60% vertically)
  // We use absolute positioning so safe-zone maths is explicit.
  _circleEl = document.createElement('div');
  _circleEl.style.cssText = `
    position: absolute;
    width: 130px;
    height: 130px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    left: 50%;
    transform: translateX(-50%);
  `;

  // Vertically center within the safe zone after layout
  requestAnimationFrame(() => {
    if (!_container || !_circleEl) return;
    const h = _container.offsetHeight || 600;
    const safeTop = h * 0.20;
    const safeBot = h * 0.20;
    const midSafe = safeTop + (h - safeTop - safeBot) / 2 - 65; // 65 = half of 130px
    _circleEl.style.top = `${midSafe}px`;
  });

  _arrowEl = document.createElement('div');
  _arrowEl.style.cssText = `
    font-family: 'Bebas Neue', sans-serif;
    font-size: 96px;
    line-height: 1;
    color: #FFFFFF;
    will-change: transform, color;
    animation: sd-pulse 1.2s ease-in-out infinite;
  `;

  _circleEl.appendChild(_arrowEl);
  _container.appendChild(_circleEl);

  _addListener(_container, 'touchstart', _onTouchStart, { passive: true });
  _addListener(_container, 'touchend',   _onTouchEnd,   { passive: true });
  _addListener(_container, 'touchend',   _preventDoubleZoom);
}

// ─── Arrow logic ─────────────────────────────────────────────────────────────
function _startArrow(animate = false) {
  const dirs = DIRS.filter(d => d !== _currentDir);
  _currentDir = dirs[Math.floor(Math.random() * dirs.length)];
  _arrowEl.textContent = ARROWS[_currentDir];

  if (animate) {
    _arrowEl.style.animation = 'none';
    void _arrowEl.offsetWidth;
    _arrowEl.style.animation = 'sd-bounce-in 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards';
    _addTimer(setTimeout(() => {
      if (_arrowEl) _arrowEl.style.animation = 'sd-pulse 1.2s ease-in-out infinite';
    }, 450));
  }
}

// ─── Touch detection ─────────────────────────────────────────────────────────
function _onTouchStart(e) {
  if (!_accepting || _finished) return;
  const t = e.changedTouches[0];
  _touchStart = { x: t.clientX, y: t.clientY };
}

function _onTouchEnd(e) {
  if (!_accepting || _finished || !_touchStart) return;
  const t  = e.changedTouches[0];
  const dx = t.clientX - _touchStart.x;
  const dy = t.clientY - _touchStart.y;
  _touchStart = null;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx < MIN_SWIPE && absDy < MIN_SWIPE) return;

  let swiped;
  if (absDx >= absDy) {
    swiped = dx > 0 ? 'right' : 'left';
  } else {
    swiped = dy > 0 ? 'down' : 'up';
  }

  if (swiped === _currentDir) {
    _handleCorrect(t.clientX, t.clientY);
  } else {
    _handleWrong();
  }
}

let _lastTap = 0;
function _preventDoubleZoom(e) {
  const now = Date.now();
  if (now - _lastTap < 300) e.preventDefault();
  _lastTap = now;
}

// ─── Result handlers ──────────────────────────────────────────────────────────
function _handleCorrect(tapX, tapY) {
  if (_finished) return;
  _accepting = false;
  _score++;
  _scoreEl.textContent = `${_score} / ${WIN_TARGET}`;

  // Bug 3: correct sound
  if (window.SS_SOUND) window.SS_SOUND.correct();

  _arrowEl.style.animation = 'sd-arrow-lime 0.45s ease forwards';
  _flashScreen('rgba(0,229,255,0.18)');
  _spawnScorePop(tapX, tapY);

  if (_score >= WIN_TARGET) {
    _addTimer(setTimeout(() => _resolve(true), 300));
    return;
  }

  _addTimer(setTimeout(() => {
    if (!_finished) { _startArrow(true); _accepting = true; }
  }, 420));
}

function _handleWrong() {
  if (_finished) return;
  _accepting = false;
  _strikes++;
  _renderStrikes();

  // Bug 3: wrong sound
  if (window.SS_SOUND) window.SS_SOUND.wrong();

  _arrowEl.style.animation = 'sd-arrow-red 0.45s ease forwards';
  _shakeScreen();

  if (_strikes >= MAX_STRIKES) {
    _addTimer(setTimeout(() => _resolve(false), 400));
    return;
  }

  _addTimer(setTimeout(() => {
    if (!_finished) { _startArrow(true); _accepting = true; }
  }, 500));
}

// ─── Resolve ──────────────────────────────────────────────────────────────────
function _resolve(isWin) {
  if (_finished) return;
  _finished  = true;
  _accepting = false;

  if (isWin) {
    _addTimer(setTimeout(() => { if (_onWin) _onWin(); }, 800));
  } else {
    _addTimer(setTimeout(() => { if (_onFail) _onFail(); }, 1200));
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function _startTimer() {
  const start = Date.now();
  const tick = setInterval(() => {
    if (_finished) { clearInterval(tick); return; }
    const elapsed   = (Date.now() - start) / 1000;
    const remaining = GAME_SECS - elapsed;
    if (remaining <= 0) {
      clearInterval(tick);
      if (!_finished) _resolve(false);
    }
  }, 100);
  _addTimer(tick);
}

// ─── Visual helpers ───────────────────────────────────────────────────────────
function _renderStrikes() {
  if (!_strikesEl) return;
  _strikesEl.innerHTML = '';
  for (let i = 0; i < MAX_STRIKES; i++) {
    const mark = document.createElement('div');
    if (i < _strikes) {
      mark.style.cssText = `
        width: 14px; height: 14px;
        border-radius: 2px;
        background: #FF3B5C;
        animation: sd-strike-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        display: flex; align-items: center; justify-content: center;
        font-family: 'DM Sans', sans-serif;
        font-size: 10px; color: #0A0A0F; font-weight: 700;
      `;
      mark.textContent = '✕';
    } else {
      mark.style.cssText = `
        width: 14px; height: 14px;
        border-radius: 2px;
        border: 1.5px solid rgba(255,59,92,0.3);
        background: transparent;
      `;
    }
    _strikesEl.appendChild(mark);
  }
}

function _flashScreen(color) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: absolute; inset: 0;
    background: ${color}; pointer-events: none;
    z-index: 20; border-radius: inherit;
    animation: sd-flash-correct 0.15s ease forwards;
  `;
  _container.appendChild(flash);
  _addTimer(setTimeout(() => flash.remove(), 200));
}

function _shakeScreen() {
  if (!_container) return;
  _container.style.animation = 'none';
  void _container.offsetWidth;
  _container.style.animation = 'sd-shake 0.4s ease forwards';
  _addTimer(setTimeout(() => {
    if (_container) _container.style.animation = '';
  }, 420));
}

function _spawnScorePop(x, y) {
  if (!_container) return;
  const rect = _container.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.textContent = '+1';
  pop.style.cssText = `
    position: absolute;
    left: ${x - rect.left}px;
    top:  ${y - rect.top}px;
    transform: translate(-50%, -50%);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px; color: #AAFF00;
    pointer-events: none; z-index: 30;
    animation: sd-score-pop 0.6s ease forwards;
  `;
  _container.appendChild(pop);
  _addTimer(setTimeout(() => pop.remove(), 650));
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function _addTimer(id) { _timers.push(id); return id; }

function _addListener(el, type, fn, options) {
  el.addEventListener(type, fn, options);
  _listeners.push({ el, type, fn });
}
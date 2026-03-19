// games/dont-tap.js
// ScrollStrike — "Don't Tap" mini game module

import { setGameInstruction, clearGameInstruction } from '/game-engine.js';

let _container = null;
let _onWin = null;
let _onFail = null;
let _timerInterval = null;
let _failTimeout = null;
let _destroyed = false;
let _resolved = false;
let _touchHandlers = [];

// ─── Public API ───────────────────────────────────────────────────────────────

export function init(container, onWin, onFail) {
  _container = container;
  _onWin = onWin;
  _onFail = onFail;
  _destroyed = false;
  _resolved = false;
  _touchHandlers = [];

  _render();
  setGameInstruction('TAP THE GREEN ONE');
}

export function destroy() {
  clearGameInstruction();
  _destroyed = true;

  for (const { el, type, fn } of _touchHandlers) {
    el.removeEventListener(type, fn);
  }
  _touchHandlers = [];

  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  if (_failTimeout)   { clearTimeout(_failTimeout);    _failTimeout   = null; }

  if (_container) { _container.innerHTML = ''; _container = null; }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function _render() {
  _container.innerHTML = '';
  _container.style.position = 'relative';
  _container.style.overflow = 'hidden';
  _container.style.width    = '100%';
  _container.style.height   = '100%';
  _container.style.background = '#0A0A0F';

  _injectStyles();

  // Timer bar wrapper
  const timerWrap = document.createElement('div');
  timerWrap.className = 'dt-timer-wrap';

  const timerBar = document.createElement('div');
  timerBar.className = 'dt-timer-bar';

  const timerCount = document.createElement('div');
  timerCount.className = 'dt-timer-count';
  timerCount.textContent = '10';

  timerWrap.appendChild(timerBar);
  timerWrap.appendChild(timerCount);
  _container.appendChild(timerWrap);

  // Place circles
  const positions = _generatePositions(12, 48, 12);
  const greenIndex = Math.floor(Math.random() * 12);

  positions.forEach((pos, i) => {
    const isGreen = i === greenIndex;
    const circle = _createCircle(isGreen, pos, i);
    _container.appendChild(circle);
  });

  // Start countdown
  let elapsed = 0;
  const DURATION = 10000;
  const TICK = 100;

  _timerInterval = setInterval(() => {
    if (_destroyed) return;
    elapsed += TICK;
    const remaining = Math.max(0, DURATION - elapsed);
    const fraction = remaining / DURATION;

    timerBar.style.width = (fraction * 100) + '%';

    const secs = Math.ceil(remaining / 1000);
    timerCount.textContent = secs;

    if (remaining <= 3000) {
      timerBar.classList.add('dt-timer-urgent');
    }

    if (remaining <= 0) {
      clearInterval(_timerInterval);
      _timerInterval = null;
      _triggerFail(null);
    }
  }, TICK);
}

// ─── Circle factory ───────────────────────────────────────────────────────────

function _createCircle(isGreen, pos, index) {
  const el = document.createElement('div');
  el.className = isGreen ? 'dt-circle dt-circle-green' : 'dt-circle dt-circle-red';

  el.style.left = pos.x + 'px';
  el.style.top  = pos.y + 'px';

  el.style.animationDelay = (index * 40) + 'ms';
  el.classList.add('dt-bounce-in');

  const onTouch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (_resolved || _destroyed) return;

    if (isGreen) {
      _triggerWin(e.changedTouches[0], el);
    } else {
      _triggerFail(el);
    }
  };

  el.addEventListener('touchstart', onTouch, { passive: false });
  _touchHandlers.push({ el, type: 'touchstart', fn: onTouch });

  return el;
}

// ─── Win / Fail ───────────────────────────────────────────────────────────────

function _triggerWin(touch, el) {
  if (_resolved) return;
  _resolved = true;

  clearInterval(_timerInterval);
  _timerInterval = null;

  _flashScreen('rgba(0,229,255,0.22)');

  if (touch) {
    _scorePopAt(touch.clientX, touch.clientY);
  }

  _failTimeout = setTimeout(() => {
    if (!_destroyed) _onWin();
  }, 150);
}

function _triggerFail(redCircleEl) {
  if (_resolved) return;
  _resolved = true;

  clearInterval(_timerInterval);
  _timerInterval = null;

  if (redCircleEl) {
    redCircleEl.classList.add('dt-circle-flash');
  }

  _shakeScreen();

  _failTimeout = setTimeout(() => {
    if (!_destroyed) _onFail();
  }, 400);
}

// ─── Animation helpers ────────────────────────────────────────────────────────

function _flashScreen(color) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:absolute; inset:0; z-index:999; pointer-events:none;
    background:${color}; opacity:1;
    transition: opacity 0.15s ease;
  `;
  _container.appendChild(flash);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { flash.style.opacity = '0'; });
  });
  setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 300);
}

function _shakeScreen() {
  _container.classList.remove('dt-shake');
  void _container.offsetWidth;
  _container.classList.add('dt-shake');
  setTimeout(() => { _container.classList.remove('dt-shake'); }, 400);
}

function _scorePopAt(clientX, clientY) {
  const rect = _container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const pop = document.createElement('div');
  pop.className = 'dt-score-pop';
  pop.textContent = '+1';
  pop.style.left = x + 'px';
  pop.style.top  = y + 'px';
  _container.appendChild(pop);

  setTimeout(() => { if (pop.parentNode) pop.parentNode.removeChild(pop); }, 700);
}

// ─── Collision-free circle placement ─────────────────────────────────────────

function _generatePositions(count, diameter, gap) {
  const W = Math.min(_container.offsetWidth || 390, 390);
  const H = _container.offsetHeight || 700;

  const PADDING = 16;
  // Top reserve: leave room for #game-instruction label (~40px) + padding
  const TOP_RESERVE = 56;
  const BOTTOM_RESERVE = 70;

  const minX = PADDING;
  const maxX = W - PADDING - diameter;
  const minY = TOP_RESERVE;
  const maxY = H - BOTTOM_RESERVE - diameter;

  const positions = [];
  const MIN_DIST = diameter + gap;
  let attempts = 0;
  const MAX_ATTEMPTS = 2000;

  while (positions.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);

    let valid = true;
    for (const p of positions) {
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DIST) {
        valid = false;
        break;
      }
    }
    if (valid) positions.push({ x, y });
  }

  // Relaxed fallback
  if (positions.length < count) {
    const RELAXED = diameter + 4;
    while (positions.length < count && attempts < MAX_ATTEMPTS + 500) {
      attempts++;
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      let valid = true;
      for (const p of positions) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < RELAXED) { valid = false; break; }
      }
      if (valid) positions.push({ x, y });
    }
  }

  return positions;
}

// ─── Injected styles ──────────────────────────────────────────────────────────

function _injectStyles() {
  const ID = 'scrollstrike-dont-tap-styles';
  if (document.getElementById(ID)) return;

  const style = document.createElement('style');
  style.id = ID;
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500&display=swap');

    /* ── Circles ── */
    .dt-circle {
      position: absolute;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      cursor: pointer;
      will-change: transform;
    }

    .dt-circle-red {
      background: #FF3B5C;
      box-shadow: 0 0 10px rgba(255,59,92,0.45);
    }

    .dt-circle-green {
      background: #AAFF00;
      box-shadow: 0 0 14px rgba(170,255,0,0.6);
      animation: dt-pulse-glow 1.2s ease-in-out infinite;
    }

    .dt-bounce-in {
      animation: dt-bounce-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both,
                 dt-pulse-glow 1.2s ease-in-out infinite;
    }
    .dt-circle-red.dt-bounce-in {
      animation: dt-bounce-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
    }

    .dt-circle-flash {
      animation: dt-white-flash 0.25s ease forwards !important;
    }

    /* ── Timer bar ── */
    .dt-timer-wrap {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 0 0 8px;
      pointer-events: none;
      z-index: 20;
    }

    .dt-timer-bar {
      height: 4px;
      background: #FF3B5C;
      width: 100%;
      transition: width 0.1s linear, background 0.3s ease;
      transform-origin: left center;
    }

    .dt-timer-bar.dt-timer-urgent {
      background: #FFFFFF;
      animation: dt-timer-pulse 0.5s ease-in-out infinite;
    }

    .dt-timer-count {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 20px;
      color: #FFFFFF;
      text-align: center;
      margin-top: 4px;
    }

    /* ── Score pop ── */
    .dt-score-pop {
      position: absolute;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 28px;
      color: #AAFF00;
      pointer-events: none;
      z-index: 100;
      transform: translateX(-50%);
      animation: dt-score-pop 0.6s ease-out forwards;
    }

    /* ── Screen shake ── */
    .dt-shake {
      animation: dt-shake 0.4s ease both;
    }

    /* ── Keyframes ── */
    @keyframes dt-bounce-in {
      0%   { transform: scale(0.3); opacity: 0; }
      60%  { transform: scale(1.12); opacity: 1; }
      80%  { transform: scale(0.95); }
      100% { transform: scale(1.0); opacity: 1; }
    }

    @keyframes dt-pulse-glow {
      0%   { transform: scale(1.0);  box-shadow: 0 0 14px rgba(170,255,0,0.6); }
      50%  { transform: scale(1.15); box-shadow: 0 0 26px rgba(170,255,0,0.95); }
      100% { transform: scale(1.0);  box-shadow: 0 0 14px rgba(170,255,0,0.6); }
    }

    @keyframes dt-white-flash {
      0%   { background: #FF3B5C; }
      40%  { background: #FFFFFF; box-shadow: 0 0 22px rgba(255,255,255,0.9); }
      100% { background: #FFFFFF; }
    }

    @keyframes dt-shake {
      0%   { transform: translateX(0); }
      15%  { transform: translateX(-8px); }
      30%  { transform: translateX(8px); }
      45%  { transform: translateX(-8px); }
      60%  { transform: translateX(8px); }
      75%  { transform: translateX(-4px); }
      90%  { transform: translateX(4px); }
      100% { transform: translateX(0); }
    }

    @keyframes dt-score-pop {
      0%   { transform: translateX(-50%) translateY(0);   opacity: 1; }
      100% { transform: translateX(-50%) translateY(-54px); opacity: 0; }
    }

    @keyframes dt-timer-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.45; }
    }
  `;
  document.head.appendChild(style);
}

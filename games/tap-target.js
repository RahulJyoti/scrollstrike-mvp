// ─────────────────────────────────────────────────────────────
//  ScrollStrike — Tap Target Mini Game
//  File: games/tap-target.js
// ─────────────────────────────────────────────────────────────

let _container = null;
let _onWin = null;
let _onFail = null;

let _score = 0;
let _finished = false;
let _timeLeft = 10;

let _timerInterval = null;
let _tickRAF = null;

let _circleEl = null;
let _countEl = null;
let _timerBarEl = null;
let _timerNumEl = null;

let _boundTap = null;

const TARGET_SCORE = 5;
const GAME_DURATION = 10; // seconds
const CIRCLE_DIAMETER = 64;
const EDGE_PADDING = 40;

// ── Public API ────────────────────────────────────────────────

export function init(container, onWin, onFail) {
  _container = container;
  _onWin = onWin;
  _onFail = onFail;
  _score = 0;
  _finished = false;
  _timeLeft = GAME_DURATION;

  _render();
  _startTimer();
}

export function destroy() {
  _teardown();
}

// ── Render ────────────────────────────────────────────────────

function _render() {
  _container.innerHTML = '';

  // Inject keyframes once per document lifetime
  if (!document.getElementById('ss-tap-target-styles')) {
    const style = document.createElement('style');
    style.id = 'ss-tap-target-styles';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600&display=swap');

      .stt-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        background: #0A0A0F;
        overflow: hidden;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }

      /* ── Background tap count ── */
      .stt-bg-count {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Bebas Neue', sans-serif;
        font-size: 72px;
        color: rgba(255, 255, 255, 0.12);
        pointer-events: none;
        line-height: 1;
        z-index: 0;
        transition: color 0.15s ease;
      }

      /* ── Target circle ── */
      .stt-circle {
        position: absolute;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: #FF3B5C;
        z-index: 2;
        transform: translate(-50%, -50%) scale(1);
        animation: stt-pulse 1.2s ease-in-out infinite;
        will-change: transform, box-shadow;
        cursor: pointer;
        touch-action: none;
      }

      @keyframes stt-pulse {
        0%   { transform: translate(-50%, -50%) scale(1.0);
                box-shadow: 0 0 0   0   rgba(255, 59, 92, 0.6),
                            0 0 0   0   rgba(255, 59, 92, 0.3); }
        50%  { transform: translate(-50%, -50%) scale(1.15);
                box-shadow: 0 0 18px 6px rgba(255, 59, 92, 0.7),
                            0 0 36px 12px rgba(255, 59, 92, 0.25); }
        100% { transform: translate(-50%, -50%) scale(1.0);
                box-shadow: 0 0 0   0   rgba(255, 59, 92, 0.6),
                            0 0 0   0   rgba(255, 59, 92, 0.3); }
      }

      /* bounce-in for new position */
      .stt-circle.stt-bounce {
        animation: stt-bounce-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                   stt-pulse 1.2s ease-in-out 0.22s infinite;
      }

      @keyframes stt-bounce-in {
        0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.4; }
        100% { transform: translate(-50%, -50%) scale(1.0); opacity: 1;   }
      }

      /* ── Screen flash (correct) ── */
      .stt-flash {
        position: absolute;
        inset: 0;
        background: rgba(0, 229, 255, 0.20);
        z-index: 10;
        pointer-events: none;
        opacity: 0;
        border-radius: inherit;
      }

      .stt-flash.stt-flash-active {
        animation: stt-flash-anim 0.15s ease-out forwards;
      }

      @keyframes stt-flash-anim {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }

      /* ── Score pop (+1) ── */
      .stt-score-pop {
        position: absolute;
        font-family: 'Bebas Neue', sans-serif;
        font-size: 28px;
        color: #AAFF00;
        pointer-events: none;
        z-index: 20;
        transform: translate(-50%, -50%);
        animation: stt-pop-anim 0.6s ease-out forwards;
        text-shadow: 0 0 10px rgba(170, 255, 0, 0.7);
      }

      @keyframes stt-pop-anim {
        0%   { opacity: 1;   transform: translate(-50%, -50%); }
        80%  { opacity: 0.9; transform: translate(-50%, calc(-50% - 52px)); }
        100% { opacity: 0;   transform: translate(-50%, calc(-50% - 64px)); }
      }

      /* ── Timer bar ── */
      .stt-timer-bar-wrap {
        position: absolute;
        bottom: 20px;
        left: 16px;
        right: 16px;
        z-index: 5;
        pointer-events: none;
      }

      .stt-timer-track {
        width: 100%;
        height: 4px;
        background: rgba(255,255,255,0.12);
        border-radius: 2px;
        overflow: hidden;
      }

      .stt-timer-fill {
        height: 100%;
        width: 100%;
        background: #FF3B5C;
        border-radius: 2px;
        transform-origin: left center;
        transition: background 0.3s ease;
        will-change: transform;
      }

      .stt-timer-fill.stt-urgent {
        background: #FFFFFF;
        animation: stt-timer-pulse 0.5s ease-in-out infinite;
      }

      @keyframes stt-timer-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.55; }
      }

      .stt-timer-num {
        text-align: center;
        font-family: 'Bebas Neue', sans-serif;
        font-size: 20px;
        color: #FFFFFF;
        margin-top: 6px;
        letter-spacing: 0.04em;
      }

      /* ── Screen shake ── */
      @keyframes stt-shake {
        0%   { transform: translateX(0); }
        14%  { transform: translateX(-8px); }
        28%  { transform: translateX(8px); }
        43%  { transform: translateX(-8px); }
        57%  { transform: translateX(8px); }
        71%  { transform: translateX(-8px); }
        85%  { transform: translateX(8px); }
        100% { transform: translateX(0); }
      }

      .stt-shake {
        animation: stt-shake 0.4s ease-in-out forwards !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'stt-wrapper';

  // Background count
  _countEl = document.createElement('div');
  _countEl.className = 'stt-bg-count';
  _countEl.textContent = `0/${TARGET_SCORE}`;
  wrapper.appendChild(_countEl);

  // Flash layer
  const flash = document.createElement('div');
  flash.className = 'stt-flash';
  wrapper.appendChild(flash);

  // Circle
  _circleEl = document.createElement('div');
  _circleEl.className = 'stt-circle';
  wrapper.appendChild(_circleEl);

  // Timer bar
  _timerBarEl = document.createElement('div');
  _timerBarEl.className = 'stt-timer-fill';

  const timerTrack = document.createElement('div');
  timerTrack.className = 'stt-timer-track';
  timerTrack.appendChild(_timerBarEl);

  _timerNumEl = document.createElement('div');
  _timerNumEl.className = 'stt-timer-num';
  _timerNumEl.textContent = GAME_DURATION;

  const timerWrap = document.createElement('div');
  timerWrap.className = 'stt-timer-bar-wrap';
  timerWrap.appendChild(timerTrack);
  timerWrap.appendChild(_timerNumEl);
  wrapper.appendChild(timerWrap);

  _container.appendChild(wrapper);

  // Position circle at a random spot
  _placeCircle(false);

  // Attach tap listener to circle only
  _boundTap = _onCircleTap.bind(this);
  _circleEl.addEventListener('touchstart', _boundTap, { passive: false });
}

// ── Circle positioning ────────────────────────────────────────

function _placeCircle(withBounce) {
  const bounds = _container.getBoundingClientRect();
  const w = bounds.width  || 390;
  const h = bounds.height || 700;

  const minX = EDGE_PADDING + CIRCLE_DIAMETER / 2;
  const maxX = w - EDGE_PADDING - CIRCLE_DIAMETER / 2;
  const minY = EDGE_PADDING + CIRCLE_DIAMETER / 2;
  // Keep above timer bar area (≈80px from bottom)
  const maxY = h - 100 - CIRCLE_DIAMETER / 2;

  const x = _rand(minX, maxX);
  const y = _rand(minY, maxY);

  _circleEl.style.left = `${x}px`;
  _circleEl.style.top  = `${y}px`;

  if (withBounce) {
    // Retrigger animation by removing and re-adding class
    _circleEl.classList.remove('stt-bounce');
    // Force reflow
    void _circleEl.offsetWidth;
    _circleEl.classList.add('stt-bounce');
  }
}

// ── Tap handler ───────────────────────────────────────────────

function _onCircleTap(e) {
  e.preventDefault();
  if (_finished) return;

  const touch = e.changedTouches[0];

  _score++;
  _updateCount();
  _triggerFlash();
  _spawnScorePop(touch.clientX, touch.clientY);

  if (_score >= TARGET_SCORE) {
    _finish(true);
    return;
  }

  _placeCircle(true);
}

// ── UI helpers ────────────────────────────────────────────────

function _updateCount() {
  if (_countEl) {
    _countEl.textContent = `${_score}/${TARGET_SCORE}`;
  }
}

function _triggerFlash() {
  const flash = _container.querySelector('.stt-flash');
  if (!flash) return;
  flash.classList.remove('stt-flash-active');
  void flash.offsetWidth;
  flash.classList.add('stt-flash-active');
}

function _spawnScorePop(clientX, clientY) {
  const bounds = _container.getBoundingClientRect();
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;

  const pop = document.createElement('div');
  pop.className = 'stt-score-pop';
  pop.textContent = '+1';
  pop.style.left = `${x}px`;
  pop.style.top  = `${y}px`;
  _container.firstChild.appendChild(pop);

  // Remove after animation
  const cleanup = setTimeout(() => pop.remove(), 650);
  _cleanupTokens.push(cleanup);
}

function _triggerShake() {
  const wrapper = _container.firstChild;
  if (!wrapper) return;
  wrapper.classList.remove('stt-shake');
  void wrapper.offsetWidth;
  wrapper.classList.add('stt-shake');
}

// ── Timer ─────────────────────────────────────────────────────

const _cleanupTokens = [];

function _startTimer() {
  const startTime = performance.now();

  function tick(now) {
    if (_finished) return;

    const elapsed = (now - startTime) / 1000;
    const remaining = Math.max(0, GAME_DURATION - elapsed);
    _timeLeft = remaining;

    // Update bar (scaleX goes from 1 → 0)
    if (_timerBarEl) {
      const fraction = remaining / GAME_DURATION;
      _timerBarEl.style.transform = `scaleX(${fraction})`;

      if (remaining <= 3) {
        _timerBarEl.classList.add('stt-urgent');
      }
    }

    // Update countdown number
    if (_timerNumEl) {
      _timerNumEl.textContent = Math.ceil(remaining);
    }

    if (remaining <= 0) {
      _finish(false);
      return;
    }

    _tickRAF = requestAnimationFrame(tick);
  }

  _tickRAF = requestAnimationFrame(tick);
}

// ── Finish ────────────────────────────────────────────────────

function _finish(won) {
  if (_finished) return;
  _finished = true;

  _teardownListeners();

  if (!won) {
    _triggerShake();
  }

  // Small delay so the player sees the final state
  const delay = setTimeout(() => {
    if (won) {
      _onWin();
    } else {
      _onFail();
    }
  }, won ? 150 : 400);

  _cleanupTokens.push(delay);
}

// ── Teardown ──────────────────────────────────────────────────

function _teardownListeners() {
  if (_circleEl && _boundTap) {
    _circleEl.removeEventListener('touchstart', _boundTap);
  }
}

function _teardown() {
  _finished = true;

  _teardownListeners();

  if (_tickRAF) {
    cancelAnimationFrame(_tickRAF);
    _tickRAF = null;
  }

  _cleanupTokens.forEach(t => clearTimeout(t));
  _cleanupTokens.length = 0;

  _circleEl    = null;
  _countEl     = null;
  _timerBarEl  = null;
  _timerNumEl  = null;
  _boundTap    = null;
  _container   = null;
  _onWin       = null;
  _onFail      = null;
}

// ── Utility ───────────────────────────────────────────────────

function _rand(min, max) {
  return Math.random() * (max - min) + min;
}

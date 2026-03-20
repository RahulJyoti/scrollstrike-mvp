// games/sequence-tap.js
// ScrollStrike — Sequence Tap mini game
// Tap tiles 1 → 2 → 3 in order. Complete 3 rounds in 10s to win.

import { setGameInstruction, clearGameInstruction } from '/game-engine.js';

let _container      = null;
let _onWin          = null;
let _onFail         = null;
let _timerInterval  = null;
let _gameTimeout    = null;
let _resumeTimeout  = null;
let _timeLeft       = 10;
let _currentStep    = 0;
let _roundsComplete = 0;
const _totalRounds  = 3;
let _finished       = false;
let _locked         = false;
let _tileElements   = [];

// Bug 2 safe-zone constants (20% top + bottom)
const SAFE_TOP_PCT = 0.20;
const SAFE_BOT_PCT = 0.20;

// ─── Public API ────────────────────────────────────────────────────────────────

export function init(container, onWin, onFail) {
  _container      = container;
  _onWin          = onWin;
  _onFail         = onFail;
  _finished       = false;
  _locked         = false;
  _timeLeft       = 10;
  _currentStep    = 0;
  _roundsComplete = 0;
  _tileElements   = [];

  _buildUI();
  _spawnTiles(true);
  _startTimer();
  setGameInstruction('TAP IN ORDER: 1 → 2 → 3');
}

export function destroy() {
  clearGameInstruction();
  _clearAllTimers();
  _removeTileListeners();
  if (_container) _container.innerHTML = '';
  _container    = null;
  _onWin        = null;
  _onFail       = null;
  _tileElements = [];
}

// ─── UI Construction ───────────────────────────────────────────────────────────

function _buildUI() {
  _container.innerHTML = '';
  _container.style.cssText = `
    position: relative; width: 100%; height: 100%;
    background: #0A0A0F; overflow: hidden;
    user-select: none; -webkit-user-select: none;
  `;

  if (!document.getElementById('ss-fonts')) {
    const link = document.createElement('link');
    link.id   = 'ss-fonts';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }

  if (!document.getElementById('ss-seq-styles')) {
    const style = document.createElement('style');
    style.id = 'ss-seq-styles';
    style.textContent = `
      @keyframes ss-bounce-in {
        0%   { transform: scale(0.3); opacity: 0; }
        60%  { transform: scale(1.12); opacity: 1; }
        80%  { transform: scale(0.95); }
        100% { transform: scale(1.0); opacity: 1; }
      }
      @keyframes ss-tile-pulse {
        0%, 100% { box-shadow: 0 0 0px 0px rgba(255,255,255,0.0); }
        50%       { box-shadow: 0 0 14px 4px rgba(255,255,255,0.13); }
      }
      @keyframes ss-tile-win {
        0%   { transform: scale(1.0); opacity: 1; background: rgba(170,255,0,0.30); }
        60%  { transform: scale(1.18); opacity: 0.7; }
        100% { transform: scale(0.0); opacity: 0; }
      }
      @keyframes ss-score-float {
        0%   { opacity: 1; transform: translateY(0px); }
        100% { opacity: 0; transform: translateY(-52px); }
      }
      @keyframes ss-screen-shake {
        0%   { transform: translateX(0px); }
        15%  { transform: translateX(-8px); }
        30%  { transform: translateX(8px); }
        45%  { transform: translateX(-8px); }
        60%  { transform: translateX(8px); }
        75%  { transform: translateX(-4px); }
        90%  { transform: translateX(4px); }
        100% { transform: translateX(0px); }
      }
      @keyframes ss-flash-correct {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes ss-timer-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.5; }
      }
      @keyframes ss-overlay-bounce {
        0%   { transform: scale(0.4) translateY(30px); opacity: 0; }
        60%  { transform: scale(1.08) translateY(-6px); opacity: 1; }
        80%  { transform: scale(0.96) translateY(2px); }
        100% { transform: scale(1.0) translateY(0px); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  const roundLabel = document.createElement('div');
  roundLabel.id = 'ss-round-label';
  roundLabel.style.cssText = `
    position: absolute; top: 14px; right: 16px;
    font-family: 'DM Mono', monospace; font-size: 11px;
    color: rgba(255,255,255,0.4); letter-spacing: 0.04em;
    pointer-events: none; z-index: 10;
  `;
  roundLabel.textContent = `ROUND 1 / ${_totalRounds}`;
  _container.appendChild(roundLabel);

  // Bug 2: next-tap indicator must stay in safe zone — push it up from the
  // raw bottom so it doesn't fall into the bottom 20%.
  const nextLabel = document.createElement('div');
  nextLabel.id = 'ss-next-label';
  nextLabel.style.cssText = `
    position: absolute;
    bottom: calc(20% + 12px);
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px;
    color: rgba(255,255,255,0.28);
    letter-spacing: 0.1em;
    pointer-events: none;
    z-index: 10;
  `;
  nextLabel.textContent = 'NEXT: 1';
  _container.appendChild(nextLabel);

  const flashOverlay = document.createElement('div');
  flashOverlay.id = 'ss-flash';
  flashOverlay.style.cssText = `
    position: absolute; inset: 0;
    background: rgba(0,229,255,0.20); pointer-events: none;
    z-index: 50; opacity: 0;
  `;
  _container.appendChild(flashOverlay);
}

// ─── Tile Spawning ─────────────────────────────────────────────────────────────

function _spawnTiles(initial = false) {
  _removeTileListeners();
  document.querySelectorAll('.ss-tile').forEach(el => el.remove());
  _tileElements = [];

  const positions = _randomPositions();

  [1, 2, 3].forEach((num, i) => {
    const tile = document.createElement('div');
    tile.className   = 'ss-tile';
    tile.dataset.num = String(num);

    tile.style.cssText = `
      position: absolute;
      width: 76px; height: 76px;
      left: ${positions[i].x}px;
      top:  ${positions[i].y}px;
      background: rgba(255,255,255,0.07);
      border: 1.5px solid rgba(255,255,255,0.18);
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 36px; color: #FFFFFF;
      cursor: pointer; touch-action: manipulation;
      animation: ss-bounce-in 0.38s cubic-bezier(0.34,1.56,0.64,1) both,
                 ss-tile-pulse 1.8s ease-in-out infinite;
      animation-delay: ${i * 0.08}s, ${i * 0.08 + 0.38}s;
      z-index: 20;
      -webkit-tap-highlight-color: transparent;
    `;
    tile.textContent = String(num);

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      _onTileTap(num, tile, e);
    };

    tile.addEventListener('touchstart', handler, { passive: false });
    tile._tapHandler = handler;

    _container.appendChild(tile);
    _tileElements.push(tile);
  });
}

// Bug 2: tiles must not spawn in top 20% or bottom 20%
function _randomPositions() {
  const containerW = _container.offsetWidth  || 390;
  const containerH = _container.offsetHeight || 680;
  const tileSize   = 76;
  const pad        = 16;

  const minX  = pad;
  const maxX  = containerW - tileSize - pad;
  const minY  = Math.max(56, containerH * SAFE_TOP_PCT);
  const maxY  = containerH - tileSize - Math.max(70, containerH * SAFE_BOT_PCT);
  const minDist = 100;

  const placed = [];
  let attempts = 0;

  while (placed.length < 3 && attempts < 400) {
    attempts++;
    const cx = minX + Math.random() * (maxX - minX);
    const cy = minY + Math.random() * (maxY - minY);
    const tooClose = placed.some(p => {
      const dx = (p.x + tileSize / 2) - (cx + tileSize / 2);
      const dy = (p.y + tileSize / 2) - (cy + tileSize / 2);
      return Math.sqrt(dx * dx + dy * dy) < minDist;
    });
    if (!tooClose) placed.push({ x: Math.round(cx), y: Math.round(cy) });
  }

  if (placed.length < 3) {
    const midY = (minY + maxY) / 2;
    const step = (maxX - minX) / 2;
    return [0, 1, 2].map(i => ({
      x: Math.round(minX + i * step),
      y: Math.round(midY),
    }));
  }

  return placed;
}

// ─── Tap Logic ─────────────────────────────────────────────────────────────────

function _onTileTap(num, tileEl, e) {
  if (_finished || _locked) return;
  const expected = _currentStep + 1;
  if (num === expected) {
    _handleCorrectTap(num, tileEl, e);
  } else {
    _handleWrongTap();
  }
}

function _handleCorrectTap(num, tileEl, e) {
  // Bug 3: correct sound
  if (window.SS_SOUND) window.SS_SOUND.correct();

  const flash = document.getElementById('ss-flash');
  if (flash) {
    flash.style.animation = 'none';
    flash.style.opacity   = '1';
    void flash.offsetWidth;
    flash.style.animation = 'ss-flash-correct 0.15s ease-out forwards';
  }

  const touch = e.changedTouches ? e.changedTouches[0] : null;
  if (touch) {
    const rect = _container.getBoundingClientRect();
    _spawnScorePop(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  tileEl.style.animation    = 'ss-tile-win 0.28s ease-out forwards';
  tileEl.style.pointerEvents = 'none';
  tileEl.removeEventListener('touchstart', tileEl._tapHandler);

  _currentStep++;
  _updateNextLabel();

  if (_currentStep === 3) {
    _roundsComplete++;
    _updateRoundLabel();

    if (_roundsComplete >= _totalRounds) {
      _locked = true;
      _resumeTimeout = setTimeout(() => {
        if (!_finished) _triggerWin();
      }, 320);
    } else {
      _locked = true;
      _resumeTimeout = setTimeout(() => {
        _locked      = false;
        _currentStep = 0;
        _updateNextLabel();
        _spawnTiles(false);
      }, 250);
    }
  }
}

function _handleWrongTap() {
  if (_locked) return;
  _locked = true;

  // Bug 3: wrong sound
  if (window.SS_SOUND) window.SS_SOUND.wrong();

  _container.style.animation = 'none';
  void _container.offsetWidth;
  _container.style.animation = 'ss-screen-shake 0.4s ease-out forwards';

  _resumeTimeout = setTimeout(() => {
    _container.style.animation = '';
    _currentStep = 0;
    _updateNextLabel();
    _locked = false;
    _spawnTiles(false);
  }, 420);
}

// ─── Timer ─────────────────────────────────────────────────────────────────────

function _startTimer() {
  _timerInterval = setInterval(() => {
    if (_finished) return;
    _timeLeft -= 0.1;
    if (_timeLeft <= 0) {
      _clearAllTimers();
      if (!_finished) _triggerFail();
    }
  }, 100);

  _gameTimeout = setTimeout(() => {
    if (!_finished) _triggerFail();
  }, 10000);
}

// ─── Win / Fail ────────────────────────────────────────────────────────────────

function _triggerWin() {
  if (_finished) return;
  _finished = true;
  _clearAllTimers();
  setTimeout(() => { if (_onWin) _onWin(); }, 800);
}

function _triggerFail() {
  if (_finished) return;
  _finished = true;
  _clearAllTimers();
  // Bug 3: wrong sound on time-out fail
  if (window.SS_SOUND) window.SS_SOUND.wrong();
  setTimeout(() => { if (_onFail) _onFail(); }, 1200);
}

// ─── HUD Label Helpers ─────────────────────────────────────────────────────────

function _updateRoundLabel() {
  const el = document.getElementById('ss-round-label');
  if (el) el.textContent = `ROUND ${Math.min(_roundsComplete + 1, _totalRounds)} / ${_totalRounds}`;
}

function _updateNextLabel() {
  const el = document.getElementById('ss-next-label');
  if (el) el.textContent = _currentStep >= 3 ? '✓' : `NEXT: ${_currentStep + 1}`;
}

// ─── Score Pop ─────────────────────────────────────────────────────────────────

function _spawnScorePop(x, y) {
  const pop = document.createElement('div');
  pop.style.cssText = `
    position: absolute;
    left: ${x - 12}px; top: ${y - 20}px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 24px; color: #AAFF00;
    pointer-events: none; z-index: 60;
    animation: ss-score-float 0.6s ease-out forwards;
  `;
  pop.textContent = '+1';
  _container.appendChild(pop);
  setTimeout(() => pop.remove(), 620);
}

// ─── Cleanup Helpers ──────────────────────────────────────────────────────────

function _removeTileListeners() {
  _tileElements.forEach(tile => {
    if (tile._tapHandler) {
      tile.removeEventListener('touchstart', tile._tapHandler);
      tile._tapHandler = null;
    }
  });
  _tileElements = [];
}

function _clearAllTimers() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  if (_gameTimeout)   { clearTimeout(_gameTimeout);    _gameTimeout   = null; }
  if (_resumeTimeout) { clearTimeout(_resumeTimeout);  _resumeTimeout = null; }
}
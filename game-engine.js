/**
 * ScrollStrike — game-engine.js
 * Manages state, game queue, lifecycle, win/fail routing, and game-over.
 *
 * Exposes two module-level helpers that game modules use to write to the
 * shared #game-instruction element in index.html:
 *
 *   setGameInstruction(text)  — show instruction text, auto-fade after 2s
 *   clearGameInstruction()    — immediately hide and clear the element
 */

const GAME_NAMES = [
  'tap-target',
  'swipe-direction',
  'dont-tap',
  'sequence-tap',
  'drag-match',
];

const BEST_STREAK_KEY = 'ss_best';

// ─── #game-instruction helpers ───────────────────────────────────────────────

let _instrFadeTimer = null;

/**
 * Write text into #game-instruction and trigger the 2-second auto-fade.
 * Safe to call before the element exists (it checks first).
 * @param {string} text
 */
export function setGameInstruction(text) {
  const el = document.getElementById('game-instruction');
  if (!el) return;

  // Reset any in-progress fade
  if (_instrFadeTimer) {
    clearTimeout(_instrFadeTimer);
    _instrFadeTimer = null;
  }

  el.textContent = text;
  // Force reflow so class changes trigger transitions cleanly
  el.classList.remove('auto-fade', 'visible');
  void el.offsetWidth;
  el.classList.add('visible');

  // Trigger auto-fade after a single frame to let 'visible' paint first
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.remove('visible');
      el.classList.add('auto-fade');
      // Clean up class after animation completes (2s)
      _instrFadeTimer = setTimeout(() => {
        el.classList.remove('auto-fade');
        _instrFadeTimer = null;
      }, 2100);
    });
  });
}

/**
 * Immediately hide and blank #game-instruction.
 * Called by game modules in their destroy().
 */
export function clearGameInstruction() {
  if (_instrFadeTimer) {
    clearTimeout(_instrFadeTimer);
    _instrFadeTimer = null;
  }
  const el = document.getElementById('game-instruction');
  if (!el) return;
  el.classList.remove('visible', 'auto-fade');
  el.textContent = '';
}

// ─── Fisher-Yates shuffle ────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── GameEngine ──────────────────────────────────────────────────────────────
export class GameEngine {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   onWin:        (streak: number) => void,
   *   onFail:       (lives: number)  => void,
   *   showGameOver: (bestStreak: number, streak: number) => void,
   *   onGameStart:  () => void
   * }} engineCallbacks
   */
  constructor(container, engineCallbacks) {
    this._container      = container;
    this._callbacks      = engineCallbacks;

    this.streak          = 0;
    this.lives           = 3;
    this.bestStreak      = this._loadBestStreak();

    this._queue          = [];
    this._lastGameName   = null;
    this._currentModule  = null;

    this._transitioning  = false;
    this._destroyed      = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  start() {
    this._refillQueue();
    this._loadNextGame();
  }

  reset() {
    this._destroyCurrentGame();
    this.streak         = 0;
    this.lives          = 3;
    this._queue         = [];
    this._lastGameName  = null;
    this._transitioning = false;
    this._destroyed     = false;
    this.start();
  }

  // ── Queue helpers ──────────────────────────────────────────────────────────

  _refillQueue() {
    let newQueue = shuffle(GAME_NAMES);

    if (
      this._lastGameName !== null &&
      newQueue[0] === this._lastGameName
    ) {
      newQueue = [...newQueue.slice(1), newQueue[0]];
    }

    this._queue = newQueue;
  }

  _dequeueNextName() {
    if (this._queue.length === 0) {
      this._refillQueue();
    }

    let name = this._queue.shift();

    if (name === this._lastGameName && this._queue.length > 0) {
      const swapWith   = this._queue.shift();
      this._queue.unshift(name);
      name = swapWith;
    }

    return name;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  _destroyCurrentGame() {
    if (this._currentModule && typeof this._currentModule.destroy === 'function') {
      try {
        this._currentModule.destroy();
      } catch (err) {
        console.warn('[GameEngine] destroy() threw:', err);
      }
    }
    this._currentModule = null;
  }

  async _loadNextGame() {
    if (this._transitioning || this._destroyed) return;
    this._transitioning = true;

    this._destroyCurrentGame();

    // Clear game area content but preserve #game-instruction element
    const instrEl = this._container.querySelector('#game-instruction');
    this._container.innerHTML = '';
    if (instrEl) {
      this._container.appendChild(instrEl);
    }

    const gameName = this._dequeueNextName();
    this._lastGameName = gameName;

    let module;
    try {
      module = await import(`/games/${gameName}.js`);
    } catch (err) {
      console.error(`[GameEngine] Failed to import /games/${gameName}.js`, err);
      this._transitioning = false;
      this._loadNextGame();
      return;
    }

    this._currentModule = module;
    this._transitioning = false;

    // Fire onGameStart so the shell can start the HUD timer
    if (typeof this._callbacks.onGameStart === 'function') {
      this._callbacks.onGameStart();
    }

    try {
      module.init(
        this._container,
        () => this._onWin(),
        () => this._onFail(),
      );
    } catch (err) {
      console.error(`[GameEngine] init() threw for ${gameName}:`, err);
      this._loadNextGame();
    }
  }

  // ── Win / Fail handlers ───────────────────────────────────────────────────

  _onWin() {
    if (this._destroyed) return;

    this.streak++;
    this._persistBestStreak();

    this._callbacks.onWin(this.streak);

    setTimeout(() => this._loadNextGame(), 800);
  }

  _onFail() {
    if (this._destroyed) return;

    this.lives--;
    this.streak = 0;

    this._callbacks.onFail(this.lives);

    if (this.lives <= 0) {
      this._destroyed = true;
      this._destroyCurrentGame();

      setTimeout(() => {
        this._callbacks.showGameOver(this.bestStreak, 0);
      }, 1200);
    } else {
      setTimeout(() => this._loadNextGame(), 1200);
    }
  }

  // ── localStorage helpers ──────────────────────────────────────────────────

  _loadBestStreak() {
    try {
      const stored = localStorage.getItem(BEST_STREAK_KEY);
      return stored !== null ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  }

  _persistBestStreak() {
    if (this.streak > this.bestStreak) {
      this.bestStreak = this.streak;
      try {
        localStorage.setItem(BEST_STREAK_KEY, String(this.bestStreak));
      } catch {
        // Private-browsing / storage quota — fail silently.
      }
    }
  }
}

/**
 * ScrollStrike — game-engine.js
 * Manages state, game queue, lifecycle, win/fail routing, and game-over.
 */

const GAME_NAMES = [
  'tap-target',
  'swipe-direction',
  'dont-tap',
  'sequence-tap',
  'drag-match',
];

const BEST_STREAK_KEY = 'ss_best';

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
   * @param {HTMLElement} container      — DOM node games render into
   * @param {{
   *   onWin:        (streak: number) => void,
   *   onFail:       (lives: number)  => void,
   *   showGameOver: (bestStreak: number, streak: number) => void
   * }} engineCallbacks
   */
  constructor(container, engineCallbacks) {
    this._container      = container;
    this._callbacks      = engineCallbacks;

    // ── persistent / session state ──────────────────────────────────────────
    this.streak          = 0;
    this.lives           = 3;
    this.bestStreak      = this._loadBestStreak();

    // ── queue state ─────────────────────────────────────────────────────────
    this._queue          = [];        // remaining games in current rotation
    this._lastGameName   = null;      // guard against back-to-back repeats
    this._currentModule  = null;      // active game module reference

    // ── internal flags ──────────────────────────────────────────────────────
    this._transitioning  = false;     // prevent concurrent loadNextGame calls
    this._destroyed      = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call once to kick off the first game. */
  start() {
    this._refillQueue();
    this._loadNextGame();
  }

  /** Hard-reset everything (e.g. after Game Over → Play Again). */
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

    // Never allow the same game back-to-back across a reshuffle boundary.
    if (
      this._lastGameName !== null &&
      newQueue[0] === this._lastGameName
    ) {
      // Rotate the first element to the end.
      newQueue = [...newQueue.slice(1), newQueue[0]];
    }

    this._queue = newQueue;
  }

  _dequeueNextName() {
    if (this._queue.length === 0) {
      this._refillQueue();
    }

    // Pop from the front; if it matches _lastGameName keep looking
    // (refill already guards the boundary case, but be safe mid-queue too).
    let name = this._queue.shift();

    if (name === this._lastGameName && this._queue.length > 0) {
      // Swap the problematic front with whatever is next.
      const swapWith   = this._queue.shift();
      this._queue.unshift(name); // put the conflicting name back after
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

    // Tear down the previous game cleanly.
    this._destroyCurrentGame();

    // Clear the render container.
    this._container.innerHTML = '';

    const gameName = this._dequeueNextName();
    this._lastGameName = gameName;

    let module;
    try {
      module = await import(`/games/${gameName}.js`);
    } catch (err) {
      console.error(`[GameEngine] Failed to import /games/${gameName}.js`, err);
      this._transitioning = false;
      // Skip this game and try the next one.
      this._loadNextGame();
      return;
    }

    this._currentModule = module;
    this._transitioning = false;

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

    // Notify the shell so it can update the HUD / play the win overlay.
    this._callbacks.onWin(this.streak);

    // Auto-advance after the win overlay animation (0.8 s per spec).
    setTimeout(() => this._loadNextGame(), 800);
  }

  _onFail() {
    if (this._destroyed) return;

    this.lives--;
    this.streak = 0; // streak resets on any fail

    // Notify the shell so it can update the HUD / play the fail overlay.
    this._callbacks.onFail(this.lives);

    if (this.lives <= 0) {
      this._destroyed = true;
      this._destroyCurrentGame();

      // Give the fail overlay time to animate (1.2 s per spec), then game over.
      setTimeout(() => {
        this._callbacks.showGameOver(this.bestStreak, 0);
      }, 1200);
    } else {
      // Auto-advance after the fail overlay animation (1.2 s per spec).
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

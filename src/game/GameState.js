/**
 * GameState — Central game state machine
 * States: TITLE, ENTRY, PLAYING, PAUSED, WON, LOST
 * Manages transitions, pause/resume, and prevents simultaneous win/lose
 */

export const GAME_STATE = {
  TITLE: 'TITLE',
  ENTRY: 'ENTRY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  WON: 'WON',
  LOST: 'LOST'
};

export class GameState {
  constructor() {
    this.state = GAME_STATE.TITLE;
    this.previousState = GAME_STATE.ENTRY;
    this._listeners = [];
    this._settled = false; // Once WON or LOST, prevent further gameplay transitions until reset
  }

  get current() {
    return this.state;
  }

  get isTitle() {
    return this.state === GAME_STATE.TITLE;
  }

  get isEntry() {
    return this.state === GAME_STATE.ENTRY;
  }

  get isPlaying() {
    return this.state === GAME_STATE.PLAYING;
  }

  get isPaused() {
    return this.state === GAME_STATE.PAUSED;
  }

  get isOver() {
    return this.state === GAME_STATE.WON || this.state === GAME_STATE.LOST;
  }

  /**
   * Register a callback for state changes: fn(newState, oldState)
   */
  onChange(fn) {
    this._listeners.push(fn);
  }

  /**
   * Transition to a new state. Once settled (WON/LOST), further transitions
   * are blocked until reset() is called.
   */
  transition(newState) {
    if (this._settled && newState !== GAME_STATE.ENTRY && newState !== GAME_STATE.TITLE) return;
    if (this.state === newState) return;

    const old = this.state;
    if (old !== GAME_STATE.PAUSED) {
      this.previousState = old;
    }
    this.state = newState;

    if (newState === GAME_STATE.WON || newState === GAME_STATE.LOST) {
      this._settled = true;
    }

    for (const fn of this._listeners) {
      fn(newState, old);
    }
  }

  pause() {
    if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.ENTRY) {
      this.transition(GAME_STATE.PAUSED);
    }
  }

  resume() {
    if (this.state === GAME_STATE.PAUSED) {
      const targetState = (this.previousState === GAME_STATE.ENTRY || this.previousState === GAME_STATE.PLAYING)
        ? this.previousState
        : GAME_STATE.PLAYING;
      this.state = targetState;
      for (const fn of this._listeners) {
        fn(targetState, GAME_STATE.PAUSED);
      }
    }
  }

  /**
   * Reset to ENTRY state for clean restart
   */
  reset() {
    this._settled = false;
    const old = this.state;
    this.state = GAME_STATE.ENTRY;
    for (const fn of this._listeners) {
      fn(GAME_STATE.ENTRY, old);
    }
  }
}

/**
 * HUD — Heads-Up Display and Interface Overlay System
 *
 * Renders all UI elements as DOM overlays:
 * - Cyberpunk Anime Title Screen with Controls & Start Mission
 * - Tactical Pause Menu with Master Volume & Mouse Sensitivity settings
 * - Objective counter with glowing anime pips (ACCESS CORES 0/2)
 * - Warden threat state indicator
 * - Contextual interaction prompt
 * - Collection/unlock feedback banner
 * - Hunt / Alert warning flash
 * - Full-screen Win / Lose debrief overlays
 *
 * Does NOT create duplicate DOM elements on restart — reuses existing nodes.
 */

export class HUD {
  constructor(gameState) {
    this.gameState = gameState;
    this._initialized = false;

    // DOM element references
    this.root = null;
    this.titleEl = null;
    this.pauseEl = null;
    this.objectiveEl = null;
    this.wardenStateEl = null;
    this.promptEl = null;
    this.feedbackEl = null;
    this.warningEl = null;
    this.overlayEl = null;

    // Settings state
    this.volume = 0.8;
    this.sensitivityMultiplier = 1.0;

    // Game tracking state
    this.coresCollected = 0;
    this.totalCores = 2;
    this.currentPrompt = null;
    this.wardenState = 'PATROL';
    this._feedbackTimeout = null;
    this._warningVisible = false;

    // User interaction callbacks
    this._onStartGame = null;
    this._onResume = null;
    this._onRestart = null;
    this._onVolumeChange = null;
    this._onSensitivityChange = null;

    this._createDOM();
  }

  onStartGame(fn) { this._onStartGame = fn; }
  onResume(fn) { this._onResume = fn; }
  onRestart(fn) { this._onRestart = fn; }
  onVolumeChange(fn) { this._onVolumeChange = fn; }
  onSensitivityChange(fn) { this._onSensitivityChange = fn; }

  _createDOM() {
    if (this._initialized) return;
    this._initialized = true;

    this.root = document.getElementById('hud-root');
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.id = 'hud-root';
      document.body.appendChild(this.root);
    }
    this.root.innerHTML = '';

    // ────────────────────────────────────────────────────────────────────────
    // 1. In-game HUD Elements
    // ────────────────────────────────────────────────────────────────────────
    // Top-left: Objective counter
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.id = 'hud-objective';
    this.objectiveEl.className = 'hud-panel hud-top-left';
    this.root.appendChild(this.objectiveEl);

    // Top-right: Warden threat telemetry
    this.wardenStateEl = document.createElement('div');
    this.wardenStateEl.id = 'hud-warden-state';
    this.wardenStateEl.className = 'hud-panel hud-top-right';
    this.root.appendChild(this.wardenStateEl);

    // Bottom-center: Interaction prompt
    this.promptEl = document.createElement('div');
    this.promptEl.id = 'hud-prompt';
    this.promptEl.className = 'hud-prompt';
    this.root.appendChild(this.promptEl);

    // Center: Feedback flash
    this.feedbackEl = document.createElement('div');
    this.feedbackEl.id = 'hud-feedback';
    this.feedbackEl.className = 'hud-feedback';
    this.root.appendChild(this.feedbackEl);

    // Top-center: Hunt warning
    this.warningEl = document.createElement('div');
    this.warningEl.id = 'hud-warning';
    this.warningEl.className = 'hud-warning';
    this.root.appendChild(this.warningEl);

    // ────────────────────────────────────────────────────────────────────────
    // 2. Full-screen Overlays: Win / Lose
    // ────────────────────────────────────────────────────────────────────────
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'hud-overlay';
    this.overlayEl.className = 'hud-overlay';
    this.root.appendChild(this.overlayEl);

    // ────────────────────────────────────────────────────────────────────────
    // 3. Title Screen Overlay (PART 2)
    // ────────────────────────────────────────────────────────────────────────
    this.titleEl = document.createElement('div');
    this.titleEl.id = 'title-screen';
    this.titleEl.className = 'menu-overlay title-overlay';
    this.titleEl.innerHTML = `
      <div class="menu-card title-card">
        <div class="title-badge">NEURAL INFILTRATION PROTOCOL</div>
        <h1 class="title-main">ECHO: THE WARDEN</h1>
        <p class="title-sub">CYBERPUNK MAZE SURVIVAL // CLASSIFIED FACILITY</p>

        <div class="mission-briefing">
          <div class="briefing-title">MISSION OBJECTIVES</div>
          <div class="briefing-item">1. Infiltrate Sector 0 Decontamination Airlock</div>
          <div class="briefing-item">2. Retrieve Access Core 01 (Lab-01) & Access Core 02 (Vault-02)</div>
          <div class="briefing-item">3. Evacuate via Sector 9 Extraction before the Warden detects you</div>
        </div>

        <div class="controls-card">
          <div class="controls-grid">
            <div class="ctrl-col"><span class="key-badge">W A S D</span> Movement</div>
            <div class="ctrl-col"><span class="key-badge">SHIFT</span> Sprint (Noisy!)</div>
            <div class="ctrl-col"><span class="key-badge">SPACE</span> Jump</div>
            <div class="ctrl-col"><span class="key-badge">MOUSE</span> Look Camera</div>
            <div class="ctrl-col"><span class="key-badge">E</span> Interact / Gate / Cores</div>
            <div class="ctrl-col"><span class="key-badge">ESC</span> Pause Menu</div>
          </div>
        </div>

        <button class="menu-btn primary-btn" id="btn-start-game">START MISSION</button>
      </div>
    `;
    this.root.appendChild(this.titleEl);

    // Bind Start Button
    setTimeout(() => {
      const startBtn = document.getElementById('btn-start-game');
      if (startBtn) {
        startBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onStartGame) this._onStartGame();
        });
      }
    }, 0);

    // ────────────────────────────────────────────────────────────────────────
    // 4. Tactical Pause & Settings Overlay (PART 3)
    // ────────────────────────────────────────────────────────────────────────
    this.pauseEl = document.createElement('div');
    this.pauseEl.id = 'pause-menu';
    this.pauseEl.className = 'menu-overlay pause-overlay';
    this.pauseEl.innerHTML = `
      <div class="menu-card pause-card">
        <div class="title-badge">SECURITY OVERRIDE</div>
        <h2 class="pause-title">TACTICAL PAUSE</h2>
        <p class="title-sub">FACILITY SURVEILLANCE TEMPORARILY SUSPENDED</p>

        <div class="settings-panel">
          <div class="setting-row">
            <div class="setting-label">
              <span>MASTER VOLUME</span>
              <span id="volume-val">80%</span>
            </div>
            <input type="range" id="slider-volume" min="0" max="100" value="80" class="cyber-slider">
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span>MOUSE SENSITIVITY</span>
              <span id="sensitivity-val">100%</span>
            </div>
            <input type="range" id="slider-sensitivity" min="50" max="200" value="100" class="cyber-slider">
          </div>
        </div>

        <div class="pause-actions">
          <button class="menu-btn primary-btn" id="btn-pause-resume">RESUME</button>
          <button class="menu-btn secondary-btn" id="btn-pause-restart">RESTART MISSION</button>
        </div>
      </div>
    `;
    this.root.appendChild(this.pauseEl);

    // Bind Pause Menu Elements
    setTimeout(() => {
      const resumeBtn = document.getElementById('btn-pause-resume');
      if (resumeBtn) {
        resumeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onResume) this._onResume();
        });
      }

      const restartBtn = document.getElementById('btn-pause-restart');
      if (restartBtn) {
        restartBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onRestart) this._onRestart();
        });
      }

      const volumeSlider = document.getElementById('slider-volume');
      const volumeVal = document.getElementById('volume-val');
      if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          if (volumeVal) volumeVal.textContent = `${val}%`;
          this.volume = val / 100;
          if (this._onVolumeChange) this._onVolumeChange(this.volume);
        });
      }

      const sensSlider = document.getElementById('slider-sensitivity');
      const sensVal = document.getElementById('sensitivity-val');
      if (sensSlider) {
        sensSlider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          if (sensVal) sensVal.textContent = `${val}%`;
          this.sensitivityMultiplier = val / 100;
          if (this._onSensitivityChange) this._onSensitivityChange(this.sensitivityMultiplier);
        });
      }
    }, 0);

    // Initial render states
    this.updateObjective(0, 2);
    this.updateWardenState('PATROL');
    this.setPrompt(null);
    this.hideOverlay();
    this.hidePauseMenu();
    this.showTitleScreen();
  }

  // ── Title & Pause Screen Visibility ───────────────────────────────────────

  showTitleScreen() {
    if (this.titleEl) this.titleEl.classList.add('visible');
    if (this.objectiveEl) this.objectiveEl.style.display = 'none';
    if (this.wardenStateEl) this.wardenStateEl.style.display = 'none';
  }

  hideTitleScreen() {
    if (this.titleEl) this.titleEl.classList.remove('visible');
    if (this.objectiveEl) this.objectiveEl.style.display = 'block';
    if (this.wardenStateEl) this.wardenStateEl.style.display = 'block';
  }

  showPauseMenu() {
    if (this.pauseEl) this.pauseEl.classList.add('visible');
    this.setPrompt(null); // Cleanly hide prompts during pause
  }

  hidePauseMenu() {
    if (this.pauseEl) this.pauseEl.classList.remove('visible');
  }

  // ── Objective Counter ─────────────────────────────────────────────────────

  updateObjective(collected, total) {
    this.coresCollected = collected;
    this.totalCores = total;
    if (this.objectiveEl) {
      let pips = '';
      for (let i = 0; i < total; i++) {
        pips += `<span class="hud-pip ${i < collected ? 'active' : ''}">◆</span>`;
      }
      this.objectiveEl.innerHTML = `
        <div class="hud-label">ACCESS CORES</div>
        <div class="hud-value">${collected} / ${total} <span class="hud-pips">${pips}</span></div>
      `;
    }
  }

  // ── Warden Threat Telemetry ───────────────────────────────────────────────

  updateWardenState(state) {
    this.wardenState = state;
    if (!this.wardenStateEl) return;

    let colorClass = 'state-patrol';
    if (state === 'HUNT') colorClass = 'state-hunt';
    else if (state === 'SEARCH') colorClass = 'state-search';

    this.wardenStateEl.innerHTML = `
      <div class="hud-label">WARDEN</div>
      <div class="hud-value ${colorClass}">${state}</div>
    `;

    if (state === 'HUNT') {
      this._showWarning('⚠ WARDEN IS HUNTING YOU');
    } else if (state === 'SEARCH') {
      this._showWarning('⚠ WARDEN ALERTED');
    } else {
      this._hideWarning();
    }
  }

  // ── Contextual Interaction Prompt ─────────────────────────────────────────

  setPrompt(text) {
    this.currentPrompt = text;
    if (!this.promptEl) return;
    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.classList.add('visible');
    } else {
      this.promptEl.classList.remove('visible');
    }
  }

  // ── Feedback Announcement Banner ──────────────────────────────────────────

  showFeedback(text, duration = 2500) {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = text;
    this.feedbackEl.classList.add('visible');

    if (this._feedbackTimeout) clearTimeout(this._feedbackTimeout);
    this._feedbackTimeout = setTimeout(() => {
      this.feedbackEl.classList.remove('visible');
    }, duration);
  }

  _showWarning(text) {
    if (!this.warningEl) return;
    this.warningEl.textContent = text;
    this.warningEl.classList.add('visible');
    this._warningVisible = true;
  }

  _hideWarning() {
    if (!this.warningEl) return;
    this.warningEl.classList.remove('visible');
    this._warningVisible = false;
  }

  // ── Win / Lose Overlays ───────────────────────────────────────────────────

  showWinOverlay() {
    if (!this.overlayEl) return;
    this.setPrompt(null);
    this.overlayEl.innerHTML = `
      <div class="overlay-content win">
        <div class="overlay-icon">✦</div>
        <h1 class="overlay-title">MISSION COMPLETE</h1>
        <p class="overlay-subtitle">FACILITY EVACUATED // THE WARDEN ESCAPED</p>
        <div class="overlay-stats">ACCESS CORES ACQUIRED: ${this.coresCollected} / ${this.totalCores}</div>
        <button class="overlay-btn" id="btn-restart-win">RESTART MISSION</button>
      </div>
    `;
    this.overlayEl.classList.add('visible');
    this._bindRestartButton('btn-restart-win');
  }

  showLoseOverlay() {
    if (!this.overlayEl) return;
    this.setPrompt(null);
    this.overlayEl.innerHTML = `
      <div class="overlay-content lose">
        <div class="overlay-icon">✖</div>
        <h1 class="overlay-title">SIGNAL LOST</h1>
        <p class="overlay-subtitle">THE WARDEN HAS ELIMINATED THE INTRUDER</p>
        <div class="overlay-stats">ACCESS CORES ACQUIRED: ${this.coresCollected} / ${this.totalCores}</div>
        <button class="overlay-btn" id="btn-restart-lose">RESTART MISSION</button>
      </div>
    `;
    this.overlayEl.classList.add('visible');
    this._bindRestartButton('btn-restart-lose');
  }

  hideOverlay() {
    if (!this.overlayEl) return;
    this.overlayEl.classList.remove('visible');
    this.overlayEl.innerHTML = '';
  }

  _bindRestartButton(id) {
    setTimeout(() => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onRestart) this._onRestart();
        }, { once: true });
      }
    }, 0);
  }

  // ── Reset for Restart ─────────────────────────────────────────────────────

  reset() {
    this.updateObjective(0, 2);
    this.updateWardenState('PATROL');
    this.setPrompt(null);
    this.hideOverlay();
    this.hidePauseMenu();
    this.hideTitleScreen();
    this._hideWarning();
    if (this._feedbackTimeout) {
      clearTimeout(this._feedbackTimeout);
      this._feedbackTimeout = null;
    }
    if (this.feedbackEl) this.feedbackEl.classList.remove('visible');
  }
}

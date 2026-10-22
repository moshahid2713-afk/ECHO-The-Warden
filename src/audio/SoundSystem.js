/**
 * SoundSystem — Lightweight Synthesized Web Audio API Sound Engine
 * Zero external audio assets required.
 * Provides atmospheric facility drone, hydraulic door sound, core chimes,
 * Warden alerts, victory fanfare, defeat distortion, and UI clicks.
 */

export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;

    this.volume = 0.8;
    this.muted = false;
    this.isAmbientPlaying = false;
  }

  /**
   * Initializes the AudioContext upon user gesture (e.g. clicking START MISSION)
   */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.startAmbientDrone();
    } catch (e) {
      console.warn('AudioContext initialization deferred or unavailable:', e);
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
  }

  // ── Ambient Facility Hum ──────────────────────────────────────────────────

  startAmbientDrone() {
    if (!this.ctx || this.isAmbientPlaying) return;

    try {
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.06, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, this.ctx.currentTime);

      this.ambientOsc1 = this.ctx.createOscillator();
      this.ambientOsc1.type = 'sine';
      this.ambientOsc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1 sub-hum

      this.ambientOsc2 = this.ctx.createOscillator();
      this.ambientOsc2.type = 'triangle';
      this.ambientOsc2.frequency.setValueAtTime(110, this.ctx.currentTime); // A2 harmonic

      this.ambientOsc1.connect(filter);
      this.ambientOsc2.connect(filter);
      filter.connect(this.ambientGain);
      this.ambientGain.connect(this.masterGain);

      this.ambientOsc1.start();
      this.ambientOsc2.start();
      this.isAmbientPlaying = true;
    } catch (e) {}
  }

  pauseAmbient() {
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  resumeAmbient() {
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(0.06, this.ctx.currentTime, 0.05);
    }
  }

  // ── Procedural Sound Effects ──────────────────────────────────────────────

  playButtonClick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.045);
    } catch (e) {}
  }

  playDoorOpen() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      // 1. Hydraulic decompression hiss (white noise burst)
      const bufferSize = this.ctx.sampleRate * 0.7;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1200, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(300, now + 0.65);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.18, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.7);

      // 2. Heavy servo glide
      const servo = this.ctx.createOscillator();
      const servoGain = this.ctx.createGain();
      servo.type = 'sawtooth';
      servo.frequency.setValueAtTime(140, now);
      servo.frequency.linearRampToValueAtTime(85, now + 0.8);

      const servoFilter = this.ctx.createBiquadFilter();
      servoFilter.type = 'lowpass';
      servoFilter.frequency.setValueAtTime(350, now);

      servoGain.gain.setValueAtTime(0.12, now);
      servoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      servo.connect(servoFilter);
      servoFilter.connect(servoGain);
      servoGain.connect(this.masterGain);
      servo.start(now);
      servo.stop(now + 0.9);
    } catch (e) {}
  }

  playCoreCollected() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch (e) {}
  }

  playWardenAlert(state) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      if (state === 'HUNT') {
        // Crimson alarm klaxon
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.linearRampToValueAtTime(140, now + 0.28);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(700, now);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (state === 'SEARCH') {
        // Amber warning sonar ping
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.08);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.26);
      }
    } catch (e) {}
  }

  playExitUnlocked() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.45);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.65);
    } catch (e) {}
  }

  playVictory() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = now + idx * 0.12;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.85);
      });
    } catch (e) {}
  }

  playDefeat() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.7);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.7);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.8);
    } catch (e) {}
  }
}

export const soundSystem = new SoundSystem();

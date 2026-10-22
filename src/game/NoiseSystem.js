import * as THREE from 'three';

export class NoiseSystem {
  constructor() {
    this.events = [];
    this.maxEventAge = 2.0; // Seconds to keep active noise events
  }

  /**
   * Emit a noise event into the environment
   * @param {THREE.Vector3} position - World coordinates of noise source
   * @param {number} strength - Loudness / radius of noise (e.g. walk: 1.8, sprint: 4.5, jump: 7.5)
   * @param {string} type - 'walk' | 'sprint' | 'jump'
   */
  emit(position, strength, type = 'walk') {
    const event = {
      position: position.clone(),
      strength,
      type,
      timestamp: performance.now() / 1000
    };

    this.events.push(event);

    // Keep event list tidy
    if (this.events.length > 30) {
      this.events.shift();
    }
  }

  /**
   * Get all active recent noise events within maxAgeSeconds
   */
  getRecentEvents(maxAgeSeconds = 1.5) {
    const now = performance.now() / 1000;
    // Filter expired
    this.events = this.events.filter((e) => now - e.timestamp <= this.maxEventAge);
    return this.events.filter((e) => now - e.timestamp <= maxAgeSeconds);
  }

  /**
   * Get the loudest recent noise event heard relative to listener position
   */
  getLoudestHeardEvent(listenerPos, rangeMultiplier = 1.25) {
    const recent = this.getRecentEvents(1.5);
    let loudest = null;
    let maxAudibleRatio = 0;

    for (const ev of recent) {
      const dist = Math.hypot(
        listenerPos.x - ev.position.x,
        listenerPos.z - ev.position.z
      );

      // Audible if distance <= noise strength * rangeMultiplier
      const maxRange = ev.strength * rangeMultiplier;
      if (dist <= maxRange) {
        const audibleRatio = maxRange - dist;
        if (audibleRatio > maxAudibleRatio) {
          maxAudibleRatio = audibleRatio;
          loudest = {
            ...ev,
            distance: dist
          };
        }
      }
    }

    return loudest;
  }
}

// Global shared singleton for noise dispatching
export const noiseSystem = new NoiseSystem();

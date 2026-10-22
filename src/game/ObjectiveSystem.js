/**
 * ObjectiveSystem — Manages Access Cores and the locked Exit
 * 
 * - Spawns 2 Access Core collectibles at hardcoded walkable maze positions
 * - Handles proximity-based interaction prompts and E-key collection
 * - Tracks collection count and exit lock/unlock state
 * - Creates 3D visuals: glowing cores with rotating rings and floating animation
 * - Integrates with GameState to trigger victory on exit interaction
 */

import * as THREE from 'three';
import { GAME_STATE } from './GameState.js';

// Interaction radius (world units) — player must be within this distance
const INTERACT_RADIUS = 2.2;
// Minimum distance between player and object centre through walls
const WALL_CHECK_HEIGHT = 1.1;

export class ObjectiveSystem {
  /**
   * @param {Object} maze - Maze instance
   * @param {Object} player - Player instance
   * @param {THREE.Scene} scene - Three.js scene
   * @param {GameState} gameState - GameState instance
   */
  constructor(maze, player, scene, gameState) {
    this.maze = maze;
    this.player = player;
    this.scene = scene;
    this.gameState = gameState;

    // Objective tracking
    this.coresCollected = 0;
    this.totalCores = 2;
    this.exitUnlocked = false;
    this.victoryTriggered = false;

    // Core data objects
    this.cores = [];

    // Interaction state
    this.interactPressed = false;
    this.interactConsumed = false;
    this.nearbyInteractable = null; // { type: 'core' | 'exit', index?, ... }

    // Raycaster for wall-check between player and interactable
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = INTERACT_RADIUS + 1.0;

    // Exit visuals
    this.exitGroup = null;
    this.exitLight = null;
    this.exitBeam = null;

    // Callbacks for HUD
    this._onPromptChange = null;
    this._onCoreCollected = null;
    this._onExitUnlocked = null;
    this._onVictory = null;

    this._animTime = 0;

    this._createCores();
    this._createExitVisuals();
    this._setupInput();
  }

  // --- Public API ---

  onPromptChange(fn) { this._onPromptChange = fn; }
  onCoreCollected(fn) { this._onCoreCollected = fn; }
  onExitUnlocked(fn) { this._onExitUnlocked = fn; }
  onVictory(fn) { this._onVictory = fn; }

  get prompt() {
    if (!this.nearbyInteractable) return null;
    if (this.nearbyInteractable.type === 'core') {
      return `PRESS E — COLLECT ${this.nearbyInteractable.name}`;
    }
    if (this.nearbyInteractable.type === 'exit') {
      return this.exitUnlocked
        ? 'PRESS E — ESCAPE'
        : `EXIT LOCKED — ${this.totalCores - this.coresCollected} ACCESS CORE${this.totalCores - this.coresCollected !== 1 ? 'S' : ''} REQUIRED`;
    }
    return null;
  }

  // --- Core Placement ---

  _getCorePositions() {
    return [
      { row: 3, col: 2, name: 'ACCESS CORE 01 (LAB-01)' },
      { row: 9, col: 12, name: 'ACCESS CORE 02 (VAULT-02)' }
    ];
  }

  _createCores() {
    const positions = this._getCorePositions();

    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x18202c,
      metalness: 0.88,
      roughness: 0.35
    });

    const prongMat = new THREE.MeshStandardMaterial({
      color: 0x222c3d,
      metalness: 0.9,
      roughness: 0.25
    });

    const cyanGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    for (let i = 0; i < positions.length; i++) {
      const { row, col, name } = positions[i];
      const worldPos = this.maze.gridToWorld(col, row, 0);

      // 1. Permanent Ground Pedestal Structure
      const pedestalGroup = new THREE.Group();
      pedestalGroup.position.set(worldPos.x, 0, worldPos.z);

      // Base octagonal console
      const baseGeo = new THREE.CylinderGeometry(0.55, 0.72, 0.24, 8);
      const baseMesh = new THREE.Mesh(baseGeo, pedestalMat);
      baseMesh.position.y = 0.12;
      baseMesh.receiveShadow = true;
      pedestalGroup.add(baseMesh);

      // Glowing circuit ring
      const ringGlowGeo = new THREE.RingGeometry(0.42, 0.48, 16);
      const ringGlow = new THREE.Mesh(ringGlowGeo, cyanGlowMat);
      ringGlow.rotation.x = -Math.PI / 2;
      ringGlow.position.y = 0.241;
      pedestalGroup.add(ringGlow);

      // 4 Vertical containment pylons
      const prongGeo = new THREE.BoxGeometry(0.08, 0.48, 0.08);
      for (let p = 0; p < 4; p++) {
        const angle = (p * Math.PI) / 2 + Math.PI / 4;
        const px = Math.cos(angle) * 0.46;
        const pz = Math.sin(angle) * 0.46;
        const prong = new THREE.Mesh(prongGeo, prongMat);
        prong.position.set(px, 0.36, pz);
        pedestalGroup.add(prong);

        // Prong emitter tip
        const tipGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
        const tip = new THREE.Mesh(tipGeo, cyanGlowMat);
        tip.position.set(px, 0.61, pz);
        pedestalGroup.add(tip);
      }

      this.scene.add(pedestalGroup);

      // 2. Floating Energy Core (collected & removed on interaction)
      const coreGroup = new THREE.Group();
      coreGroup.position.set(worldPos.x, 0.85, worldPos.z);

      // Inner faceted core
      const sphereGeo = new THREE.IcosahedronGeometry(0.2, 2);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x00ccff,
        emissive: 0x00e1ff,
        emissiveIntensity: 1.6,
        roughness: 0.15,
        metalness: 0.5,
        transparent: true,
        opacity: 0.92
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      coreGroup.add(sphere);

      // Outer rotating ring 1
      const ring1Geo = new THREE.TorusGeometry(0.36, 0.022, 8, 36);
      const ring1Mat = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 1.1,
        roughness: 0.2,
        metalness: 0.85
      });
      const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
      ring1.rotation.x = Math.PI / 2;
      coreGroup.add(ring1);

      // Outer rotating ring 2 (perpendicular)
      const ring2 = new THREE.Mesh(ring1Geo, ring1Mat.clone());
      ring2.rotation.x = 0;
      ring2.rotation.y = Math.PI / 2;
      coreGroup.add(ring2);

      // Point light glow
      const light = new THREE.PointLight(0x00ccff, 2.8, 6.0);
      light.position.set(0, 0, 0);
      coreGroup.add(light);

      this.scene.add(coreGroup);

      this.cores.push({
        name,
        row,
        col,
        worldPos: worldPos.clone(),
        group: coreGroup,
        pedestalGroup,
        sphere,
        ring1,
        ring2,
        light,
        sphereMat,
        collected: false,
        baseY: 0.85
      });
    }
  }

  _createExitVisuals() {
    if (!this.maze.exitWorld) return;

    const exitPos = this.maze.exitWorld;

    this.exitGroup = new THREE.Group();
    this.exitGroup.position.set(exitPos.x, 0, exitPos.z);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x161c28,
      metalness: 0.9,
      roughness: 0.3
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x242e3f,
      metalness: 0.85,
      roughness: 0.35
    });

    // 1. Reinforced Door Jambs (Left & Right)
    const jambGeo = new THREE.BoxGeometry(0.32, 2.5, 0.4);
    const jambL = new THREE.Mesh(jambGeo, frameMat);
    jambL.position.set(-1.05, 1.25, 0);
    jambL.castShadow = true;
    this.exitGroup.add(jambL);

    const jambR = new THREE.Mesh(jambGeo, frameMat);
    jambR.position.set(1.05, 1.25, 0);
    jambR.castShadow = true;
    this.exitGroup.add(jambR);

    // 2. Heavy Top Lintel Beam
    const lintelGeo = new THREE.BoxGeometry(2.42, 0.32, 0.45);
    const lintel = new THREE.Mesh(lintelGeo, trimMat);
    lintel.position.set(0, 2.45, 0);
    lintel.castShadow = true;
    this.exitGroup.add(lintel);

    // 3. Status Display Plate across lintel
    this.exitStatusMat = new THREE.MeshBasicMaterial({
      color: 0xff2244
    });
    const statusPlateGeo = new THREE.BoxGeometry(1.6, 0.08, 0.04);
    this.exitStatusPlate = new THREE.Mesh(statusPlateGeo, this.exitStatusMat);
    this.exitStatusPlate.position.set(0, 2.45, 0.23);
    this.exitGroup.add(this.exitStatusPlate);

    // 4. Dual Warning Flasher Beacons atop lintel
    const beaconGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.beaconL = new THREE.Mesh(beaconGeo, this.exitStatusMat);
    this.beaconL.position.set(-0.95, 2.65, 0.15);
    this.exitGroup.add(this.beaconL);

    this.beaconR = new THREE.Mesh(beaconGeo, this.exitStatusMat);
    this.beaconR.position.set(0.95, 2.65, 0.15);
    this.exitGroup.add(this.beaconR);

    // 5. Vertical Force Field Laser Curtains
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.45
    });
    this.exitBeam = new THREE.Mesh(beamGeo, beamMat);
    this.exitBeam.position.set(0, 1.2, 0);
    this.exitGroup.add(this.exitBeam);

    // Flanking secondary laser beams
    this.exitBeamL = new THREE.Mesh(beamGeo, beamMat);
    this.exitBeamL.position.set(-0.5, 1.2, 0);
    this.exitGroup.add(this.exitBeamL);

    this.exitBeamR = new THREE.Mesh(beamGeo, beamMat);
    this.exitBeamR.position.set(0.5, 1.2, 0);
    this.exitGroup.add(this.exitBeamR);

    // 6. Security Barrier Cross-bar
    const barGeo = new THREE.BoxGeometry(2.1, 0.14, 0.14);
    const barMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0xff2244,
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
    this.exitBar = new THREE.Mesh(barGeo, barMat);
    this.exitBar.position.y = 1.3;
    this.exitGroup.add(this.exitBar);
    this.exitBarMat = barMat;

    // 7. Dynamic Exit Point Light
    this.exitPointLight = new THREE.PointLight(0xff2244, 2.5, 7.0);
    this.exitPointLight.position.set(0, 2.0, 0.3);
    this.exitGroup.add(this.exitPointLight);

    this.scene.add(this.exitGroup);
  }

  // --- Input ---

  _setupInput() {
    this._keyDownHandler = (e) => {
      if (e.code === 'KeyE' && !e.repeat) {
        this.interactPressed = true;
      }
    };
    this._keyUpHandler = (e) => {
      if (e.code === 'KeyE') {
        this.interactPressed = false;
        this.interactConsumed = false;
      }
    };
    window.addEventListener('keydown', this._keyDownHandler);
    window.addEventListener('keyup', this._keyUpHandler);
  }

  removeInputListeners() {
    window.removeEventListener('keydown', this._keyDownHandler);
    window.removeEventListener('keyup', this._keyUpHandler);
  }

  // --- Wall Check ---

  _isBlockedByWall(fromPos, toPos) {
    if (!this.maze.wallMeshes || this.maze.wallMeshes.length === 0) return false;

    const origin = new THREE.Vector3(fromPos.x, WALL_CHECK_HEIGHT, fromPos.z);
    const target = new THREE.Vector3(toPos.x, WALL_CHECK_HEIGHT, toPos.z);
    const dir = target.clone().sub(origin);
    const dist = dir.length();
    dir.normalize();

    this.raycaster.set(origin, dir);
    this.raycaster.far = dist;
    const hits = this.raycaster.intersectObjects(this.maze.wallMeshes, false);
    return hits.length > 0 && hits[0].distance < dist - 0.1;
  }

  // --- Update ---

  update(delta) {
    if (!this.gameState.isPlaying) return;

    this._animTime += delta;

    // Animate cores
    for (const core of this.cores) {
      if (core.collected) continue;

      // Floating bob
      core.group.position.y = core.baseY + Math.sin(this._animTime * 2.0 + core.row) * 0.15;

      // Rotate rings
      core.ring1.rotation.z += delta * 1.5;
      core.ring2.rotation.x += delta * 1.2;

      // Pulse glow
      const pulse = 1.0 + Math.sin(this._animTime * 3.0 + core.col) * 0.4;
      core.sphereMat.emissiveIntensity = 1.5 * pulse;
      core.light.intensity = 2.5 * pulse;
    }

    // Animate exit beam
    if (this.exitBeam) {
      const beamPulse = 0.25 + Math.sin(this._animTime * 2.5) * 0.1;
      this.exitBeam.material.opacity = beamPulse;
    }

    // --- Proximity & interaction detection ---
    this.nearbyInteractable = null;

    const playerPos = this.player.position;

    // Check cores
    for (let i = 0; i < this.cores.length; i++) {
      const core = this.cores[i];
      if (core.collected) continue;

      const dist = Math.hypot(
        playerPos.x - core.worldPos.x,
        playerPos.z - core.worldPos.z
      );

      if (dist <= INTERACT_RADIUS) {
        // Wall check
        if (!this._isBlockedByWall(playerPos, core.worldPos)) {
          this.nearbyInteractable = { type: 'core', index: i, name: core.name };
          break;
        }
      }
    }

    // Check exit (only if no core is nearby — cores take priority)
    if (!this.nearbyInteractable && this.maze.exitWorld) {
      const exitPos = this.maze.exitWorld;
      const dist = Math.hypot(
        playerPos.x - exitPos.x,
        playerPos.z - exitPos.z
      );
      if (dist <= INTERACT_RADIUS) {
        if (!this._isBlockedByWall(playerPos, exitPos)) {
          this.nearbyInteractable = { type: 'exit' };
        }
      }
    }

    // Notify prompt change
    if (this._onPromptChange) {
      this._onPromptChange(this.prompt);
    }

    // Handle E press interaction
    if (this.interactPressed && !this.interactConsumed && this.nearbyInteractable) {
      this.interactConsumed = true;
      this._handleInteraction(this.nearbyInteractable);
    }
  }

  _handleInteraction(interactable) {
    if (!this.gameState.isPlaying) return;

    if (interactable.type === 'core') {
      const core = this.cores[interactable.index];
      if (core.collected) return;

      core.collected = true;
      this.coresCollected++;

      // Remove visual
      this.scene.remove(core.group);

      // Check if exit should unlock
      if (this.coresCollected >= this.totalCores) {
        this.exitUnlocked = true;
        this._updateExitVisuals(true);
        if (this._onExitUnlocked) this._onExitUnlocked();
      }

      if (this._onCoreCollected) {
        this._onCoreCollected(core.name, this.coresCollected, this.totalCores);
      }
    } else if (interactable.type === 'exit') {
      if (!this.exitUnlocked) return; // Locked — do nothing (prompt already shown)
      if (this.victoryTriggered) return;

      this.victoryTriggered = true;
      this.gameState.transition(GAME_STATE.WON);
      if (this._onVictory) this._onVictory();
    }
  }

  _updateExitVisuals(unlocked) {
    const colorHex = unlocked ? 0x00ff88 : 0xff2244;
    const lightInt = unlocked ? 3.5 : 2.5;
    const beamOp = unlocked ? 0.6 : 0.45;

    if (this.exitBeam) {
      this.exitBeam.material.color.setHex(colorHex);
      this.exitBeam.material.opacity = beamOp;
    }
    if (this.exitBeamL) {
      this.exitBeamL.material.color.setHex(colorHex);
      this.exitBeamL.material.opacity = beamOp * 0.8;
    }
    if (this.exitBeamR) {
      this.exitBeamR.material.color.setHex(colorHex);
      this.exitBeamR.material.opacity = beamOp * 0.8;
    }
    if (this.exitBarMat) {
      this.exitBarMat.color.setHex(colorHex);
      this.exitBarMat.emissive.setHex(colorHex);
      this.exitBarMat.emissiveIntensity = unlocked ? 1.2 : 0.6;
    }
    if (this.exitStatusMat) {
      this.exitStatusMat.color.setHex(colorHex);
    }
    if (this.exitBar) {
      this.exitBar.position.y = unlocked ? 0.15 : 1.3;
    }
    if (this.exitPointLight) {
      this.exitPointLight.color.setHex(colorHex);
      this.exitPointLight.intensity = lightInt;
    }
  }

  // --- Reset for restart ---

  reset() {
    this.coresCollected = 0;
    this.exitUnlocked = false;
    this.victoryTriggered = false;
    this.nearbyInteractable = null;
    this.interactPressed = false;
    this.interactConsumed = false;
    this._animTime = 0;

    // Clean up old core objects & pedestals
    for (const core of this.cores) {
      this.scene.remove(core.group);
      if (core.pedestalGroup) {
        this.scene.remove(core.pedestalGroup);
      }
    }
    this.cores = [];
    this._createCores();

    // Reset exit visuals
    this._updateExitVisuals(false);
  }

  // --- Cleanup ---

  dispose() {
    this.removeInputListeners();
    for (const core of this.cores) {
      this.scene.remove(core.group);
      if (core.pedestalGroup) {
        this.scene.remove(core.pedestalGroup);
      }
    }
    if (this.exitGroup) {
      this.scene.remove(this.exitGroup);
    }
  }
}

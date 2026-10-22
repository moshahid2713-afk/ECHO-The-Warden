import * as THREE from 'three';
import { AStar } from './AStar.js';
import { Perception } from './Perception.js';
import { noiseSystem } from '../game/NoiseSystem.js';

export const AI_STATE = {
  PATROL: 'PATROL',
  SEARCH: 'SEARCH',
  HUNT: 'HUNT'
};

export class WardenAI {
  constructor(warden, player, maze, scene, options = {}) {
    this.warden = warden;
    this.player = player;
    this.maze = maze;
    this.scene = scene;

    // Movement speeds per state
    this.speeds = {
      [AI_STATE.PATROL]: 1.5,
      [AI_STATE.SEARCH]: 2.0,
      [AI_STATE.HUNT]: 3.0
    };
    this.turnSpeed = 8.0;
    this.facingAngle = 0;

    // State Machine
    this.currentState = AI_STATE.PATROL;

    // Perception system (vision + hearing)
    this.perception = new Perception(maze, scene, {
      visionRange: 10.0,
      visionFov: 75 * (Math.PI / 180),
      showDebugCone: true
    });
    this.perceptionTimer = 0;
    this.perceptionInterval = 1.0 / 12.0; // ~12 checks per second

    // Detection tracking
    this.playerVisible = false;
    this.noiseEvent = null;
    this.lastKnownPosition = new THREE.Vector3();
    this.lastKnownCell = { row: -1, col: -1 };
    this.hasLastKnown = false;

    // SEARCH state
    this.searchDuration = options.searchDuration || 5.0;
    this.searchTimer = 0;
    this.searchScanAngle = 0;
    this.arrivedAtLastKnown = false;

    // PATROL state — 5 guaranteed walkable waypoints covering the 15x15 facility
    this.patrolPoints = [
      { row: 13, col: 1 },  // Sector 8 Containment (Spawn)
      { row: 7, col: 1 },   // West Corridor
      { row: 7, col: 7 },   // Central Quantum Core Hub
      { row: 9, col: 12 },  // Sector 2 (Vault-02)
      { row: 13, col: 13 }  // Sector 9 (Extraction Airlock)
    ];
    this.currentPatrolIndex = 0;
    this.patrolWaitTimer = 0;
    this.patrolWaitDuration = 1.8;

    // Path tracking
    this.recalcInterval = 0.35;
    this.recalcTimer = 0;
    this.currentPathGrid = [];
    this.worldWaypoints = [];
    this.currentWaypointIndex = 1;
    this.targetNodeWorld = new THREE.Vector3();
    this.pathFound = false;

    // Debug cells
    this.wardenCell = { row: -1, col: -1 };
    this.playerCell = { row: -1, col: -1 };
    this.distToPlayer = 0;

    // Initialize debug UI
    this._initDebugUI();
    this._initDebugVisualizer();

    // Set initial visual and plan first path
    this.warden.setVisualState(this.currentState);
    this._planPathToCurrentGoal();
  }

  // ---- Debug UI -----------------------------------------------------------

  _initDebugUI() {
    let overlay = document.getElementById('ai-debug-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ai-debug-overlay';
      overlay.style.cssText = [
        'position: fixed', 'bottom: 14px', 'left: 14px',
        'background: rgba(6, 10, 18, 0.78)',
        'border: 1px solid rgba(0, 240, 255, 0.3)', 'border-radius: 4px',
        'padding: 8px 12px', 'color: #7ee8fa',
        'font-family: "Share Tech Mono", monospace', 'font-size: 10px',
        'line-height: 1.45', 'z-index: 90',
        'pointer-events: none',
        'box-shadow: 0 0 10px rgba(0, 240, 255, 0.1)',
        'min-width: 240px',
        'backdrop-filter: blur(4px)'
      ].join(';');
      document.body.appendChild(overlay);
    }
    this.debugOverlay = overlay;
  }

  _updateDebugUI() {
    if (!this.debugOverlay) return;

    let stateColor = '#00f0ff';
    if (this.currentState === AI_STATE.HUNT) stateColor = '#ff1133';
    if (this.currentState === AI_STATE.SEARCH) stateColor = '#ffaa00';

    const lkStr = this.hasLastKnown
      ? `(${this.lastKnownPosition.x.toFixed(1)}, ${this.lastKnownPosition.z.toFixed(1)})`
      : 'NONE';

    const noiseStr = this.noiseEvent
      ? `STR ${this.noiseEvent.strength.toFixed(1)} @ ${this.noiseEvent.distance.toFixed(1)}m`
      : '—';

    const visionStr = this.perception.visionStatus;
    let visionColor = '#00f0ff';
    if (visionStr === 'CLEAR') visionColor = '#00ff88';
    else if (visionStr === 'BLOCKED' || visionStr === 'OUT OF FOV') visionColor = '#ff6622';

    this.debugOverlay.innerHTML = `
      <div style="font-weight:bold;color:${stateColor};font-size:13px;margin-bottom:5px">
        ▶ WARDEN AI: <span style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:3px">${this.currentState}</span>
      </div>
      <div>WARDEN CELL: <b>(${this.wardenCell.col}, ${this.wardenCell.row})</b></div>
      <div>PLAYER CELL: <b>(${this.playerCell.col}, ${this.playerCell.row})</b></div>
      <div>DISTANCE: <b>${this.distToPlayer.toFixed(1)} m</b></div>
      <div>VISION: <b style="color:${visionColor}">${visionStr}</b></div>
      <div>LAST KNOWN: <b>${lkStr}</b></div>
      <div>LAST NOISE: <b>${noiseStr}</b></div>
      <div>PATH FOUND: <b style="color:${this.pathFound ? '#00ff88' : '#ff2244'}">${this.pathFound}</b> (LEN: ${this.currentPathGrid.length})</div>
      ${this.currentState === AI_STATE.SEARCH
        ? `<div>SEARCH: <b>${Math.max(0, this.searchDuration - this.searchTimer).toFixed(1)}s</b> remaining</div>`
        : ''}
    `;
  }

  // ---- Debug visualizer ---------------------------------------------------

  _initDebugVisualizer() {
    if (!this.scene) return;

    this.lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95
    });
    this.debugLine = new THREE.Line(new THREE.BufferGeometry(), this.lineMat);
    this.debugLine.frustumCulled = false;
    this.scene.add(this.debugLine);

    this.markerGroup = new THREE.Group();
    this.markerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
    this.scene.add(this.markerGroup);
  }

  _updateDebugVisualizer() {
    if (!this.debugLine || !this.markerGroup) return;

    let pathColor = 0x00f0ff;
    if (this.currentState === AI_STATE.HUNT) pathColor = 0xff1133;
    if (this.currentState === AI_STATE.SEARCH) pathColor = 0xffaa00;
    this.lineMat.color.setHex(pathColor);
    this.markerMat.color.setHex(pathColor);

    if (this.worldWaypoints.length < 2) {
      this.debugLine.geometry.setFromPoints([]);
      while (this.markerGroup.children.length > 0) this.markerGroup.remove(this.markerGroup.children[0]);
      return;
    }

    const points = [new THREE.Vector3(this.warden.position.x, 0.25, this.warden.position.z)];
    const si = Math.max(0, this.currentWaypointIndex);
    for (let i = si; i < this.worldWaypoints.length; i++) {
      points.push(new THREE.Vector3(this.worldWaypoints[i].x, 0.25, this.worldWaypoints[i].z));
    }
    this.debugLine.geometry.setFromPoints(points);

    while (this.markerGroup.children.length > 0) this.markerGroup.remove(this.markerGroup.children[0]);
    for (let i = si; i < this.worldWaypoints.length; i++) {
      const m = new THREE.Mesh(this.markerGeo, this.markerMat);
      m.position.set(this.worldWaypoints[i].x, 0.06, this.worldWaypoints[i].z);
      this.markerGroup.add(m);
    }
  }

  // ---- State Machine -------------------------------------------------------

  _transitionTo(newState) {
    if (this.currentState === newState) return;
    const old = this.currentState;
    this.currentState = newState;
    console.log(`[AI STATE] ${old} → ${newState}`);
    this.warden.setVisualState(newState);

    if (newState === AI_STATE.HUNT) {
      this.arrivedAtLastKnown = false;
      this.searchTimer = 0;
      this._planPathToCurrentGoal();
    } else if (newState === AI_STATE.SEARCH) {
      this.searchTimer = 0;
      this.searchScanAngle = 0;
      this.arrivedAtLastKnown = false;
      this._planPathToCurrentGoal();
    } else {
      // PATROL
      this.patrolWaitTimer = 0;
      this._planPathToCurrentGoal();
    }

    this._updateDebugVisualizer();
  }

  // ---- Pathfinding ---------------------------------------------------------

  _planPathToCurrentGoal() {
    const rawWarden = this.maze.worldToGrid(this.warden.position.x, this.warden.position.z);
    this.wardenCell = AStar.getWalkableCell(rawWarden.row, rawWarden.col, this.maze);

    const rawPlayer = this.maze.worldToGrid(this.player.position.x, this.player.position.z);
    this.playerCell = AStar.getWalkableCell(rawPlayer.row, rawPlayer.col, this.maze);

    let targetCell;
    if (this.currentState === AI_STATE.HUNT) {
      targetCell = this.playerCell;
    } else if (this.currentState === AI_STATE.SEARCH) {
      if (this.hasLastKnown) {
        const rawLK = this.maze.worldToGrid(this.lastKnownPosition.x, this.lastKnownPosition.z);
        targetCell = AStar.getWalkableCell(rawLK.row, rawLK.col, this.maze);
        this.lastKnownCell = targetCell;
      } else {
        targetCell = this.playerCell;
      }
    } else {
      targetCell = this.patrolPoints[this.currentPatrolIndex];
    }

    const path = AStar.findPath(this.wardenCell, targetCell, this.maze);
    this.pathFound = path.length > 0;
    this.currentPathGrid = path;

    this.worldWaypoints = path.map((node) =>
      this.maze.gridToWorld(node.col, node.row, this.warden.baseHeight)
    );

    if (this.worldWaypoints.length > 1) {
      this.currentWaypointIndex = 1;
      this.targetNodeWorld.copy(this.worldWaypoints[1]);
    } else if (this.worldWaypoints.length === 1) {
      this.currentWaypointIndex = 0;
      this.targetNodeWorld.copy(this.worldWaypoints[0]);
    }

    this._updateDebugVisualizer();
  }

  // ---- Update loop ---------------------------------------------------------

  update(delta) {
    // ── Compute raw distance (always needed) ─────────────────────────────
    this.distToPlayer = Math.hypot(
      this.player.position.x - this.warden.position.x,
      this.player.position.z - this.warden.position.z
    );

    // ── Perception tick (throttled to ~12/s) ─────────────────────────────
    this.perceptionTimer += delta;
    let visionResult = { canSee: false, status: this.perception.visionStatus };
    let noiseResult = { heard: false, event: null };

    if (this.perceptionTimer >= this.perceptionInterval) {
      this.perceptionTimer = 0;

      // Vision check – pass warden.facingAngle so it uses movement heading
      const wardenForVision = {
        position: this.warden.position,
        facingAngle: this.facingAngle  // AI controller's facing, not mesh
      };
      visionResult = this.perception.canSeePlayer(wardenForVision, this.player);
      noiseResult = this.perception.canHearNoise(this.warden.position, noiseSystem);

      this.playerVisible = visionResult.canSee;
      this.noiseEvent = noiseResult.heard ? noiseResult.event : null;

      // Update last known position when player is visible
      if (this.playerVisible) {
        this.lastKnownPosition.copy(this.player.position);
        this.hasLastKnown = true;
      }

      // Update cone visuals
      this.perception.updateVisuals(
        { position: this.warden.position, facingAngle: this.facingAngle },
        this.currentState
      );
    }

    // ── Update warden/player cells ────────────────────────────────────────
    const rawWarden = this.maze.worldToGrid(this.warden.position.x, this.warden.position.z);
    this.wardenCell = AStar.getWalkableCell(rawWarden.row, rawWarden.col, this.maze);

    const rawPlayer = this.maze.worldToGrid(this.player.position.x, this.player.position.z);
    this.playerCell = AStar.getWalkableCell(rawPlayer.row, rawPlayer.col, this.maze);

    // ── State Machine Transitions ─────────────────────────────────────────
    if (this.currentState === AI_STATE.PATROL) {
      if (this.playerVisible) {
        // VISION triggers HUNT
        this._transitionTo(AI_STATE.HUNT);
      } else if (this.noiseEvent) {
        // NOISE triggers SEARCH toward noise location
        this.lastKnownPosition.copy(this.noiseEvent.position);
        this.hasLastKnown = true;
        this._transitionTo(AI_STATE.SEARCH);
      }

    } else if (this.currentState === AI_STATE.HUNT) {
      if (this.playerVisible) {
        // Continuously update last known while visible
        this.lastKnownPosition.copy(this.player.position);
        this.hasLastKnown = true;
      } else {
        // Player disappeared → SEARCH at last known
        this._transitionTo(AI_STATE.SEARCH);
      }

    } else if (this.currentState === AI_STATE.SEARCH) {
      if (this.playerVisible) {
        // Re-detected during search
        this.lastKnownPosition.copy(this.player.position);
        this.hasLastKnown = true;
        this._transitionTo(AI_STATE.HUNT);
      } else if (this.noiseEvent) {
        // Heard something new during search — update target
        this.lastKnownPosition.copy(this.noiseEvent.position);
        this.hasLastKnown = true;
        this._planPathToCurrentGoal();
      }
    }

    // ── State Behaviour Execution ─────────────────────────────────────────
    const speed = this.speeds[this.currentState] || 2.0;

    if (this.currentState === AI_STATE.HUNT) {
      this.recalcTimer += delta;
      if (this.recalcTimer >= this.recalcInterval) {
        this.recalcTimer = 0;
        this._planPathToCurrentGoal();
      }
      this._moveAlongPath(speed, delta);

    } else if (this.currentState === AI_STATE.SEARCH) {
      const distToLK = this.hasLastKnown
        ? Math.hypot(
          this.lastKnownPosition.x - this.warden.position.x,
          this.lastKnownPosition.z - this.warden.position.z
        )
        : 9999;

      if (!this.arrivedAtLastKnown && distToLK > 0.8) {
        // Transit to last known position
        this.recalcTimer += delta;
        if (this.recalcTimer >= 1.0) {
          this.recalcTimer = 0;
          this._planPathToCurrentGoal();
        }
        this._moveAlongPath(speed, delta);
      } else {
        // Arrived — scan left/right
        this.arrivedAtLastKnown = true;
        this.searchTimer += delta;
        this.searchScanAngle += delta * 2.8;
        this.facingAngle += Math.sin(this.searchScanAngle) * 0.08;
        this.warden.mesh.rotation.y = this.facingAngle;

        if (this.searchTimer >= this.searchDuration) {
          this._transitionTo(AI_STATE.PATROL);
        }
      }

    } else if (this.currentState === AI_STATE.PATROL) {
      if (this.patrolWaitTimer > 0) {
        this.patrolWaitTimer -= delta;
        if (this.patrolWaitTimer <= 0) {
          this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
          this._planPathToCurrentGoal();
        }
      } else {
        const pt = this.patrolPoints[this.currentPatrolIndex];
        const ptWorld = this.maze.gridToWorld(pt.col, pt.row, this.warden.baseHeight);
        const distToPt = Math.hypot(
          ptWorld.x - this.warden.position.x,
          ptWorld.z - this.warden.position.z
        );

        if (distToPt < 0.6 || this.currentWaypointIndex >= this.worldWaypoints.length) {
          this.patrolWaitTimer = this.patrolWaitDuration;
        } else {
          this._moveAlongPath(speed, delta);
        }
      }
    }

    // ── Debug UI & Warden model ───────────────────────────────────────────
    this._updateDebugUI();
    this.warden.update(delta);
  }

  _moveAlongPath(speed, delta) {
    if (this.worldWaypoints.length > 0 && this.currentWaypointIndex < this.worldWaypoints.length) {
      const targetWp = this.worldWaypoints[this.currentWaypointIndex];
      this.targetNodeWorld.copy(targetWp);

      const dx = targetWp.x - this.warden.position.x;
      const dz = targetWp.z - this.warden.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.45) {
        this.currentWaypointIndex++;
        if (this.currentWaypointIndex < this.worldWaypoints.length) {
          this.targetNodeWorld.copy(this.worldWaypoints[this.currentWaypointIndex]);
        }
        this._updateDebugVisualizer();
      } else {
        const step = Math.min(dist, speed * delta);
        this.warden.position.x += (dx / dist) * step;
        this.warden.position.z += (dz / dist) * step;

        const targetAngle = Math.atan2(dx, dz);
        let angleDiff = targetAngle - this.facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.facingAngle += angleDiff * Math.min(1, this.turnSpeed * delta);
        this.warden.mesh.rotation.y = this.facingAngle;
      }
    } else if (this.currentState === AI_STATE.HUNT && this.pathFound) {
      // Final approach inside the same cell
      const dx = this.player.position.x - this.warden.position.x;
      const dz = this.player.position.z - this.warden.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6) {
        const step = Math.min(dist, speed * delta);
        this.warden.position.x += (dx / dist) * step;
        this.warden.position.z += (dz / dist) * step;

        const targetAngle = Math.atan2(dx, dz);
        let angleDiff = targetAngle - this.facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.facingAngle += angleDiff * Math.min(1, this.turnSpeed * delta);
        this.warden.mesh.rotation.y = this.facingAngle;
      }
    }
  }
}

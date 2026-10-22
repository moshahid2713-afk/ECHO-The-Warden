import * as THREE from 'three';

export class Perception {
  constructor(maze, scene, options = {}) {
    this.maze = maze;
    this.scene = scene;

    // Vision parameters
    this.visionRange = options.visionRange || 10.0;
    this.visionFov = options.visionFov || (75 * Math.PI) / 180; // 75 degrees in radians
    this.cosHalfFov = Math.cos(this.visionFov / 2);

    // Raycaster for line-of-sight checks
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = this.visionRange + 2.0;

    // Last known player state
    this.lastKnownPosition = new THREE.Vector3();
    this.lastKnownCell = { row: -1, col: -1 };
    this.hasLastKnown = false;

    // Last checked vision state
    this.visionStatus = 'OUT OF RANGE'; // 'CLEAR' | 'BLOCKED' | 'OUT OF RANGE' | 'OUT OF FOV'
    this.lastCheckedDistance = 0;

    // Temporary Vision Cone Mesh for debug visualization
    this.showDebugCone = options.showDebugCone !== false;
    this._initVisionCone();
  }

  _initVisionCone() {
    if (!this.showDebugCone || !this.scene) return;

    // Create a 2D sector / triangle fan geometry for horizontal vision cone on the floor
    const radius = this.visionRange;
    const halfAngle = this.visionFov / 2;
    const segments = 24;

    const vertices = [0, 0, 0]; // Origin apex
    for (let i = 0; i <= segments; i++) {
      const a = -halfAngle + (i / segments) * this.visionFov;
      // In Three.js, forward facing angle = +Z when angle=0: (sin(a), 0, cos(a))
      vertices.push(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    }

    const indices = [];
    for (let i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);

    this.coneMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.visionConeMesh = new THREE.Mesh(geo, this.coneMat);
    this.visionConeMesh.position.y = 0.2; // Slightly above floor
    this.scene.add(this.visionConeMesh);

    // Wireframe perimeter outline for crisp edge definition
    const lineGeo = new THREE.BufferGeometry();
    const linePoints = [];
    for (let i = 0; i <= segments; i++) {
      const a = -halfAngle + (i / segments) * this.visionFov;
      linePoints.push(new THREE.Vector3(Math.sin(a) * radius, 0.22, Math.cos(a) * radius));
    }
    linePoints.unshift(new THREE.Vector3(0, 0.22, 0));
    linePoints.push(new THREE.Vector3(0, 0.22, 0));
    lineGeo.setFromPoints(linePoints);

    this.coneLineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.55
    });
    this.visionConeLine = new THREE.Line(lineGeo, this.coneLineMat);
    this.scene.add(this.visionConeLine);
  }

  /**
   * Check if Warden can see the player
   * @param {Object} warden - Warden instance with position and facingAngle
   * @param {Object} player - Player instance with position
   * @returns {{ canSee: boolean, status: string, distance: number }}
   */
  canSeePlayer(warden, player) {
    const wardenPos = warden.position;
    const playerPos = player.position;

    // 1. Horizontal distance check
    const dx = playerPos.x - wardenPos.x;
    const dz = playerPos.z - wardenPos.z;
    const dist = Math.hypot(dx, dz);
    this.lastCheckedDistance = dist;

    if (dist > this.visionRange) {
      this.visionStatus = 'OUT OF RANGE';
      return { canSee: false, status: 'OUT OF RANGE', distance: dist };
    }

    // 2. Field of view check (angle between facing direction and vector to player)
    const facingAngle = warden.facingAngle !== undefined ? warden.facingAngle : warden.mesh.rotation.y;
    const forwardX = Math.sin(facingAngle);
    const forwardZ = Math.cos(facingAngle);

    const dirX = dx / dist;
    const dirZ = dz / dist;

    const dot = forwardX * dirX + forwardZ * dirZ;
    if (dot < this.cosHalfFov) {
      this.visionStatus = 'OUT OF FOV';
      return { canSee: false, status: 'OUT OF FOV', distance: dist };
    }

    // 3. Line of sight Raycast check (ray from Warden core to Player torso)
    const origin = new THREE.Vector3(wardenPos.x, 1.4, wardenPos.z);
    const target = new THREE.Vector3(playerPos.x, 1.1, playerPos.z);
    const rayDir = target.clone().sub(origin).normalize();

    this.raycaster.set(origin, rayDir);

    if (this.maze && this.maze.wallMeshes && this.maze.wallMeshes.length > 0) {
      const intersects = this.raycaster.intersectObjects(this.maze.wallMeshes, false);

      if (intersects.length > 0 && intersects[0].distance < dist - 0.25) {
        // A maze wall blocked the line of sight!
        this.visionStatus = 'BLOCKED';
        return { canSee: false, status: 'BLOCKED', distance: dist };
      }
    }

    // Player is fully visible!
    this.visionStatus = 'CLEAR';

    // Update last known player position
    this.lastKnownPosition.copy(playerPos);
    this.hasLastKnown = true;

    return { canSee: true, status: 'CLEAR', distance: dist };
  }

  /**
   * Check if Warden can hear any recent noise events
   * @param {THREE.Vector3} wardenPos
   * @param {NoiseSystem} noiseSystem
   * @returns {{ heard: boolean, event: Object|null }}
   */
  canHearNoise(wardenPos, noiseSystem) {
    if (!noiseSystem) return { heard: false, event: null };

    const event = noiseSystem.getLoudestHeardEvent(wardenPos, 1.25);
    if (event) {
      this.lastKnownPosition.copy(event.position);
      this.hasLastKnown = true;
      return { heard: true, event };
    }

    return { heard: false, event: null };
  }

  getLastKnownPosition() {
    return this.lastKnownPosition.clone();
  }

  /**
   * Update visual debug cone position, orientation, and color
   */
  updateVisuals(warden, state) {
    if (!this.visionConeMesh) return;

    const facingAngle = warden.facingAngle !== undefined ? warden.facingAngle : warden.mesh.rotation.y;

    // Sync cone position and yaw rotation
    this.visionConeMesh.position.set(warden.position.x, 0.12, warden.position.z);
    this.visionConeMesh.rotation.y = facingAngle;

    if (this.visionConeLine) {
      this.visionConeLine.position.set(warden.position.x, 0.14, warden.position.z);
      this.visionConeLine.rotation.y = facingAngle;
    }

    // Match color to AI state / vision status
    let color = 0x00f0ff; // Cyan (PATROL)
    if (state === 'HUNT') color = 0xff1133; // Red
    else if (state === 'SEARCH') color = 0xffaa00; // Amber

    this.coneMat.color.setHex(color);
    if (this.coneLineMat) this.coneLineMat.color.setHex(color);
  }
}

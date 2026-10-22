import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, player, maze, domElement) {
    this.camera = camera;
    this.player = player;
    this.maze = maze;
    this.domElement = domElement;

    // Camera orbit parameters — confined within enclosed cyberpunk facility
    this.yaw = 0; // Horizontal angle (radians)
    this.pitch = 0.32; // Comfortable over-the-shoulder vertical pitch (~18 deg)
    this.minPitch = -0.28; // Looking up limit (~ -16 deg, prevents clipping into floor)
    this.maxPitch = 0.58; // Looking down limit (~33 deg, strictly prevents bird's-eye view)

    // Corridor-scaled distance (scaled for 3m wide, 2.6m high corridors)
    this.defaultDistance = 3.8;
    this.currentDistance = 3.8;
    this.minDistance = 0.75;

    // Adjustable sensitivity
    this.baseSensitivity = 0.0022;
    this.sensitivityMultiplier = 1.0;
    this.sensitivity = this.baseSensitivity;

    // Follow focus (upper torso / shoulder level)
    this.playerHeightOffset = 1.30;

    // Raycaster for wall and ceiling collision detection
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = 8.0;

    // Pointer lock state
    this.isLocked = false;
    this.disabled = false; // When true (Title or Pause menu), canvas clicks won't request lock

    this._setupPointerLock();
  }

  setSensitivityMultiplier(multiplier) {
    this.sensitivityMultiplier = Math.max(0.2, Math.min(3.0, multiplier));
    this.sensitivity = this.baseSensitivity * this.sensitivityMultiplier;
  }

  _setupPointerLock() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.disabled) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || this.disabled) return;

      // Horizontal look
      this.yaw -= e.movementX * this.sensitivity;

      // Vertical look with confinement clamp
      this.pitch += e.movementY * this.sensitivity;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    });
  }

  update(delta) {
    // 1. Follow anchor at player upper torso
    const followTarget = this.player.position.clone();
    followTarget.y += this.playerHeightOffset;

    // 2. Compute orbit direction from yaw & pitch
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    const dir = new THREE.Vector3(
      sinYaw * cosPitch,
      sinPitch,
      cosYaw * cosPitch
    ).normalize();

    // 3. Wall and ceiling collision detection
    let safeDistance = this.defaultDistance;
    if (this.maze && this.maze.wallMeshes && this.maze.wallMeshes.length > 0) {
      this.raycaster.set(followTarget, dir);
      const intersects = this.raycaster.intersectObjects(this.maze.wallMeshes, false);

      if (intersects.length > 0 && intersects[0].distance < this.defaultDistance) {
        // Buffer distance so camera never clips into wall or ceiling geometry
        safeDistance = Math.max(this.minDistance, intersects[0].distance - 0.32);
      }
    }

    // Smooth distance zoom on obstruction and pull back when clear
    const lerpSpeed = safeDistance < this.currentDistance ? 24 : 6;
    this.currentDistance = THREE.MathUtils.lerp(
      this.currentDistance,
      safeDistance,
      Math.min(1, delta * lerpSpeed)
    );

    // 4. Calculate desired camera position
    const desiredCameraPos = followTarget.clone().add(
      dir.clone().multiplyScalar(this.currentDistance)
    );

    // 5. Strict ceiling & floor confinement bounds
    const ceilingY = (this.maze && this.maze.wallHeight) ? this.maze.wallHeight : 2.6;
    // Keep camera at least 0.25m below ceiling and 0.35m above floor
    desiredCameraPos.y = Math.min(ceilingY - 0.25, Math.max(0.35, desiredCameraPos.y));

    // 6. Smooth camera movement
    const followLerp = Math.min(1, delta * 14);
    this.camera.position.lerp(desiredCameraPos, followLerp);

    // 7. Look toward player upper torso/head
    const lookAtPoint = followTarget.clone();
    lookAtPoint.y += 0.05;
    this.camera.lookAt(lookAtPoint);
  }
}

import * as THREE from 'three';

export const CELL_TYPE = {
  FLOOR: 0,
  WALL: 1,
  PLAYER_START: 2,
  ENEMY_START: 3,
  EXIT: 4
};

// ────────────────────────────────────────────────────────────────────────────
// Procedural Canvas Texture Generators (Zero network overhead, razor sharp)
// ────────────────────────────────────────────────────────────────────────────

function createFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Base metallic dark plate
  ctx.fillStyle = '#10141d';
  ctx.fillRect(0, 0, 256, 256);

  // Interior quadrant panel divisions
  ctx.fillStyle = '#141a26';
  ctx.fillRect(8, 8, 116, 116);
  ctx.fillRect(132, 8, 116, 116);
  ctx.fillRect(8, 132, 116, 116);
  ctx.fillRect(132, 132, 116, 116);

  // Border groove
  ctx.strokeStyle = '#06080d';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 252);
  ctx.strokeRect(126, 0, 4, 256);
  ctx.strokeRect(0, 126, 256, 4);

  // Corner rivets/bolts
  ctx.fillStyle = '#223046';
  const rivetPoints = [
    [16, 16], [116, 16], [16, 116], [116, 116],
    [140, 16], [240, 16], [140, 116], [240, 116],
    [16, 140], [116, 140], [16, 240], [116, 240],
    [140, 140], [240, 140], [140, 240], [240, 240]
  ];
  for (const [rx, ry] of rivetPoints) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createHazardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#161c28';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#e68a00';
  ctx.beginPath();
  const stripeW = 20;
  for (let x = -128; x < 256; x += stripeW * 2) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + stripeW, 0);
    ctx.lineTo(x + stripeW + 128, 128);
    ctx.lineTo(x + 128, 128);
  }
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1c2433';
  ctx.fillRect(0, 0, 256, 256);

  // Vertical structural panel divisions
  ctx.fillStyle = '#243044';
  ctx.fillRect(6, 6, 118, 244);
  ctx.fillRect(132, 6, 118, 244);

  // Bevel grooves
  ctx.strokeStyle = '#0e141f';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 252, 252);
  ctx.strokeRect(126, 0, 4, 256);

  // Subtle horizontal tech vents
  ctx.fillStyle = '#121822';
  for (let y = 30; y < 230; y += 40) {
    ctx.fillRect(20, y, 90, 8);
    ctx.fillRect(146, y, 90, 8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createSignTexture(text, subtext = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a101a';
  ctx.fillRect(0, 0, 256, 80);

  // Cyber frame
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 72);

  // Corner notches
  ctx.fillStyle = '#00f0ff';
  ctx.fillRect(4, 4, 8, 8);
  ctx.fillRect(244, 4, 8, 8);
  ctx.fillRect(4, 68, 8, 8);
  ctx.fillRect(244, 68, 8, 8);

  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, subtext ? 32 : 40);

  if (subtext) {
    ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
    ctx.font = '12px monospace';
    ctx.fillText(subtext, 128, 56);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ────────────────────────────────────────────────────────────────────────────
// Authoritative 15x15 Facility Maze Grid
// All navigation, collision, A*, spawns and objectives derive from this layout.
// ────────────────────────────────────────────────────────────────────────────

export class Maze {
  constructor(options = {}) {
    this.cellSize = options.cellSize || 3;
    this.wallHeight = options.wallHeight || 2.6;

    // 15x15 Deterministic Grid (108/108 walkable cells verified 100% reachable via BFS)
    this.rawGrid = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Row 0
      [1, 2, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1], // Row 1 (2 = Player Start Airlock)
      [1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1], // Row 2
      [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1], // Row 3 (Core 1 @ row 3, col 2)
      [1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1], // Row 4
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1], // Row 5
      [1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1], // Row 6 (Central Hub begins cols 6-8)
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1], // Row 7 (Quantum Core @ row 7, col 7)
      [1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1], // Row 8 (Central Hub ends cols 6-8)
      [1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1], // Row 9 (Core 2 @ row 9, col 12)
      [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1], // Row 10
      [1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1], // Row 11
      [1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1], // Row 12
      [1, 3, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 4, 1], // Row 13 (3 = Warden Start, 4 = Exit Portal)
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // Row 14
    ];

    this.rows = this.rawGrid.length;
    this.cols = this.rawGrid[0].length;

    // Center offset so (0, 0) world coordinates corresponds to the central chamber
    this.offsetX = ((this.cols - 1) * this.cellSize) / 2;
    this.offsetZ = ((this.rows - 1) * this.cellSize) / 2;

    this.group = new THREE.Group();
    this.wallMeshes = [];
    this.wallBoundingBoxes = [];

    this.playerStartGrid = null;
    this.playerStartWorld = null;

    this.enemyStartGrid = null;
    this.enemyStartWorld = null;

    this.exitGrid = null;
    this.exitWorld = null;

    // ────────────────────────────────────────────────────────────────────────
    // Security Blast Door State (Part A)
    // Placed between Entry Airlock (1,1) and Sector 0 corridor (2,1)
    // ────────────────────────────────────────────────────────────────────────
    this.isEntranceDoorClosed = true;
    this.entranceDoorWorld = this.gridToWorld(2, 1, 0);
    // Adjusted door world position right at the boundary between (1,1) and (2,1)
    this.entranceDoorWorld.x = 1.5 * this.cellSize - this.offsetX;
    this.entranceDoorWorld.z = 1.0 * this.cellSize - this.offsetZ;

    this.doorLeftGroup = null;
    this.doorRightGroup = null;
    this.doorStatusMat = null;
    this.doorLight = null;
    this.doorAnimProgress = 0; // 0 = closed, 1 = fully open
    this.doorOpening = false;
    this.doorClosing = false;
    this.doorAnimDuration = 1.1; // Smooth 1.1s opening
    this.doorCallback = null;

    // Door wall collider (added to wallMeshes when door is closed)
    this.doorColliderMesh = null;

    // Central landmark dynamic elements
    this.reactorPillar = null;
    this.reactorCoreMesh = null;
    this.reactorRings = [];

    this._animTime = 0;

    this._parseGrid();
    this._buildMesh();
  }

  get grid() {
    return this.rawGrid;
  }

  // Convert grid coordinates to world position Vector3
  gridToWorld(colOrObj, rowOrY = 0, y = 0) {
    let col, row, actualY;
    if (typeof colOrObj === 'object' && colOrObj !== null) {
      col = colOrObj.col;
      row = colOrObj.row;
      actualY = rowOrY || 0;
    } else {
      col = colOrObj;
      row = rowOrY;
      actualY = y || 0;
    }
    const x = col * this.cellSize - this.offsetX;
    const z = row * this.cellSize - this.offsetZ;
    return new THREE.Vector3(x, actualY, z);
  }

  // Convert world position (x, z) to grid coordinates { col, row }
  worldToGrid(x, z) {
    const col = Math.round((x + this.offsetX) / this.cellSize);
    const row = Math.round((z + this.offsetZ) / this.cellSize);
    return { col, row };
  }

  // Single authoritative walkability check:
  // - Outer boundary is blocked
  // - 1 is a permanent wall
  // - When entrance door is closed, cell (row 1, col 2) is sealed
  isWalkableCell(row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return false;
    }
    if (this.isEntranceDoorClosed && row === 1 && col === 2) {
      return false;
    }
    return this.rawGrid[row][col] !== 1;
  }

  // Backwards-compatible alias: isWalkable(col, row)
  isWalkable(col, row) {
    return this.isWalkableCell(row, col);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Security Blast Door Controls
  // ────────────────────────────────────────────────────────────────────────

  openEntranceDoor(onComplete = null) {
    if (!this.isEntranceDoorClosed && this.doorAnimProgress >= 1) {
      if (onComplete) onComplete();
      return;
    }
    this.doorOpening = true;
    this.doorClosing = false;
    this.doorCallback = onComplete;

    if (this.doorStatusMat) {
      this.doorStatusMat.color.setHex(0x00f0ff);
    }
    if (this.doorLight) {
      this.doorLight.color.setHex(0x00f0ff);
      this.doorLight.intensity = 2.5;
    }
  }

  closeEntranceDoor() {
    this.isEntranceDoorClosed = true;
    this.doorOpening = false;
    this.doorClosing = false;
    this.doorAnimProgress = 0;
    this._updateDoorSlabs(0);

    if (this.doorStatusMat) {
      this.doorStatusMat.color.setHex(0xff2244);
    }
    if (this.doorLight) {
      this.doorLight.color.setHex(0xff2244);
      this.doorLight.intensity = 2.0;
    }
    // Re-insert collider mesh into wallMeshes if not already present
    if (this.doorColliderMesh && !this.wallMeshes.includes(this.doorColliderMesh)) {
      this.wallMeshes.push(this.doorColliderMesh);
    }
  }

  _updateDoorSlabs(progress) {
    // Left slab moves -Z, Right slab moves +Z into adjacent walls
    const slideDist = progress * 1.35;
    if (this.doorLeftGroup) {
      this.doorLeftGroup.position.z = -0.68 - slideDist;
    }
    if (this.doorRightGroup) {
      this.doorRightGroup.position.z = 0.68 + slideDist;
    }
  }

  update(delta) {
    this._animTime += delta;

    // 1. Update door animation
    if (this.doorOpening) {
      this.doorAnimProgress += delta / this.doorAnimDuration;
      if (this.doorAnimProgress >= 1.0) {
        this.doorAnimProgress = 1.0;
        this.doorOpening = false;
        this.isEntranceDoorClosed = false;

        // Remove door collider from camera/LoS raycasts
        if (this.doorColliderMesh) {
          const idx = this.wallMeshes.indexOf(this.doorColliderMesh);
          if (idx !== -1) {
            this.wallMeshes.splice(idx, 1);
          }
        }

        if (this.doorCallback) {
          const cb = this.doorCallback;
          this.doorCallback = null;
          cb();
        }
      }
      this._updateDoorSlabs(this.doorAnimProgress);
    }

    // 2. Animate central Quantum Core Reactor visuals
    if (this.reactorCoreMesh) {
      const pulse = 1.0 + Math.sin(this._animTime * 3.5) * 0.25;
      this.reactorCoreMesh.scale.set(pulse, 1.0, pulse);
    }
    for (let i = 0; i < this.reactorRings.length; i++) {
      const ring = this.reactorRings[i];
      const dir = i % 2 === 0 ? 1 : -1;
      ring.rotation.y += delta * (0.8 + i * 0.4) * dir;
      ring.position.y = 1.3 + Math.sin(this._animTime * 2.0 + i) * 0.12;
    }
  }

  _parseGrid() {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const val = this.rawGrid[row][col];
        if (val === CELL_TYPE.PLAYER_START) {
          this.playerStartGrid = { col, row };
          this.playerStartWorld = this.gridToWorld(col, row, 0);
        } else if (val === CELL_TYPE.ENEMY_START) {
          this.enemyStartGrid = { col, row };
          this.enemyStartWorld = this.gridToWorld(col, row, 0);
        } else if (val === CELL_TYPE.EXIT) {
          this.exitGrid = { col, row };
          this.exitWorld = this.gridToWorld(col, row, 0);
        }
      }
    }
  }

  _buildMesh() {
    const totalWidth = this.cols * this.cellSize;
    const totalDepth = this.rows * this.cellSize;

    // ────────────────────────────────────────────────────────────────────────
    // 1. Reusable Shared Textures & Materials
    // ────────────────────────────────────────────────────────────────────────
    const floorTexture = createFloorTexture();
    const hazardTexture = createHazardTexture();
    const wallTexture = createWallTexture();

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTexture,
      color: 0x3e4d65,
      roughness: 0.55,
      metalness: 0.2
    });

    const recessedWallMat = new THREE.MeshStandardMaterial({
      color: 0x253144,
      roughness: 0.7,
      metalness: 0.1
    });

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x4a5d78,
      roughness: 0.4,
      metalness: 0.3
    });

    const baseTrimMat = new THREE.MeshStandardMaterial({
      color: 0x2d3a4d,
      roughness: 0.5,
      metalness: 0.25
    });

    const cyanStripMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    const amberStripMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00
    });

    const hazardMat = new THREE.MeshStandardMaterial({
      map: hazardTexture,
      roughness: 0.45,
      metalness: 0.2
    });

    const floorTileMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      color: 0x344256,
      roughness: 0.5,
      metalness: 0.22
    });

    const floorBaseMat = new THREE.MeshStandardMaterial({
      color: 0x141c28,
      roughness: 0.85,
      metalness: 0.1
    });

    const ceilingBeamMat = new THREE.MeshStandardMaterial({
      color: 0x38475c,
      roughness: 0.5,
      metalness: 0.25
    });

    const ceilingPanelMat = new THREE.MeshStandardMaterial({
      color: 0x182230,
      roughness: 0.6,
      metalness: 0.25
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. Base Sub-floor and Continuous Enclosed Ceiling (45m x 45m coverage)
    // ────────────────────────────────────────────────────────────────────────
    const floorGeo = new THREE.PlaneGeometry(totalWidth + 6, totalDepth + 6);
    const baseFloor = new THREE.Mesh(floorGeo, floorBaseMat);
    baseFloor.rotation.x = -Math.PI / 2;
    baseFloor.position.y = -0.01;
    baseFloor.receiveShadow = true;
    this.group.add(baseFloor);

    // Continuous interior ceiling (faces downward into corridors)
    const ceilingGeo = new THREE.PlaneGeometry(totalWidth, totalDepth);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingPanelMat);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.y = this.wallHeight;
    ceilingMesh.receiveShadow = true;
    this.group.add(ceilingMesh);
    // Camera raycast uses wallMeshes to prevent top-down / bird's-eye penetration
    this.wallMeshes.push(ceilingMesh);

    // Exterior roof cap seals maze completely
    const roofCapGeo = new THREE.PlaneGeometry(totalWidth + 6, totalDepth + 6);
    const roofCapMat = new THREE.MeshStandardMaterial({
      color: 0x080c12,
      roughness: 0.95,
      metalness: 0.1
    });
    const roofCap = new THREE.Mesh(roofCapGeo, roofCapMat);
    roofCap.rotation.x = -Math.PI / 2;
    roofCap.position.y = this.wallHeight + 0.05;
    this.group.add(roofCap);

    // ────────────────────────────────────────────────────────────────────────
    // 3. Shared Reusable Geometries
    // ────────────────────────────────────────────────────────────────────────
    const primaryWallGeo = new THREE.BoxGeometry(this.cellSize, this.wallHeight, this.cellSize);
    const walkableTileGeo = new THREE.BoxGeometry(this.cellSize * 0.96, 0.04, this.cellSize * 0.96);
    const recessedPanelGeo = new THREE.BoxGeometry(this.cellSize * 0.74, this.wallHeight * 0.72, 0.05);
    const pillarGeo = new THREE.BoxGeometry(0.24, this.wallHeight + 0.05, 0.24);
    const baseTrimGeo = new THREE.BoxGeometry(this.cellSize, 0.16, 0.06);
    const topTrimGeo = new THREE.BoxGeometry(this.cellSize, 0.08, 0.06);
    const conduitGeo = new THREE.CylinderGeometry(0.025, 0.025, this.cellSize * 0.7, 8);
    conduitGeo.rotateZ(Math.PI / 2);
    const terminalBoxGeo = new THREE.BoxGeometry(0.42, 0.32, 0.07);
    const terminalScreenGeo = new THREE.PlaneGeometry(0.32, 0.22);
    const ceilingBeamGeo = new THREE.BoxGeometry(this.cellSize * 0.98, 0.14, 0.22);
    const floorLightStripGeo = new THREE.BoxGeometry(this.cellSize * 0.94, 0.01, 0.04);

    // ────────────────────────────────────────────────────────────────────────
    // 4. Construct Walls & Floor Panels
    // ────────────────────────────────────────────────────────────────────────
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cellType = this.rawGrid[row][col];
        const worldPos = this.gridToWorld(col, row, 0);

        if (cellType === CELL_TYPE.WALL) {
          // Solid Wall Body (Used for Camera Raycast & Warden LoS)
          const wallMesh = new THREE.Mesh(primaryWallGeo, wallMat);
          wallMesh.position.set(worldPos.x, this.wallHeight / 2, worldPos.z);
          wallMesh.castShadow = true;
          wallMesh.receiveShadow = true;
          this.group.add(wallMesh);
          this.wallMeshes.push(wallMesh);

          const box = new THREE.Box3().setFromObject(wallMesh);
          this.wallBoundingBoxes.push(box);

          // Check exposed corridor directions (N, S, E, W)
          const hasNorthCorridor = row > 0 && this.isWalkableCell(row - 1, col);
          const hasSouthCorridor = row < this.rows - 1 && this.isWalkableCell(row + 1, col);
          const hasWestCorridor = col > 0 && this.isWalkableCell(row, col - 1);
          const hasEastCorridor = col < this.cols - 1 && this.isWalkableCell(row, col + 1);

          const exposedFaces = [];
          if (hasNorthCorridor) exposedFaces.push({ side: 'N', rotY: Math.PI, offsetZ: -this.cellSize / 2 });
          if (hasSouthCorridor) exposedFaces.push({ side: 'S', rotY: 0, offsetZ: this.cellSize / 2 });
          if (hasWestCorridor) exposedFaces.push({ side: 'W', rotY: Math.PI / 2, offsetX: -this.cellSize / 2 });
          if (hasEastCorridor) exposedFaces.push({ side: 'E', rotY: -Math.PI / 2, offsetX: this.cellSize / 2 });

          const styleSeed = (row * 7 + col * 13) % 4;

          for (const face of exposedFaces) {
            const faceGroup = new THREE.Group();
            faceGroup.position.set(
              worldPos.x + (face.offsetX || 0),
              0,
              worldPos.z + (face.offsetZ || 0)
            );
            faceGroup.rotation.y = face.rotY;

            // Kickplate
            const baseTrim = new THREE.Mesh(baseTrimGeo, baseTrimMat);
            baseTrim.position.set(0, 0.08, 0.03);
            faceGroup.add(baseTrim);

            // Crown trim with cyan accent
            const topTrim = new THREE.Mesh(topTrimGeo, baseTrimMat);
            topTrim.position.set(0, this.wallHeight - 0.04, 0.03);
            faceGroup.add(topTrim);

            const topGlowStrip = new THREE.Mesh(
              new THREE.BoxGeometry(this.cellSize * 0.98, 0.02, 0.02),
              cyanStripMat
            );
            topGlowStrip.position.set(0, this.wallHeight - 0.01, 0.06);
            faceGroup.add(topGlowStrip);

            // Panel Facade Variation
            if (styleSeed === 0) {
              const recess = new THREE.Mesh(recessedPanelGeo, recessedWallMat);
              recess.position.set(0, 1.25, 0.02);
              faceGroup.add(recess);

              const conduit1 = new THREE.Mesh(conduitGeo, baseTrimMat);
              conduit1.position.set(0, 0.75, 0.045);
              faceGroup.add(conduit1);

              const conduit2 = new THREE.Mesh(conduitGeo, cyanStripMat);
              conduit2.position.set(0, 1.65, 0.045);
              faceGroup.add(conduit2);
            } else if (styleSeed === 1) {
              const recess = new THREE.Mesh(recessedPanelGeo, recessedWallMat);
              recess.position.set(0, 1.25, 0.02);
              faceGroup.add(recess);

              const termBox = new THREE.Mesh(terminalBoxGeo, pillarMat);
              termBox.position.set(0, 1.35, 0.06);
              faceGroup.add(termBox);

              const screen = new THREE.Mesh(terminalScreenGeo, cyanStripMat);
              screen.position.set(0, 1.35, 0.10);
              faceGroup.add(screen);

              const led = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.04, 0.02),
                amberStripMat
              );
              led.position.set(0.14, 1.15, 0.10);
              faceGroup.add(led);
            } else if (styleSeed === 2) {
              const recess = new THREE.Mesh(recessedPanelGeo, recessedWallMat);
              recess.position.set(0, 1.25, 0.02);
              faceGroup.add(recess);

              const cautionStrip = new THREE.Mesh(
                new THREE.BoxGeometry(this.cellSize * 0.6, 0.08, 0.02),
                hazardMat
              );
              cautionStrip.position.set(0, 1.75, 0.04);
              faceGroup.add(cautionStrip);

              const heavyPipe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.045, 0.045, this.cellSize * 0.72, 8),
                pillarMat
              );
              heavyPipe.rotateZ(Math.PI / 2);
              heavyPipe.position.set(0, 0.95, 0.06);
              faceGroup.add(heavyPipe);
            } else {
              const recess = new THREE.Mesh(recessedPanelGeo, recessedWallMat);
              recess.position.set(0, 1.25, 0.02);
              faceGroup.add(recess);

              for (let vy = 0.8; vy <= 1.7; vy += 0.22) {
                const slat = new THREE.Mesh(
                  new THREE.BoxGeometry(this.cellSize * 0.55, 0.04, 0.02),
                  pillarMat
                );
                slat.position.set(0, vy, 0.04);
                faceGroup.add(slat);
              }
            }

            this.group.add(faceGroup);
          }

          // Corner structural pillars
          const cornerW = this.cellSize / 2;
          if (hasNorthCorridor && hasWestCorridor) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(worldPos.x - cornerW, this.wallHeight / 2, worldPos.z - cornerW);
            this.group.add(pillar);
          }
          if (hasNorthCorridor && hasEastCorridor) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(worldPos.x + cornerW, this.wallHeight / 2, worldPos.z - cornerW);
            this.group.add(pillar);
          }
          if (hasSouthCorridor && hasWestCorridor) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(worldPos.x - cornerW, this.wallHeight / 2, worldPos.z + cornerW);
            this.group.add(pillar);
          }
          if (hasSouthCorridor && hasEastCorridor) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(worldPos.x + cornerW, this.wallHeight / 2, worldPos.z + cornerW);
            this.group.add(pillar);
          }

        } else {
          // Walkable Floor Tile
          const tile = new THREE.Mesh(walkableTileGeo, floorTileMat);
          tile.position.set(worldPos.x, 0.02, worldPos.z);
          tile.receiveShadow = true;
          this.group.add(tile);

          // Floor guide runner strips
          const isNSCorridor = (row > 0 && this.isWalkableCell(row - 1, col)) ||
                               (row < this.rows - 1 && this.isWalkableCell(row + 1, col));
          const isEWCorridor = (col > 0 && this.isWalkableCell(row, col - 1)) ||
                               (col < this.cols - 1 && this.isWalkableCell(row, col + 1));

          if ((row + col) % 3 === 0 && (isNSCorridor || isEWCorridor)) {
            const runner = new THREE.Mesh(floorLightStripGeo, cyanStripMat);
            if (isNSCorridor && !isEWCorridor) {
              runner.rotation.y = Math.PI / 2;
            }
            runner.position.set(worldPos.x, 0.041, worldPos.z);
            this.group.add(runner);
          }

          // Overhead Corridor Crossbeams
          const wallNorth = row === 0 || !this.isWalkableCell(row - 1, col);
          const wallSouth = row === this.rows - 1 || !this.isWalkableCell(row + 1, col);
          const wallWest = col === 0 || !this.isWalkableCell(row, col - 1);
          const wallEast = col === this.cols - 1 || !this.isWalkableCell(row, col + 1);

          // Only add crossbeams in 1-wide corridors (not open rooms)
          const inCentralRoom = (row >= 6 && row <= 8 && col >= 6 && col <= 8);
          if (!inCentralRoom && ((wallNorth && wallSouth) || (wallWest && wallEast))) {
            const beam = new THREE.Mesh(ceilingBeamGeo, ceilingBeamMat);
            beam.position.set(worldPos.x, this.wallHeight + 0.02, worldPos.z);
            if (wallWest && wallEast) {
              beam.rotation.y = 0;
            } else {
              beam.rotation.y = Math.PI / 2;
            }
            this.group.add(beam);

            const beamLight = new THREE.Mesh(
              new THREE.BoxGeometry(0.8, 0.02, 0.08),
              cyanStripMat
            );
            beamLight.position.set(worldPos.x, this.wallHeight - 0.06, worldPos.z);
            if (wallNorth && wallSouth) {
              beamLight.rotation.y = Math.PI / 2;
            }
            this.group.add(beamLight);
          }
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 5. Build PART A: Secure Facility Entrance Blast Door & Airlock (row 1, col 1-2)
    // ────────────────────────────────────────────────────────────────────────
    this._buildEntranceGate();

    // ────────────────────────────────────────────────────────────────────────
    // 6. Build PART B: Landmark Zones (Quantum Hub, Lab-01, Vault-02, Exit)
    // ────────────────────────────────────────────────────────────────────────
    this._buildLandmarks();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PART A — Facility Entrance Door Construction
  // ──────────────────────────────────────────────────────────────────────────

  _buildEntranceGate() {
    const doorX = this.entranceDoorWorld.x;
    const doorZ = this.entranceDoorWorld.z;

    const gateGroup = new THREE.Group();
    gateGroup.position.set(doorX, 0, doorZ);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1a2230,
      metalness: 0.85,
      roughness: 0.3
    });
    const doorSlabMat = new THREE.MeshStandardMaterial({
      color: 0x243246,
      metalness: 0.75,
      roughness: 0.35
    });
    const cautionMat = new THREE.MeshStandardMaterial({
      map: createHazardTexture(),
      roughness: 0.45
    });

    // 1. Reinforced Side Frame Jambs
    const jambGeo = new THREE.BoxGeometry(0.35, this.wallHeight, 0.35);
    const jambL = new THREE.Mesh(jambGeo, frameMat);
    jambL.position.set(0, this.wallHeight / 2, -1.45);
    gateGroup.add(jambL);

    const jambR = new THREE.Mesh(jambGeo, frameMat);
    jambR.position.set(0, this.wallHeight / 2, 1.45);
    gateGroup.add(jambR);

    // Hazard chevron kickers on jamb bases
    const kickerGeo = new THREE.BoxGeometry(0.38, 0.45, 0.38);
    const kickerL = new THREE.Mesh(kickerGeo, cautionMat);
    kickerL.position.set(0, 0.22, -1.45);
    gateGroup.add(kickerL);

    const kickerR = new THREE.Mesh(kickerGeo, cautionMat);
    kickerR.position.set(0, 0.22, 1.45);
    gateGroup.add(kickerR);

    // 2. Heavy Overhead Lintel
    const lintelGeo = new THREE.BoxGeometry(0.4, 0.38, 3.2);
    const lintel = new THREE.Mesh(lintelGeo, frameMat);
    lintel.position.set(0, this.wallHeight - 0.19, 0);
    gateGroup.add(lintel);

    // Holographic Gate Signage facing West toward player in airlock
    const signMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('SECTOR 0 :: AIRLOCK', 'FACILITY SECURITY GATE'),
      transparent: true
    });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.35), signMat);
    signMesh.rotation.y = -Math.PI / 2;
    signMesh.position.set(-0.21, this.wallHeight - 0.2, 0);
    gateGroup.add(signMesh);

    // 3. Digital Door Status Indicator (Red = Sealed, Cyan = Authorized)
    this.doorStatusMat = new THREE.MeshBasicMaterial({
      color: 0xff2244
    });
    const statusPlateGeo = new THREE.BoxGeometry(0.04, 0.12, 1.2);
    const statusPlate = new THREE.Mesh(statusPlateGeo, this.doorStatusMat);
    statusPlate.position.set(-0.21, this.wallHeight - 0.45, 0);
    gateGroup.add(statusPlate);

    // 4. Warning Beacon / Gate Illumination Light
    this.doorLight = new THREE.PointLight(0xff2244, 2.0, 6.0);
    this.doorLight.position.set(-0.5, this.wallHeight - 0.3, 0);
    gateGroup.add(this.doorLight);

    // 5. Sliding Blast Door Slabs (Left and Right, slide in Z axis into walls)
    // Left Slab (Z: -0.68)
    this.doorLeftGroup = new THREE.Group();
    this.doorLeftGroup.position.set(0, 0, -0.68);
    const slabGeo = new THREE.BoxGeometry(0.18, this.wallHeight * 0.94, 1.32);
    const slabLeftMesh = new THREE.Mesh(slabGeo, doorSlabMat);
    slabLeftMesh.position.y = (this.wallHeight * 0.94) / 2;
    this.doorLeftGroup.add(slabLeftMesh);

    const seamGlowGeo = new THREE.BoxGeometry(0.02, this.wallHeight * 0.9, 0.04);
    const seamGlowL = new THREE.Mesh(seamGlowGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    seamGlowL.position.set(-0.1, (this.wallHeight * 0.94) / 2, 0.64);
    this.doorLeftGroup.add(seamGlowL);
    gateGroup.add(this.doorLeftGroup);

    // Right Slab (Z: +0.68)
    this.doorRightGroup = new THREE.Group();
    this.doorRightGroup.position.set(0, 0, 0.68);
    const slabRightMesh = new THREE.Mesh(slabGeo, doorSlabMat);
    slabRightMesh.position.y = (this.wallHeight * 0.94) / 2;
    this.doorRightGroup.add(slabRightMesh);

    const seamGlowR = new THREE.Mesh(seamGlowGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    seamGlowR.position.set(-0.1, (this.wallHeight * 0.94) / 2, -0.64);
    this.doorRightGroup.add(seamGlowR);
    gateGroup.add(this.doorRightGroup);

    // 6. Camera & LoS Raycast Collider Mesh
    const colliderGeo = new THREE.BoxGeometry(0.4, this.wallHeight, 2.9);
    this.doorColliderMesh = new THREE.Mesh(colliderGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.doorColliderMesh.position.set(doorX, this.wallHeight / 2, doorZ);
    this.group.add(this.doorColliderMesh);
    this.wallMeshes.push(this.doorColliderMesh);

    this.group.add(gateGroup);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PART B — Landmark Chambers Construction
  // ──────────────────────────────────────────────────────────────────────────

  _buildLandmarks() {
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x1e2838,
      metalness: 0.85,
      roughness: 0.3
    });
    const cyanEmissive = new THREE.MeshStandardMaterial({
      color: 0x00ccff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.8,
      roughness: 0.2
    });

    // ────────────────────────────────────────────────────────────────────────
    // Landmark 1: Sector 0 Airlock Entry Room (row 1, col 1)
    // ────────────────────────────────────────────────────────────────────────
    const airlockPos = this.gridToWorld(1, 1, 0);

    // Decontamination circle on floor
    const decompCircle = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.1, 24),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    decompCircle.rotation.x = -Math.PI / 2;
    decompCircle.position.set(airlockPos.x, 0.05, airlockPos.z);
    this.group.add(decompCircle);

    // Airlock Wall Signage
    const airlockSignMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('SECTOR 0 :: DECONTAMINATION', 'SECURE ENTRY POINT')
    });
    const airlockSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), airlockSignMat);
    airlockSign.position.set(airlockPos.x, 1.8, airlockPos.z - this.cellSize / 2 + 0.04);
    this.group.add(airlockSign);

    // ────────────────────────────────────────────────────────────────────────
    // Landmark 2: Central Quantum Reactor Pillar & Chamber (rows 6-8, cols 6-8)
    // ────────────────────────────────────────────────────────────────────────
    const centerPos = this.gridToWorld(7, 7, 0); // (0, 0) world coordinates

    // Large octagonal reactor base
    const reactorBaseGeo = new THREE.CylinderGeometry(1.2, 1.45, 0.45, 8);
    const reactorBase = new THREE.Mesh(reactorBaseGeo, metalMat);
    reactorBase.position.set(centerPos.x, 0.22, centerPos.z);
    reactorBase.receiveShadow = true;
    this.group.add(reactorBase);

    // Upper reactor ceiling housing
    const reactorCapGeo = new THREE.CylinderGeometry(1.4, 1.2, 0.4, 8);
    const reactorCap = new THREE.Mesh(reactorCapGeo, metalMat);
    reactorCap.position.set(centerPos.x, this.wallHeight - 0.2, centerPos.z);
    this.group.add(reactorCap);

    // Glowing core containment cylinder
    const coreGeo = new THREE.CylinderGeometry(0.48, 0.48, 1.8, 16);
    this.reactorCoreMesh = new THREE.Mesh(coreGeo, cyanEmissive);
    this.reactorCoreMesh.position.set(centerPos.x, 1.3, centerPos.z);
    this.group.add(this.reactorCoreMesh);

    // 4 Heavy vertical stabilizer pylons
    const pylonGeo = new THREE.BoxGeometry(0.18, 2.0, 0.18);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const px = centerPos.x + Math.cos(angle) * 1.05;
      const pz = centerPos.z + Math.sin(angle) * 1.05;
      const pylon = new THREE.Mesh(pylonGeo, metalMat);
      pylon.position.set(px, 1.25, pz);
      this.group.add(pylon);
    }

    // Rotating containment rings
    const ringGeo = new THREE.TorusGeometry(0.85, 0.04, 8, 32);
    for (let r = 0; r < 2; r++) {
      const ring = new THREE.Mesh(ringGeo, cyanEmissive);
      ring.position.set(centerPos.x, 1.1 + r * 0.4, centerPos.z);
      this.group.add(ring);
      this.reactorRings.push(ring);
    }

    // Floor radial power conduit lines radiating into North, South, East, West halls
    const conduitMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    for (let dir = 0; dir < 4; dir++) {
      const radialLine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 3.2), conduitMat);
      radialLine.rotation.y = (dir * Math.PI) / 2;
      radialLine.position.set(centerPos.x, 0.05, centerPos.z);
      this.group.add(radialLine);
    }

    // Central chamber sign
    const coreSignMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('SECTOR 5 :: QUANTUM REACTOR', 'RESTRICTED POWER CORE')
    });
    const coreSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), coreSignMat);
    coreSign.position.set(centerPos.x, 2.2, centerPos.z - this.cellSize * 1.5 + 0.04);
    this.group.add(coreSign);

    // ────────────────────────────────────────────────────────────────────────
    // Landmark 3: Sector 1 (Lab-01 Biometric Research) — row 3, col 2
    // ────────────────────────────────────────────────────────────────────────
    const labPos = this.gridToWorld(2, 3, 0);
    const labSignMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('LAB-01 :: BIOMETRICS', 'SPECIMEN RESEARCH ARCHIVE')
    });
    const labSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), labSignMat);
    labSign.rotation.y = Math.PI / 2;
    labSign.position.set(labPos.x - this.cellSize / 2 + 0.04, 1.75, labPos.z);
    this.group.add(labSign);

    // ────────────────────────────────────────────────────────────────────────
    // Landmark 4: Sector 2 (Vault-02 Data Archives) — row 9, col 12
    // ────────────────────────────────────────────────────────────────────────
    const vaultPos = this.gridToWorld(12, 9, 0);
    const vaultSignMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('VAULT-02 :: DATA ARCHIVES', 'HIGH-SECURITY STORAGE')
    });
    const vaultSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), vaultSignMat);
    vaultSign.position.set(vaultPos.x, 1.75, vaultPos.z - this.cellSize / 2 + 0.04);
    this.group.add(vaultSign);

    // ────────────────────────────────────────────────────────────────────────
    // Landmark 5: Sector 8 (Containment Zone / Warden Start) — row 13, col 1
    // ────────────────────────────────────────────────────────────────────────
    const enemyPos = this.gridToWorld(1, 13, 0);
    const enemySignMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('SECTOR 8 :: CONTAINMENT', 'MAXIMUM SECURITY THREAT')
    });
    const enemySign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), enemySignMat);
    enemySign.rotation.y = Math.PI / 2;
    enemySign.position.set(enemyPos.x - this.cellSize / 2 + 0.04, 1.75, enemyPos.z);
    this.group.add(enemySign);

    // ────────────────────────────────────────────────────────────────────────
    // Landmark 6: Sector 9 (Extraction Airlock / Exit Portal) — row 13, col 13
    // ────────────────────────────────────────────────────────────────────────
    const exitPos = this.gridToWorld(13, 13, 0);
    const exitSignMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('SECTOR 9 :: EXTRACTION', 'EMERGENCY EVACUATION GATE')
    });
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), exitSignMat);
    exitSign.position.set(exitPos.x, 2.3, exitPos.z - this.cellSize / 2 + 0.04);
    this.group.add(exitSign);
  }
}

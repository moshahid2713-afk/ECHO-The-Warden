import * as THREE from 'three';
import { noiseSystem } from '../game/NoiseSystem.js';

/**
 * Procedural 4-tier cel-shading gradient map for anime-style stepped lighting
 */
function getToonGradientMap() {
  const format = THREE.RGBAFormat;
  const colors = new Uint8Array([
    55, 60, 80, 255,    // Deep cel shadow band
    130, 140, 168, 255, // Midtone band
    210, 220, 242, 255, // Light band
    255, 255, 255, 255  // Specular rim band
  ]);
  const texture = new THREE.DataTexture(colors, 4, 1, format);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class Player {
  constructor(maze, options = {}) {
    this.maze = maze;

    // Movement parameters
    this.walkSpeed = options.walkSpeed || 5.0;
    this.sprintSpeed = options.sprintSpeed || 8.5;
    this.rotationSpeed = 12.0;

    // Jump and gravity physics (tuned for 2.6m enclosed corridors)
    this.jumpVelocity = options.jumpVelocity || 5.2;
    this.gravity = options.gravity || 18.0;
    this.velocityY = 0;
    this.isGrounded = true;
    this.jumpPressed = false;
    this.jumpConsumed = false;
    this.wasGroundedLastFrame = true;

    // Noise emission timing (cooldowns in seconds)
    this.walkNoiseCooldown = 0;
    this.sprintNoiseCooldown = 0;
    this.walkNoiseInterval = 0.55;
    this.sprintNoiseInterval = 0.28;

    // Collision parameters (0.35 - 0.45 units + margin)
    this.collisionRadius = 0.45;

    // State
    this.position = new THREE.Vector3();
    this.isSprinting = false;
    this.isMoving = false;
    this.facingAngle = 0;
    this.walkCycle = 0;

    // Input state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false
    };

    // Build stylized cyberpunk anime explorer model
    this.mesh = this._createHumanoidMesh();

    // Place at maze player-start position
    if (this.maze && this.maze.playerStartWorld) {
      this.position.copy(this.maze.playerStartWorld);
      this.position.y = 0;
    }
    this.mesh.position.copy(this.position);

    // Setup keyboard listeners
    this._setupInput();
  }

  _createHumanoidMesh() {
    const group = new THREE.Group();
    const gradientMap = getToonGradientMap();

    // ────────────────────────────────────────────────────────────────────────
    // Cyberpunk Anime Cel-Shaded Materials: High-Contrast Stylized Palette
    // ────────────────────────────────────────────────────────────────────────
    // Off-white / pale titanium armor plating (high visibility in dark facility)
    const armorWhiteMat = new THREE.MeshToonMaterial({
      color: 0xd2dce8,
      gradientMap
    });

    // Dark midnight-navy tactical combat jacket & outer vest
    const jacketNavyMat = new THREE.MeshToonMaterial({
      color: 0x1a2334,
      gradientMap
    });

    // Deep slate-navy combat trousers
    const pantsMat = new THREE.MeshToonMaterial({
      color: 0x242e40,
      gradientMap
    });

    // Dark carbon composite joints, straps & soles
    const jointBlackMat = new THREE.MeshToonMaterial({
      color: 0x0f131a,
      gradientMap
    });

    // Gunmetal hardware & buckle trim
    const gunmetalMat = new THREE.MeshToonMaterial({
      color: 0x3a4658,
      gradientMap
    });

    // Glowing cyan anime visor & energy conduits (controlled, clean emissive)
    const cyanVisorMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.5,
      roughness: 0.15,
      metalness: 0.2
    });

    const cyanAccentMat = new THREE.MeshBasicMaterial({
      color: 0x00e6ff
    });

    // Warning amber telemetry badge & hazard trims
    const amberAccentMat = new THREE.MeshBasicMaterial({
      color: 0xffa200
    });

    // ────────────────────────────────────────────────────────────────────────
    // 1. Torso & Layered Armor Assembly (y: 0.90 to 1.48)
    // ────────────────────────────────────────────────────────────────────────
    const torsoGroup = new THREE.Group();

    // Inner tactical combat jacket (dark navy)
    const jacketGeo = new THREE.CylinderGeometry(0.23, 0.19, 0.52, 8);
    const jacket = new THREE.Mesh(jacketGeo, jacketNavyMat);
    jacket.position.y = 1.14;
    jacket.castShadow = true;
    torsoGroup.add(jacket);

    // High-collar neck protector
    const collarGeo = new THREE.CylinderGeometry(0.14, 0.15, 0.10, 8, 1, true);
    const collar = new THREE.Mesh(collarGeo, jacketNavyMat);
    collar.position.y = 1.42;
    torsoGroup.add(collar);

    // Front Chest Rig: Off-White Titanium Breastplate (bold anime silhouette)
    const chestPlateGeo = new THREE.BoxGeometry(0.40, 0.26, 0.13);
    const chestPlate = new THREE.Mesh(chestPlateGeo, armorWhiteMat);
    chestPlate.position.set(0, 1.24, 0.13);
    chestPlate.castShadow = true;
    torsoGroup.add(chestPlate);

    // Inset Diamond Cybernetic Power Matrix in Center Chest
    const coreGeo = new THREE.BoxGeometry(0.09, 0.09, 0.04);
    coreGeo.rotateZ(Math.PI / 4);
    const coreMesh = new THREE.Mesh(coreGeo, cyanVisorMat);
    coreMesh.position.set(0, 1.26, 0.20);
    torsoGroup.add(coreMesh);

    // Lower Abdominal Armor Plate (dark gunmetal accent)
    const abPlateGeo = new THREE.BoxGeometry(0.32, 0.14, 0.08);
    const abPlate = new THREE.Mesh(abPlateGeo, gunmetalMat);
    abPlate.position.set(0, 1.03, 0.12);
    torsoGroup.add(abPlate);

    // Diagonal Tactical Webbing Harness with Amber Buckle
    const strapGeo = new THREE.BoxGeometry(0.06, 0.38, 0.03);
    strapGeo.rotateZ(0.42);
    const strap = new THREE.Mesh(strapGeo, jointBlackMat);
    strap.position.set(0.05, 1.23, 0.20);
    torsoGroup.add(strap);

    const buckleGeo = new THREE.BoxGeometry(0.05, 0.04, 0.04);
    const buckle = new THREE.Mesh(buckleGeo, amberAccentMat);
    buckle.position.set(-0.06, 1.15, 0.21);
    torsoGroup.add(buckle);

    // Utility Belt & Holstered Pouches (y: 0.88)
    const beltGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 10);
    const belt = new THREE.Mesh(beltGeo, jointBlackMat);
    belt.position.y = 0.88;
    torsoGroup.add(belt);

    const pouchGeo = new THREE.BoxGeometry(0.09, 0.10, 0.09);
    const pouchL = new THREE.Mesh(pouchGeo, gunmetalMat);
    pouchL.position.set(-0.22, 0.88, 0.06);
    torsoGroup.add(pouchL);

    const pouchR = new THREE.Mesh(pouchGeo, gunmetalMat);
    pouchR.position.set(0.22, 0.88, 0.06);
    torsoGroup.add(pouchR);

    // Cyber Survival Backpack Unit (y: 1.18, z: -0.20)
    const packBodyGeo = new THREE.BoxGeometry(0.32, 0.42, 0.16);
    const packBody = new THREE.Mesh(packBodyGeo, jacketNavyMat);
    packBody.position.set(0, 1.18, -0.20);
    packBody.castShadow = true;
    torsoGroup.add(packBody);

    // White Protective Cowl Shell over Backpack
    const packCowlGeo = new THREE.BoxGeometry(0.34, 0.18, 0.18);
    const packCowl = new THREE.Mesh(packCowlGeo, armorWhiteMat);
    packCowl.position.set(0, 1.30, -0.21);
    torsoGroup.add(packCowl);

    // Twin Cylindrical Cyan Energy Cells
    const cellGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.30, 8);
    const cellL = new THREE.Mesh(cellGeo, gunmetalMat);
    cellL.position.set(-0.10, 1.15, -0.27);
    torsoGroup.add(cellL);

    const cellR = new THREE.Mesh(cellGeo, gunmetalMat);
    cellR.position.set(0.10, 1.15, -0.27);
    torsoGroup.add(cellR);

    // Glowing Cyan Energy Bands on Cells
    const bandGeo = new THREE.CylinderGeometry(0.041, 0.041, 0.06, 8);
    const bandL = new THREE.Mesh(bandGeo, cyanAccentMat);
    bandL.position.set(-0.10, 1.18, -0.27);
    torsoGroup.add(bandL);

    const bandR = new THREE.Mesh(bandGeo, cyanAccentMat);
    bandR.position.set(0.10, 1.18, -0.27);
    torsoGroup.add(bandR);

    // Rear Cyan Locator Strip
    const rearLightGeo = new THREE.BoxGeometry(0.20, 0.025, 0.03);
    const rearLight = new THREE.Mesh(rearLightGeo, cyanAccentMat);
    rearLight.position.set(0, 1.34, -0.305);
    torsoGroup.add(rearLight);

    // Tactical Comms Antenna with Cyan Indicator Tip
    const antGeo = new THREE.CylinderGeometry(0.007, 0.010, 0.30, 6);
    const ant = new THREE.Mesh(antGeo, gunmetalMat);
    ant.position.set(0.13, 1.50, -0.18);
    torsoGroup.add(ant);

    const antTipGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const antTip = new THREE.Mesh(antTipGeo, cyanAccentMat);
    antTip.position.set(0.13, 1.66, -0.18);
    torsoGroup.add(antTip);

    group.add(torsoGroup);

    // ────────────────────────────────────────────────────────────────────────
    // 2. Stylized Anime Helmet & Glowing Cyan Visor (y: 1.56)
    // ────────────────────────────────────────────────────────────────────────
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.56;

    // Angular Tactical Helmet Shell (two-tone: white face cowl, dark crown)
    const helmetGeo = new THREE.CylinderGeometry(0.155, 0.135, 0.25, 8);
    const helmet = new THREE.Mesh(helmetGeo, jacketNavyMat);
    helmet.castShadow = true;
    headGroup.add(helmet);

    // Off-White Brow & Chin Faceplate Armor
    const faceArmorGeo = new THREE.BoxGeometry(0.24, 0.24, 0.12);
    const faceArmor = new THREE.Mesh(faceArmorGeo, armorWhiteMat);
    faceArmor.position.set(0, 0.02, 0.08);
    headGroup.add(faceArmor);

    // Aerodynamic Top Crest Ridge
    const crestGeo = new THREE.BoxGeometry(0.05, 0.06, 0.26);
    const crest = new THREE.Mesh(crestGeo, armorWhiteMat);
    crest.position.set(0, 0.14, -0.01);
    headGroup.add(crest);

    // Black Visor Bezel Frame
    const bezelGeo = new THREE.BoxGeometry(0.22, 0.09, 0.06);
    const bezel = new THREE.Mesh(bezelGeo, jointBlackMat);
    bezel.position.set(0, 0.02, 0.13);
    headGroup.add(bezel);

    // Signature Glowing Cyan Anime Visor
    const visorGeo = new THREE.BoxGeometry(0.20, 0.07, 0.04);
    const visor = new THREE.Mesh(visorGeo, cyanVisorMat);
    visor.position.set(0, 0.02, 0.15);
    headGroup.add(visor);

    // Amber Telemetry Optical Sensor on Forehead
    const sensorGeo = new THREE.BoxGeometry(0.04, 0.03, 0.03);
    const sensor = new THREE.Mesh(sensorGeo, amberAccentMat);
    sensor.position.set(0.06, 0.09, 0.15);
    headGroup.add(sensor);

    // Cheek Filter Pods
    const podGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.07, 8);
    podGeo.rotateX(Math.PI / 2);
    const podL = new THREE.Mesh(podGeo, gunmetalMat);
    podL.position.set(-0.13, -0.05, 0.07);
    headGroup.add(podL);

    const podR = new THREE.Mesh(podGeo, gunmetalMat);
    podR.position.set(0.13, -0.05, 0.07);
    headGroup.add(podR);

    group.add(headGroup);

    // ────────────────────────────────────────────────────────────────────────
    // 3. Articulated Arms (Pivots at shoulder height y = 1.34, x = ±0.28)
    // ────────────────────────────────────────────────────────────────────────
    const buildArm = (side) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.28, 1.34, 0);

      // Layered Shoulder Pauldron: Off-White Armor Shell
      const pauldronGeo = new THREE.BoxGeometry(0.13, 0.12, 0.16);
      const pauldron = new THREE.Mesh(pauldronGeo, armorWhiteMat);
      pauldron.position.set(side * 0.02, -0.02, 0);
      pauldron.castShadow = true;
      armPivot.add(pauldron);

      // Pauldron Cyan Accent Stripe
      const pauldronStripeGeo = new THREE.BoxGeometry(0.135, 0.02, 0.165);
      const pauldronStripe = new THREE.Mesh(pauldronStripeGeo, cyanAccentMat);
      pauldronStripe.position.set(side * 0.02, -0.01, 0);
      armPivot.add(pauldronStripe);

      // Dark Navy Upper Arm Sleeve
      const bicepGeo = new THREE.CylinderGeometry(0.06, 0.055, 0.22, 8);
      const bicep = new THREE.Mesh(bicepGeo, jacketNavyMat);
      bicep.position.set(0, -0.16, 0);
      bicep.castShadow = true;
      armPivot.add(bicep);

      // Off-White Tactical Forearm Gauntlet
      const gauntletGeo = new THREE.BoxGeometry(0.11, 0.24, 0.12);
      const gauntlet = new THREE.Mesh(gauntletGeo, armorWhiteMat);
      gauntlet.position.set(0, -0.37, 0.01);
      gauntlet.castShadow = true;
      armPivot.add(gauntlet);

      // Left Gauntlet: Glowing Cyan Wrist Holo-Terminal Screen
      if (side < 0) {
        const screenGeo = new THREE.PlaneGeometry(0.06, 0.10);
        const screen = new THREE.Mesh(screenGeo, cyanVisorMat);
        screen.position.set(0, -0.35, 0.075);
        armPivot.add(screen);
      }

      // Tactical Combat Glove (Dark joint material)
      const handGeo = new THREE.BoxGeometry(0.08, 0.10, 0.08);
      const hand = new THREE.Mesh(handGeo, jointBlackMat);
      hand.position.set(0, -0.52, 0.01);
      armPivot.add(hand);

      // White Knuckle Armor Guard
      const knuckleGeo = new THREE.BoxGeometry(0.075, 0.03, 0.03);
      const knuckle = new THREE.Mesh(knuckleGeo, armorWhiteMat);
      knuckle.position.set(0, -0.52, 0.055);
      armPivot.add(knuckle);

      return armPivot;
    };

    this.leftArmPivot = buildArm(-1);
    group.add(this.leftArmPivot);

    this.rightArmPivot = buildArm(1);
    group.add(this.rightArmPivot);

    // ────────────────────────────────────────────────────────────────────────
    // 4. Articulated Legs (Pivots at hip height y = 0.82, x = ±0.14)
    // ────────────────────────────────────────────────────────────────────────
    const buildLeg = (side) => {
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.14, 0.82, 0);

      // Thigh Cargo Trousers (Slate-Navy)
      const thighGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.36, 8);
      const thigh = new THREE.Mesh(thighGeo, pantsMat);
      thigh.position.set(0, -0.18, 0);
      thigh.castShadow = true;
      legPivot.add(thigh);

      // Off-White Thigh Armor Plate (High contrast)
      const thighPlateGeo = new THREE.BoxGeometry(0.12, 0.22, 0.07);
      const thighPlate = new THREE.Mesh(thighPlateGeo, armorWhiteMat);
      thighPlate.position.set(0, -0.16, 0.05);
      legPivot.add(thighPlate);

      // Right Thigh: Quick-Draw Data Scanner Holster
      if (side > 0) {
        const holsterGeo = new THREE.BoxGeometry(0.06, 0.16, 0.08);
        const holster = new THREE.Mesh(holsterGeo, gunmetalMat);
        holster.position.set(0.09, -0.18, 0);
        legPivot.add(holster);
      }

      // Molded Knee Armor Cop (Off-White with Amber Hazard Stripe)
      const kneeGeo = new THREE.BoxGeometry(0.12, 0.09, 0.07);
      const knee = new THREE.Mesh(kneeGeo, armorWhiteMat);
      knee.position.set(0, -0.38, 0.065);
      legPivot.add(knee);

      const kneeStripeGeo = new THREE.BoxGeometry(0.10, 0.02, 0.075);
      const kneeStripe = new THREE.Mesh(kneeStripeGeo, amberAccentMat);
      kneeStripe.position.set(0, -0.38, 0.068);
      legPivot.add(kneeStripe);

      // Lower Leg Greave (Slate-Navy)
      const shinGeo = new THREE.BoxGeometry(0.12, 0.30, 0.12);
      const shin = new THREE.Mesh(shinGeo, pantsMat);
      shin.position.set(0, -0.56, 0.01);
      shin.castShadow = true;
      legPivot.add(shin);

      // Heavy Magnetic Traction Boot (Two-tone: White Armor + Dark Sole)
      const bootSoleGeo = new THREE.BoxGeometry(0.13, 0.08, 0.22);
      const bootSole = new THREE.Mesh(bootSoleGeo, jointBlackMat);
      bootSole.position.set(0, -0.76, 0.035);
      bootSole.castShadow = true;
      legPivot.add(bootSole);

      const bootUpperGeo = new THREE.BoxGeometry(0.12, 0.10, 0.16);
      const bootUpper = new THREE.Mesh(bootUpperGeo, armorWhiteMat);
      bootUpper.position.set(0, -0.68, 0.02);
      legPivot.add(bootUpper);

      // Reinforced Toe Cap with Cyan Tread Line
      const toeCapGeo = new THREE.BoxGeometry(0.125, 0.06, 0.07);
      const toeCap = new THREE.Mesh(toeCapGeo, armorWhiteMat);
      toeCap.position.set(0, -0.75, 0.135);
      legPivot.add(toeCap);

      return legPivot;
    };

    this.leftLegPivot = buildLeg(-1);
    group.add(this.leftLegPivot);

    this.rightLegPivot = buildLeg(1);
    group.add(this.rightLegPivot);

    return group;
  }

  _setupInput() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          break;
        case 'Space':
          if (!e.repeat) {
            this.jumpPressed = true;
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = false;
          break;
        case 'Space':
          this.jumpPressed = false;
          this.jumpConsumed = false;
          break;
      }
    });
  }

  update(delta, cameraYaw = 0) {
    // 1. Jump trigger & vertical physics with ceiling confinement
    const wasGrounded = this.wasGroundedLastFrame;
    if (this.jumpPressed && !this.jumpConsumed && this.isGrounded) {
      this.velocityY = this.jumpVelocity;
      this.isGrounded = false;
      this.jumpConsumed = true;
      noiseSystem.emit(this.position, 7.5, 'jump');
    }

    this.wasGroundedLastFrame = this.isGrounded;

    if (!this.isGrounded) {
      this.velocityY -= this.gravity * delta;
      this.position.y += this.velocityY * delta;

      // Ceiling contact clamp (head height ~1.72m, corridor ceiling 2.6m)
      const ceilingMaxY = ((this.maze && this.maze.wallHeight) ? this.maze.wallHeight : 2.6) - 1.80;
      if (this.position.y >= ceilingMaxY) {
        this.position.y = ceilingMaxY;
        this.velocityY = Math.min(0, this.velocityY);
      }

      // Ground plane collision (y = 0)
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.velocityY = 0;
        this.isGrounded = true;
        if (!wasGrounded) {
          noiseSystem.emit(this.position, 4.0, 'land');
        }
      }
    }

    // 2. Horizontal movement input relative to camera yaw
    const moveInput = new THREE.Vector2(0, 0);
    if (this.keys.forward) moveInput.y += 1;
    if (this.keys.backward) moveInput.y -= 1;
    if (this.keys.left) moveInput.x -= 1;
    if (this.keys.right) moveInput.x += 1;

    this.isMoving = moveInput.lengthSq() > 0.001;
    this.isSprinting = this.keys.sprint && this.isMoving;

    if (this.isMoving) {
      moveInput.normalize();

      const forwardX = -Math.sin(cameraYaw);
      const forwardZ = -Math.cos(cameraYaw);
      const rightX = -Math.sin(cameraYaw - Math.PI / 2);
      const rightZ = -Math.cos(cameraYaw - Math.PI / 2);

      const moveX = forwardX * moveInput.y + rightX * moveInput.x;
      const moveZ = forwardZ * moveInput.y + rightZ * moveInput.x;

      const speed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;
      const moveDistX = moveX * speed * delta;
      const moveDistZ = moveZ * speed * delta;

      // Axis-separated continuous movement with substepping
      const maxSubstep = 0.2;
      const totalDist = Math.hypot(moveDistX, moveDistZ);
      const steps = Math.max(1, Math.ceil(totalDist / maxSubstep));
      const stepDx = moveDistX / steps;
      const stepDz = moveDistZ / steps;

      for (let s = 0; s < steps; s++) {
        // Independent X movement & collision
        if (Math.abs(stepDx) > 0.00001) {
          const targetX = this.position.x + stepDx;
          if (!this._checkWallCollision(targetX, this.position.z)) {
            this.position.x = targetX;
          } else {
            this.position.x = this._clampToWallX(this.position.x, targetX, this.position.z);
          }
        }

        // Independent Z movement & collision
        if (Math.abs(stepDz) > 0.00001) {
          const targetZ = this.position.z + stepDz;
          if (!this._checkWallCollision(this.position.x, targetZ)) {
            this.position.z = targetZ;
          } else {
            this.position.z = this._clampToWallZ(this.position.z, targetZ, this.position.x);
          }
        }
      }

      // Noise emission with cooldowns (only grounded movement makes noise)
      if (this.isGrounded) {
        if (this.isSprinting) {
          this.sprintNoiseCooldown -= delta;
          this.walkNoiseCooldown = 0;
          if (this.sprintNoiseCooldown <= 0) {
            this.sprintNoiseCooldown = this.sprintNoiseInterval;
            noiseSystem.emit(this.position, 4.5, 'sprint');
          }
        } else {
          this.walkNoiseCooldown -= delta;
          this.sprintNoiseCooldown = 0;
          if (this.walkNoiseCooldown <= 0) {
            this.walkNoiseCooldown = this.walkNoiseInterval;
            noiseSystem.emit(this.position, 1.8, 'walk');
          }
        }
      }

      // Smooth rotation toward movement direction
      const targetAngle = Math.atan2(moveX, moveZ);
      let angleDiff = targetAngle - this.facingAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      this.facingAngle += angleDiff * Math.min(1, this.rotationSpeed * delta);
    }

    // 3. Animation state (walking vs airborne vs idle)
    if (!this.isGrounded) {
      // In mid-air: athletic jump posture
      this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, -0.38, delta * 12);
      this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, 0.28, delta * 12);
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, -0.45, delta * 12);
      this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, -0.45, delta * 12);
    } else if (this.isMoving) {
      // Grounded movement: natural articulated walk/run cycle
      const animFreq = this.isSprinting ? 14 : 9;
      this.walkCycle += delta * animFreq;
      const legAngle = Math.sin(this.walkCycle) * 0.52;
      const armAngle = Math.sin(this.walkCycle) * 0.42;

      this.leftLegPivot.rotation.x = legAngle;
      this.rightLegPivot.rotation.x = -legAngle;
      this.leftArmPivot.rotation.x = -armAngle;
      this.rightArmPivot.rotation.x = armAngle;
    } else {
      // Idle pose reset
      this.leftLegPivot.rotation.x *= 0.85;
      this.rightLegPivot.rotation.x *= 0.85;
      this.leftArmPivot.rotation.x *= 0.85;
      this.rightArmPivot.rotation.x *= 0.85;
    }

    // Sync mesh position and rotation
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facingAngle;
  }

  // Check if a circular body at (x, z) overlaps any wall in the maze grid
  _checkWallCollision(x, z, r = this.collisionRadius) {
    const cellSize = this.maze.cellSize;
    const halfCell = cellSize / 2;
    const offsetX = this.maze.offsetX;
    const offsetZ = this.maze.offsetZ;

    // Check maze outer boundary
    const minMazeX = -offsetX - halfCell;
    const maxMazeX = (this.maze.cols - 1) * cellSize - offsetX + halfCell;
    const minMazeZ = -offsetZ - halfCell;
    const maxMazeZ = (this.maze.rows - 1) * cellSize - offsetZ + halfCell;

    if (x - r < minMazeX || x + r > maxMazeX || z - r < minMazeZ || z + r > maxMazeZ) {
      return true;
    }

    // Grid column and row ranges covering the circle bounds
    const minCol = Math.max(0, Math.floor((x - r + offsetX + halfCell) / cellSize));
    const maxCol = Math.min(this.maze.cols - 1, Math.floor((x + r + offsetX + halfCell) / cellSize));
    const minRow = Math.max(0, Math.floor((z - r + offsetZ + halfCell) / cellSize));
    const maxRow = Math.min(this.maze.rows - 1, Math.floor((z + r + offsetZ + halfCell) / cellSize));

    const rSq = r * r;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!this.maze.isWalkable(col, row)) {
          const wallMinX = col * cellSize - offsetX - halfCell;
          const wallMaxX = col * cellSize - offsetX + halfCell;
          const wallMinZ = row * cellSize - offsetZ - halfCell;
          const wallMaxZ = row * cellSize - offsetZ + halfCell;

          const closestX = Math.max(wallMinX, Math.min(x, wallMaxX));
          const closestZ = Math.max(wallMinZ, Math.min(z, wallMaxZ));

          const diffX = x - closestX;
          const diffZ = z - closestZ;

          if (diffX * diffX + diffZ * diffZ < rSq) {
            return true;
          }
        }
      }
    }

    return false;
  }

  _clampToWallX(currX, targetX, z) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 6; i++) {
      const mid = (low + high) * 0.5;
      const testX = currX + (targetX - currX) * mid;
      if (this._checkWallCollision(testX, z)) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return currX + (targetX - currX) * low;
  }

  _clampToWallZ(currZ, targetZ, x) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 6; i++) {
      const mid = (low + high) * 0.5;
      const testZ = currZ + (targetZ - currZ) * mid;
      if (this._checkWallCollision(x, testZ)) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return currZ + (targetZ - currZ) * low;
  }
}

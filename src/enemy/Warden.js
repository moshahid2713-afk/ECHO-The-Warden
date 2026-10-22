import * as THREE from 'three';

/**
 * Procedural 4-tier cel-shading gradient map for anime mecha stepped shading
 */
function getToonGradientMap() {
  const format = THREE.RGBAFormat;
  const colors = new Uint8Array([
    50, 55, 75, 255,    // Deep cel shadow band
    125, 135, 160, 255, // Midtone band
    205, 218, 238, 255, // Light band
    255, 255, 255, 255  // Specular rim band
  ]);
  const texture = new THREE.DataTexture(colors, 4, 1, format);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class Warden {
  constructor(maze, options = {}) {
    this.maze = maze;

    // Hover and floating parameters
    this.baseHeight = options.baseHeight || 1.6;
    this.hoverAmplitude = 0.12;
    this.hoverFrequency = 2.2;
    this.pulseFrequency = 3.5;
    this.animTime = 0;
    this.currentStateName = 'PATROL';

    // Visual state colors
    this.targetEyeColor = new THREE.Color(0x00f0ff);
    this.targetLightColor = new THREE.Color(0x00f0ff);
    this.targetLightIntensity = 2.2;
    this.currentEyeColor = new THREE.Color(0x00f0ff);

    // Position in world space
    this.position = new THREE.Vector3();

    // Set spawn point exactly at maze enemy-start position
    if (this.maze && this.maze.enemyStartWorld) {
      this.position.copy(this.maze.enemyStartWorld);
      this.position.y = this.baseHeight;
    } else {
      this.position.set(0, this.baseHeight, 0);
    }

    // Build the anime mecha surveillance hunter model
    this.mesh = this._createWardenMesh();
    this.mesh.position.copy(this.position);
  }

  _createWardenMesh() {
    const root = new THREE.Group();
    const gradientMap = getToonGradientMap();

    // Floating sub-group that handles up/down bobbing, tilt, and hover dynamics
    this.floatingGroup = new THREE.Group();
    root.add(this.floatingGroup);

    // ────────────────────────────────────────────────────────────────────────
    // 1. Anime Mecha Cel-Shaded Materials
    // ────────────────────────────────────────────────────────────────────────
    // Dark mecha chassis obsidian/slate
    const mechaDarkMat = new THREE.MeshToonMaterial({
      color: 0x161b25,
      gradientMap
    });

    // Contrasting pale titanium armor cowl plates (bold anime mecha silhouette)
    const mechaWhiteMat = new THREE.MeshToonMaterial({
      color: 0xc8d4e4,
      gradientMap
    });

    // Mechanical iris blades & internal hardware
    const mechaHardwareMat = new THREE.MeshToonMaterial({
      color: 0x2e3a4e,
      gradientMap
    });

    // Central glowing anime surveillance eye
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.8,
      roughness: 0.12,
      metalness: 0.1
    });

    // Dynamic neon accents on gyro thrusters and sensor nodes
    this.accentNeonMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    // Focused, non-intrusive anime searchlight cone (narrow angle, restrained opacity)
    this.projectorConeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. Central Core & Mechanical Iris Aperture
    // ────────────────────────────────────────────────────────────────────────
    // Main Mecha Chassis Core (faceted geometric sphere)
    const chassisGeo = new THREE.IcosahedronGeometry(0.50, 2);
    const chassis = new THREE.Mesh(chassisGeo, mechaDarkMat);
    chassis.castShadow = true;
    this.floatingGroup.add(chassis);

    // Inset Mechanical Eye Socket (Cylinder housing)
    const socketGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    socketGeo.rotateX(Math.PI / 2);
    const socket = new THREE.Mesh(socketGeo, mechaHardwareMat);
    socket.position.set(0, 0, 0.10);
    this.floatingGroup.add(socket);

    // Central Glowing Surveillance Lens Core
    const eyeGeo = new THREE.SphereGeometry(0.22, 20, 20);
    this.eyeMesh = new THREE.Mesh(eyeGeo, this.eyeMaterial);
    this.eyeMesh.position.set(0, 0, 0.17);
    this.floatingGroup.add(this.eyeMesh);

    // Mechanical Iris Blades (8 segmented anime aperture blades)
    this.irisGroup = new THREE.Group();
    this.irisGroup.position.set(0, 0, 0.22);
    for (let b = 0; b < 8; b++) {
      const angle = (b * Math.PI) / 4;
      const bladeGeo = new THREE.BoxGeometry(0.11, 0.035, 0.02);
      const blade = new THREE.Mesh(bladeGeo, mechaHardwareMat);
      blade.position.set(Math.cos(angle) * 0.22, Math.sin(angle) * 0.22, 0);
      blade.rotation.z = angle + 0.45;
      this.irisGroup.add(blade);
    }
    this.floatingGroup.add(this.irisGroup);

    // Aperture Bezel Ring (dark hardware)
    const eyeBezelGeo = new THREE.TorusGeometry(0.30, 0.03, 10, 32);
    const eyeBezel = new THREE.Mesh(eyeBezelGeo, mechaDarkMat);
    eyeBezel.position.set(0, 0, 0.24);
    this.floatingGroup.add(eyeBezel);

    // Upper Protective Visor Cowl: Contrasting White Titanium (Anime Mecha Brow)
    const hoodGeo = new THREE.CylinderGeometry(0.46, 0.54, 0.22, 8, 1, false, 0, Math.PI);
    const hood = new THREE.Mesh(hoodGeo, mechaWhiteMat);
    hood.position.set(0, 0.27, 0.08);
    hood.rotation.x = 0.24;
    hood.castShadow = true;
    this.floatingGroup.add(hood);

    // Lower Chin Cowl (Mecha jaw armor)
    const chinGeo = new THREE.CylinderGeometry(0.32, 0.22, 0.16, 6, 1, false, Math.PI, Math.PI);
    const chin = new THREE.Mesh(chinGeo, mechaWhiteMat);
    chin.position.set(0, -0.30, 0.12);
    chin.rotation.x = -0.25;
    this.floatingGroup.add(chin);

    // Focused, Non-Intrusive Searchlight Projector Cone
    const beamGeo = new THREE.ConeGeometry(0.65, 2.8, 14, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 1.6);
    this.searchBeam = new THREE.Mesh(beamGeo, this.projectorConeMat);
    this.floatingGroup.add(this.searchBeam);

    // ────────────────────────────────────────────────────────────────────────
    // 3. Concentric Rotating Mechanical Gyro Rings (Anime Mecha Styling)
    // ────────────────────────────────────────────────────────────────────────
    // Outer Primary Gyro Ring
    const outerRingGeo = new THREE.TorusGeometry(0.86, 0.04, 8, 44);
    this.outerRing = new THREE.Mesh(outerRingGeo, mechaDarkMat);
    this.outerRing.castShadow = true;
    this.floatingGroup.add(this.outerRing);

    // 4 Armored Bracket Nodes with White Caps and Thruster Ports
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const bracketGeo = new THREE.BoxGeometry(0.13, 0.09, 0.15);
      const bracket = new THREE.Mesh(bracketGeo, mechaDarkMat);
      bracket.position.set(
        Math.cos(angle) * 0.86,
        Math.sin(angle) * 0.86,
        0
      );

      // White Titanium Armor Cap
      const capGeo = new THREE.BoxGeometry(0.14, 0.10, 0.05);
      const cap = new THREE.Mesh(capGeo, mechaWhiteMat);
      cap.position.set(0, 0, 0.08);
      bracket.add(cap);

      // Micro-thruster exhaust nozzle
      const nozzleGeo = new THREE.CylinderGeometry(0.02, 0.032, 0.05, 8);
      const nozzle = new THREE.Mesh(nozzleGeo, this.accentNeonMat);
      nozzle.position.set(0, 0, -0.08);
      nozzle.rotateX(Math.PI / 2);
      bracket.add(nozzle);

      this.outerRing.add(bracket);
    }

    // Middle Geared Ring (Counter-rotating)
    const midRingGeo = new THREE.TorusGeometry(0.74, 0.026, 8, 36);
    this.midRing = new THREE.Mesh(midRingGeo, mechaWhiteMat);
    this.floatingGroup.add(this.midRing);

    // Inner Fast Gyro Ring
    const innerRingGeo = new THREE.TorusGeometry(0.63, 0.020, 8, 32);
    this.innerRing = new THREE.Mesh(innerRingGeo, mechaHardwareMat);
    this.floatingGroup.add(this.innerRing);

    // ────────────────────────────────────────────────────────────────────────
    // 4. Stabilizers, Sensor Pods & Anti-Grav Emitter
    // ────────────────────────────────────────────────────────────────────────
    // Dual Aerodynamic Swept Stabilizer Vectoring Fins
    for (let side = -1; side <= 1; side += 2) {
      const finGeo = new THREE.ConeGeometry(0.085, 0.60, 4);
      const fin = new THREE.Mesh(finGeo, mechaDarkMat);
      fin.position.set(side * 0.36, 0.35, -0.32);
      fin.rotation.set(-0.62, 0, side * 0.42);
      fin.castShadow = true;
      this.floatingGroup.add(fin);

      // White Fin Leading Edge
      const edgeGeo = new THREE.BoxGeometry(0.03, 0.50, 0.02);
      const edge = new THREE.Mesh(edgeGeo, mechaWhiteMat);
      edge.position.set(side * 0.38, 0.35, -0.28);
      edge.rotation.set(-0.62, 0, side * 0.42);
      this.floatingGroup.add(edge);

      // Side Telemetry Sensor Pods
      const podGeo = new THREE.BoxGeometry(0.11, 0.14, 0.20);
      const pod = new THREE.Mesh(podGeo, mechaDarkMat);
      pod.position.set(side * 0.52, 0, -0.04);
      pod.castShadow = true;
      this.floatingGroup.add(pod);

      const podLEDGeo = new THREE.BoxGeometry(0.02, 0.05, 0.07);
      const podLED = new THREE.Mesh(podLEDGeo, this.accentNeonMat);
      podLED.position.set(side * 0.58, 0, 0.02);
      this.floatingGroup.add(podLED);
    }

    // Top Telemetry Mast & Rangefinder Needle
    const mastGeo = new THREE.CylinderGeometry(0.010, 0.018, 0.32, 6);
    const mast = new THREE.Mesh(mastGeo, mechaHardwareMat);
    mast.position.set(0, 0.64, -0.14);
    this.floatingGroup.add(mast);

    const mastTipGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const mastTip = new THREE.Mesh(mastTipGeo, this.accentNeonMat);
    mastTip.position.set(0, 0.80, -0.14);
    this.floatingGroup.add(mastTip);

    // Lower Heavy Anti-Grav Propulsion Emitter
    const emitterGeo = new THREE.CylinderGeometry(0.22, 0.09, 0.34, 10);
    const emitter = new THREE.Mesh(emitterGeo, mechaDarkMat);
    emitter.position.set(0, -0.46, 0);
    this.floatingGroup.add(emitter);

    // Dual Glowing Plasma Rings at Emitter Base
    const glowRing1Geo = new THREE.TorusGeometry(0.18, 0.022, 8, 24);
    const glowRing1 = new THREE.Mesh(glowRing1Geo, this.accentNeonMat);
    glowRing1.position.set(0, -0.50, 0);
    glowRing1.rotation.x = Math.PI / 2;
    this.floatingGroup.add(glowRing1);

    const glowRing2Geo = new THREE.TorusGeometry(0.11, 0.018, 8, 20);
    const glowRing2 = new THREE.Mesh(glowRing2Geo, this.accentNeonMat);
    glowRing2.position.set(0, -0.59, 0);
    glowRing2.rotation.x = Math.PI / 2;
    this.floatingGroup.add(glowRing2);

    // ────────────────────────────────────────────────────────────────────────
    // 5. Point Light radiating from glowing eye
    // ────────────────────────────────────────────────────────────────────────
    this.coreLight = new THREE.PointLight(0x00f0ff, 2.2, 8.0);
    this.coreLight.position.set(0, 0, 0.35);
    this.floatingGroup.add(this.coreLight);

    return root;
  }

  setVisualState(stateName) {
    this.currentStateName = stateName;

    if (stateName === 'HUNT') {
      // Aggressive anime crimson
      this.targetEyeColor.setHex(0xff1133);
      this.targetLightColor.setHex(0xff1133);
      this.targetLightIntensity = 3.8;
      this.hoverFrequency = 4.8;
      this.hoverAmplitude = 0.17;
      this.pulseFrequency = 7.0;
    } else if (stateName === 'SEARCH') {
      // Alert scanning amber
      this.targetEyeColor.setHex(0xffaa00);
      this.targetLightColor.setHex(0xffaa00);
      this.targetLightIntensity = 2.6;
      this.hoverFrequency = 3.2;
      this.hoverAmplitude = 0.14;
      this.pulseFrequency = 4.2;
    } else {
      // PATROL — Controlled surveillance cyan
      this.targetEyeColor.setHex(0x00f0ff);
      this.targetLightColor.setHex(0x00f0ff);
      this.targetLightIntensity = 2.2;
      this.hoverFrequency = 2.2;
      this.hoverAmplitude = 0.12;
      this.pulseFrequency = 2.8;
    }
  }

  update(delta) {
    this.animTime += delta;

    // 1. Smooth color interpolation toward current state target color
    this.currentEyeColor.lerp(this.targetEyeColor, Math.min(1, delta * 8));

    if (this.eyeMaterial) {
      this.eyeMaterial.color.copy(this.currentEyeColor);
      this.eyeMaterial.emissive.copy(this.currentEyeColor);
    }
    if (this.accentNeonMat) {
      this.accentNeonMat.color.copy(this.currentEyeColor);
    }
    if (this.projectorConeMat) {
      this.projectorConeMat.color.copy(this.currentEyeColor);
    }
    if (this.coreLight) {
      this.coreLight.color.lerp(this.targetLightColor, Math.min(1, delta * 8));
    }

    // 2. Idle vertical floating (hover)
    const hoverOffset = Math.sin(this.animTime * this.hoverFrequency) * this.hoverAmplitude;
    this.floatingGroup.position.y = hoverOffset;

    // 3. Subtle roll & pitch sway (with aggressive micro-jitter in HUNT mode)
    if (this.currentStateName === 'HUNT') {
      const jitter = Math.sin(this.animTime * 32.0) * 0.018;
      this.floatingGroup.rotation.z = Math.sin(this.animTime * 2.2) * 0.08 + jitter;
      this.floatingGroup.rotation.x = Math.cos(this.animTime * 2.5) * 0.06;
    } else {
      this.floatingGroup.rotation.z = Math.sin(this.animTime * 1.5) * 0.05;
      this.floatingGroup.rotation.x = Math.cos(this.animTime * 1.8) * 0.04;
    }

    // 4. Multi-Axis Counter-Rotating Gyro Rings
    if (this.outerRing) {
      const outerSpeed = this.currentStateName === 'HUNT' ? 1.8 : 0.8;
      this.outerRing.rotation.z += delta * outerSpeed;
      this.outerRing.rotation.x = Math.sin(this.animTime * 0.6) * 0.22;
    }

    if (this.midRing) {
      const midSpeed = this.currentStateName === 'HUNT' ? 2.4 : 1.1;
      this.midRing.rotation.y += delta * midSpeed;
      this.midRing.rotation.z = Math.cos(this.animTime * 0.9) * 0.18;
    }

    if (this.innerRing) {
      const innerSpeed = this.currentStateName === 'HUNT' ? 3.2 : 1.4;
      this.innerRing.rotation.z -= delta * innerSpeed;
      this.innerRing.rotation.x = Math.cos(this.animTime * 0.8) * 0.28;
    }

    // 5. Mechanical Iris Aperture breathing
    if (this.irisGroup) {
      this.irisGroup.rotation.z += delta * 0.3;
    }

    // 6. Pulsating glow for central eye, searchlight, and core light
    const pulse = 1.0 + Math.sin(this.animTime * this.pulseFrequency) * 0.35;
    if (this.eyeMaterial) {
      this.eyeMaterial.emissiveIntensity = 1.8 * pulse;
    }
    if (this.coreLight) {
      this.coreLight.intensity = this.targetLightIntensity * pulse;
    }
    if (this.projectorConeMat) {
      this.projectorConeMat.opacity = (this.currentStateName === 'HUNT' ? 0.14 : 0.08) * pulse;
    }

    // Sync root mesh position with world position
    this.mesh.position.copy(this.position);
  }
}

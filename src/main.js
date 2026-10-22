import * as THREE from 'three';
import './style.css';
import { Maze } from './maze/Maze.js';
import { Player } from './player/Player.js';
import { ThirdPersonCamera } from './player/ThirdPersonCamera.js';
import { Warden } from './enemy/Warden.js';
import { WardenAI } from './ai/WardenAI.js';
import { noiseSystem } from './game/NoiseSystem.js';
import { GameState, GAME_STATE } from './game/GameState.js';
import { ObjectiveSystem } from './game/ObjectiveSystem.js';
import { HUD } from './game/HUD.js';
import { soundSystem } from './audio/SoundSystem.js';

// ────────────────────────────────────────────────────────────────────────────
// 1. Scene setup
// ────────────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d16);
scene.fog = new THREE.FogExp2(0x080d16, 0.015);

// 2. Perspective Camera
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// 3. WebGL Renderer with ACES Filmic Tone Mapping
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('app').appendChild(renderer.domElement);

// 4. Cinematic Facility Lighting
const hemiLight = new THREE.HemisphereLight(0x90b4d6, 0x1a2638, 0.85);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0x7090b8, 0.75);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xb0d8ff, 1.5);
dirLight.position.set(16, 28, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 80;
const d = 26;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x507090, 0.65);
rimLight.position.set(-20, 22, -20);
scene.add(rimLight);

// Strategic Landmark Accent Lights
const centralAccentLight = new THREE.PointLight(0x00d4ff, 2.4, 12.0);
centralAccentLight.position.set(0, 2.2, 0); // Center of Quantum Reactor Hub
scene.add(centralAccentLight);

const amberJunctionLight = new THREE.PointLight(0xff9900, 1.8, 8.0);
amberJunctionLight.position.set(6, 2.2, -3);
scene.add(amberJunctionLight);

// ────────────────────────────────────────────────────────────────────────────
// 5. Maze (15x15 Authoritative Facility)
// ────────────────────────────────────────────────────────────────────────────
const maze = new Maze({
  cellSize: 3,
  wallHeight: 2.6
});
scene.add(maze.group);

// Airlock entry lighting
const airlockLight = new THREE.PointLight(0x00f0ff, 2.0, 7.0);
airlockLight.position.set(maze.playerStartWorld.x, 2.2, maze.playerStartWorld.z);
scene.add(airlockLight);

// ────────────────────────────────────────────────────────────────────────────
// 6. Player (Initial spawn in Sector 0 Airlock facing East toward blast door)
// ────────────────────────────────────────────────────────────────────────────
let player = new Player(maze, {
  walkSpeed: 5.0,
  sprintSpeed: 8.5
});
player.facingAngle = Math.PI / 2; // Facing +X towards the security blast door
player.mesh.rotation.y = Math.PI / 2;
scene.add(player.mesh);

// ────────────────────────────────────────────────────────────────────────────
// 7. Third-person Camera
// ────────────────────────────────────────────────────────────────────────────
let thirdPersonCamera = new ThirdPersonCamera(
  camera,
  player,
  maze,
  renderer.domElement
);
thirdPersonCamera.yaw = -Math.PI / 2; // Looking East directly at the security blast door
thirdPersonCamera.pitch = 0.28;
thirdPersonCamera.disabled = true; // Disabled initially while on Title Screen

if (player.position) {
  camera.position.set(
    player.position.x - 3.2,
    player.position.y + 1.5,
    player.position.z
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Warden enemy (Spawned in Sector 8 Containment at maze.enemyStartWorld)
// ────────────────────────────────────────────────────────────────────────────
let warden = new Warden(maze);
scene.add(warden.mesh);

// ────────────────────────────────────────────────────────────────────────────
// 9. Warden AI state machine controller (PATROL / SEARCH / HUNT)
// ────────────────────────────────────────────────────────────────────────────
let wardenAI = new WardenAI(warden, player, maze, scene, {
  detectionRadius: 9.0,
  searchDuration: 5.0
});

// ────────────────────────────────────────────────────────────────────────────
// 10. Game State (Initial State = TITLE)
// ────────────────────────────────────────────────────────────────────────────
const gameState = new GameState();

// ────────────────────────────────────────────────────────────────────────────
// 11. Objective System (Access Cores + Locked Exit Portal)
// ────────────────────────────────────────────────────────────────────────────
let objectiveSystem = new ObjectiveSystem(maze, player, scene, gameState);

// ────────────────────────────────────────────────────────────────────────────
// 12. Cyberpunk Anime HUD
// ────────────────────────────────────────────────────────────────────────────
const hud = new HUD(gameState);

// Title Screen Action -> Start Mission (Transitions to ENTRY)
hud.onStartGame(() => {
  soundSystem.init();
  soundSystem.playButtonClick();
  hud.hideTitleScreen();
  thirdPersonCamera.disabled = false;
  gameState.transition(GAME_STATE.ENTRY);
});

// Wire ObjectiveSystem → HUD callbacks
objectiveSystem.onPromptChange((prompt) => {
  if (gameState.isPlaying) {
    hud.setPrompt(prompt);
  }
});

objectiveSystem.onCoreCollected((name, collected, total) => {
  hud.updateObjective(collected, total);
  soundSystem.playCoreCollected();
  hud.showFeedback(`${name} ACQUIRED`, 2500);

  if (collected >= total) {
    soundSystem.playExitUnlocked();
    setTimeout(() => {
      hud.showFeedback('EXIT UNLOCKED — PROCEED TO EXTRACTION', 3000);
    }, 1500);
  }
});

objectiveSystem.onVictory(() => {
  soundSystem.playVictory();
  hud.showWinOverlay();
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
});

// Wire GameState transitions
gameState.onChange((newState, oldState) => {
  if (newState === GAME_STATE.LOST) {
    soundSystem.playDefeat();
    hud.showLoseOverlay();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 13. Tactical Pause & Settings (PART 3)
// ────────────────────────────────────────────────────────────────────────────
function pauseGame() {
  if (!gameState.isPlaying && !gameState.isEntry) return;
  gameState.pause();
  hud.showPauseMenu();
  thirdPersonCamera.disabled = true;
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  soundSystem.pauseAmbient();
  soundSystem.playButtonClick();
}

function resumeGame() {
  if (!gameState.isPaused) return;
  gameState.resume();
  hud.hidePauseMenu();
  thirdPersonCamera.disabled = false;
  soundSystem.resumeAmbient();
  soundSystem.playButtonClick();
  clock.getDelta(); // Clear delta accumulation
}

function togglePause() {
  if (gameState.isPaused) {
    resumeGame();
  } else if (gameState.isPlaying || gameState.isEntry) {
    pauseGame();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    togglePause();
  }
});

hud.onResume(() => {
  resumeGame();
});

hud.onVolumeChange((vol) => {
  soundSystem.setVolume(vol);
});

hud.onSensitivityChange((mult) => {
  thirdPersonCamera.setSensitivityMultiplier(mult);
});

// ────────────────────────────────────────────────────────────────────────────
// 14. Facility Entrance E-Key Interaction (PART 1 FIX)
// ────────────────────────────────────────────────────────────────────────────
let entryKeyPressed = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) {
    entryKeyPressed = true;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') {
    entryKeyPressed = false;
  }
});

function handleEntryInteraction() {
  // Only active during ENTRY state
  if (!gameState.isEntry) {
    if (hud.currentPrompt === 'PRESS E TO ENTER FACILITY') {
      hud.setPrompt(null);
    }
    return;
  }

  // If door is opening or already open, immediately hide prompt and ignore further input
  if (!maze.isEntranceDoorClosed || maze.doorOpening) {
    if (hud.currentPrompt === 'PRESS E TO ENTER FACILITY') {
      hud.setPrompt(null);
    }
    return;
  }

  const distToDoor = Math.hypot(
    player.position.x - maze.entranceDoorWorld.x,
    player.position.z - maze.entranceDoorWorld.z
  );

  // Proximity check: only within 2.0m of closed door.
  // When player backs away toward the rear wall (dist > 2.0m), prompt disappears!
  if (distToDoor <= 2.0) {
    hud.setPrompt('PRESS E TO ENTER FACILITY');

    if (entryKeyPressed) {
      entryKeyPressed = false;
      hud.setPrompt(null);
      soundSystem.playDoorOpen();
      soundSystem.playButtonClick();
      hud.showFeedback('ACCESS AUTHORIZED — OPENING GATE', 1800);

      maze.openEntranceDoor(() => {
        gameState.transition(GAME_STATE.PLAYING);
        hud.showFeedback('FACILITY ENTERED', 2200);
      });
    }
  } else {
    // When moved away from the door, hide prompt
    if (hud.currentPrompt === 'PRESS E TO ENTER FACILITY') {
      hud.setPrompt(null);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 15. Defeat detection — Warden catches player
// ────────────────────────────────────────────────────────────────────────────
const CATCH_RADIUS = 1.2;

function checkDefeat() {
  if (!gameState.isPlaying) return;

  const dist = Math.hypot(
    player.position.x - warden.position.x,
    player.position.z - warden.position.z
  );

  if (dist <= CATCH_RADIUS) {
    gameState.transition(GAME_STATE.LOST);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 16. Track previous Warden AI state for HUD and Sound updates
// ────────────────────────────────────────────────────────────────────────────
let prevWardenState = 'PATROL';

function updateWardenStateHUD() {
  const current = wardenAI.currentState;
  if (current !== prevWardenState) {
    prevWardenState = current;
    hud.updateWardenState(current);
    if (current === 'HUNT' || current === 'SEARCH') {
      soundSystem.playWardenAlert(current);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 17. Restart Logic (Returns to entrance airlock with closed door)
// ────────────────────────────────────────────────────────────────────────────
hud.onRestart(() => {
  restartGame();
});

function restartGame() {
  soundSystem.playButtonClick();

  // --- Reset GameState (returns to GAME_STATE.ENTRY) ---
  gameState.reset();

  // --- Reset Security Blast Door ---
  maze.closeEntranceDoor();

  // --- Reset HUD ---
  hud.reset();

  // --- Reset Player in Airlock facing East ---
  scene.remove(player.mesh);
  player.position.copy(maze.playerStartWorld);
  player.position.y = 0;
  player.velocityY = 0;
  player.isGrounded = true;
  player.jumpPressed = false;
  player.jumpConsumed = false;
  player.wasGroundedLastFrame = true;
  player.isSprinting = false;
  player.isMoving = false;
  player.facingAngle = Math.PI / 2; // Facing +X towards door
  player.walkCycle = 0;
  player.walkNoiseCooldown = 0;
  player.sprintNoiseCooldown = 0;
  player.keys.forward = false;
  player.keys.backward = false;
  player.keys.left = false;
  player.keys.right = false;
  player.keys.sprint = false;
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = Math.PI / 2;

  player.leftLegPivot.rotation.x = 0;
  player.rightLegPivot.rotation.x = 0;
  player.leftArmPivot.rotation.x = 0;
  player.rightArmPivot.rotation.x = 0;
  scene.add(player.mesh);

  // --- Reset Camera facing East ---
  thirdPersonCamera.yaw = -Math.PI / 2;
  thirdPersonCamera.pitch = 0.28;
  thirdPersonCamera.currentDistance = thirdPersonCamera.defaultDistance;
  thirdPersonCamera.disabled = false;
  camera.position.set(
    player.position.x - 3.2,
    player.position.y + 1.5,
    player.position.z
  );

  // --- Reset Warden in Containment Zone ---
  scene.remove(warden.mesh);
  warden.position.copy(maze.enemyStartWorld);
  warden.position.y = warden.baseHeight;
  warden.mesh.position.copy(warden.position);
  warden.mesh.rotation.y = 0;
  warden.animTime = 0;
  warden.targetEyeColor.setHex(0x00f0ff);
  warden.targetLightColor.setHex(0x00f0ff);
  warden.currentEyeColor.setHex(0x00f0ff);
  warden.targetLightIntensity = 1.8;
  warden.hoverFrequency = 2.2;
  warden.hoverAmplitude = 0.12;
  warden.setVisualState('PATROL');
  scene.add(warden.mesh);

  // --- Reset WardenAI ---
  wardenAI.currentState = 'PATROL';
  wardenAI.facingAngle = 0;
  wardenAI.perceptionTimer = 0;
  wardenAI.playerVisible = false;
  wardenAI.noiseEvent = null;
  wardenAI.lastKnownPosition.set(0, 0, 0);
  wardenAI.hasLastKnown = false;
  wardenAI.searchTimer = 0;
  wardenAI.searchScanAngle = 0;
  wardenAI.arrivedAtLastKnown = false;
  wardenAI.currentPatrolIndex = 0;
  wardenAI.patrolWaitTimer = 0;
  wardenAI.recalcTimer = 0;
  wardenAI.currentPathGrid = [];
  wardenAI.worldWaypoints = [];
  wardenAI.currentWaypointIndex = 1;
  wardenAI.pathFound = false;
  wardenAI.warden.setVisualState('PATROL');
  wardenAI._planPathToCurrentGoal();
  wardenAI._updateDebugVisualizer();

  // --- Reset Noise System & Perception ---
  noiseSystem.events = [];
  wardenAI.perception.lastKnownPosition.set(0, 0, 0);
  wardenAI.perception.hasLastKnown = false;
  wardenAI.perception.visionStatus = 'OUT OF RANGE';
  wardenAI.perception.lastCheckedDistance = 0;

  // --- Reset Objectives ---
  objectiveSystem.reset();

  objectiveSystem.onPromptChange((prompt) => {
    if (gameState.isPlaying) hud.setPrompt(prompt);
  });
  objectiveSystem.onCoreCollected((name, collected, total) => {
    hud.updateObjective(collected, total);
    soundSystem.playCoreCollected();
    hud.showFeedback(`${name} ACQUIRED`, 2500);
    if (collected >= total) {
      soundSystem.playExitUnlocked();
      setTimeout(() => {
        hud.showFeedback('EXIT UNLOCKED — PROCEED TO EXTRACTION', 3000);
      }, 1500);
    }
  });
  objectiveSystem.onVictory(() => {
    soundSystem.playVictory();
    hud.showWinOverlay();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  });

  prevWardenState = 'PATROL';
  entryKeyPressed = false;
  soundSystem.resumeAmbient();
  clock.getDelta();
}

// ────────────────────────────────────────────────────────────────────────────
// 18. Window resize handling
// ────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ────────────────────────────────────────────────────────────────────────────
// 19. Animation Loop
// ────────────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);

  // If paused, freeze all simulation updates and only render
  if (gameState.isPaused) {
    renderer.render(scene, camera);
    return;
  }

  // Always update procedural facility animations (door sliding, reactor rings)
  maze.update(delta);

  if (gameState.isTitle) {
    // ── Title Phase ──────────────────────────────────────────────────────────
    thirdPersonCamera.update(delta);
    warden.update(delta); // Visual idle

  } else if (gameState.isEntry) {
    // ── Entry Airlock Phase ──────────────────────────────────────────────────
    player.update(delta, thirdPersonCamera.yaw);
    thirdPersonCamera.update(delta);
    warden.update(delta); // Visual idle only, AI dormant
    handleEntryInteraction();

  } else if (gameState.isPlaying) {
    // ── Active Gameplay Phase ────────────────────────────────────────────────
    player.update(delta, thirdPersonCamera.yaw);
    thirdPersonCamera.update(delta);
    wardenAI.update(delta);
    objectiveSystem.update(delta);
    checkDefeat();
    updateWardenStateHUD();

  } else {
    // ── Over Phase (WON or LOST) ─────────────────────────────────────────────
    thirdPersonCamera.update(delta);
    warden.update(delta);
  }

  renderer.render(scene, camera);
}

animate();

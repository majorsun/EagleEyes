import {
  Engine,
  Scene,
  UniversalCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from "@babylonjs/core";
import { GridMaterial, SkyMaterial } from "@babylonjs/materials";
import {
  createDefaultSniper,
  ClientMessage,
  PLAYER_SKINS,
  clampPlayerSkin,
  createDefaultMinigun,
  WeaponSlot,
  type WeaponSlotValue,
  type SwitchWeaponPayload,
  type SetSkinPayload,
  ServerEvent,
  type PlayerInput,
  type KnifeStabEvent,
  type EnemyBrokenEvent,
  type EnemyRespawnedEvent,
  type ShurikenThrownEvent,
  type ShurikenGoneEvent,
  type BulletFiredEvent,
  generateTerrain,
  type TerrainData,
  createSpawnPhysicsState,
  triggerJump,
  triggerSlide,
  toggleProne,
  teleport,
  GROUND_EYE_HEIGHT,
  WORLD_SEED,
  SPAWN_PLATFORM_POSITION,
  TELEPORT_PLATFORM_POSITION,
  PLAYER_RESPAWN_DELAY_MS,
  RESPAWN_INVINCIBILITY_MS,
  PLAYER_MAX_HEALTH,
  MOAT_WIDTH,
  isInPvpZone,
} from "@eagleeyes/shared";
import { createSniperViewModel } from "./weapons/SniperViewModel";
import { createMinigunViewModel } from "./weapons/MinigunViewModel";
import { CameraMotion } from "./view/CameraMotion";
import { Sfx } from "./audio/Sfx";
import { BulletTracer } from "./weapons/BulletTracer";
import { connectToRoom } from "./net/connection";
import { InputReconciler } from "./net/InputReconciler";
import { RemotePlayerView } from "./world/RemotePlayerView";
import { EnemyView } from "./world/EnemyView";
import { ShurikenField } from "./world/ShurikenField";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const crosshair = document.getElementById("crosshair") as HTMLDivElement;
const scopeOverlay = document.getElementById("scopeOverlay") as HTMLDivElement;
const healthBarFill = document.getElementById("healthBarFill") as HTMLDivElement;
const healthText = document.getElementById("healthText") as HTMLSpanElement;
const deathOverlay = document.getElementById("deathOverlay") as HTMLDivElement;
const deathSubtitle = document.getElementById("deathSubtitle") as HTMLDivElement;
const ammoCounter = document.getElementById("ammoCounter") as HTMLDivElement;
const pvpZoneIndicator = document.getElementById("pvpZoneIndicator") as HTMLDivElement;
const invincibilityShield = document.getElementById("invincibilityShield") as HTMLDivElement;
const invincibilityRing = document.getElementById("invincibilityRing") as HTMLDivElement;
const invincibilityTimer = document.getElementById("invincibilityTimer") as HTMLSpanElement;
const radarCanvas = document.getElementById("radarCanvas") as HTMLCanvasElement;
const radarCtx = radarCanvas.getContext("2d")!;
const engine = new Engine(canvas, true);

/** Circular steel spawn platform with a glowing blue rim. */
function createSpawnPlatform(scene: Scene, position: { x: number; z: number }): void {
  const platform = MeshBuilder.CreateCylinder("spawnPlatform", { diameter: 4, height: 0.12, tessellation: 24 }, scene);
  platform.position = new Vector3(position.x, 0.06, position.z);
  const platformMat = new StandardMaterial("spawnPlatformMat", scene);
  platformMat.diffuseColor = new Color3(0.35, 0.4, 0.45);
  platformMat.specularColor = new Color3(0.3, 0.3, 0.3);
  platform.material = platformMat;

  const rim = MeshBuilder.CreateTorus("spawnPlatformRim", { diameter: 4, thickness: 0.08, tessellation: 32 }, scene);
  rim.position = new Vector3(position.x, 0.1, position.z);
  const rimMat = new StandardMaterial("spawnPlatformRimMat", scene);
  rimMat.diffuseColor = new Color3(0.2, 0.6, 0.9);
  rimMat.emissiveColor = new Color3(0.1, 0.35, 0.5);
  rim.material = rimMat;
}

/** Square dark-stone outpost platform with a glowing orange border and corner beacons — visually unrelated to the spawn platform. */
function createOutpostPlatform(scene: Scene, position: { x: number; z: number }): void {
  const base = MeshBuilder.CreateBox("outpostPlatformBase", { width: 5, height: 0.2, depth: 5 }, scene);
  base.position = new Vector3(position.x, 0.1, position.z);
  const baseMat = new StandardMaterial("outpostPlatformBaseMat", scene);
  baseMat.diffuseColor = new Color3(0.15, 0.1, 0.08);
  baseMat.specularColor = new Color3(0.05, 0.05, 0.05);
  base.material = baseMat;

  const glowMat = new StandardMaterial("outpostPlatformGlowMat", scene);
  glowMat.diffuseColor = new Color3(0.9, 0.35, 0.1);
  glowMat.emissiveColor = new Color3(0.85, 0.32, 0.08);

  const edges: [string, number, number, number, number][] = [
    ["N", 5.2, 0.15, position.x, position.z + 2.5],
    ["S", 5.2, 0.15, position.x, position.z - 2.5],
    ["E", 0.15, 5.2, position.x + 2.5, position.z],
    ["W", 0.15, 5.2, position.x - 2.5, position.z],
  ];
  for (const [label, width, depth, x, z] of edges) {
    const edge = MeshBuilder.CreateBox(`outpostPlatformEdge${label}`, { width, height: 0.08, depth }, scene);
    edge.position = new Vector3(x, 0.22, z);
    edge.material = glowMat;
  }

  const corners: [number, number][] = [
    [2.3, 2.3],
    [2.3, -2.3],
    [-2.3, 2.3],
    [-2.3, -2.3],
  ];
  corners.forEach(([dx, dz], i) => {
    const beacon = MeshBuilder.CreateCylinder(
      `outpostPlatformBeacon${i}`,
      { diameter: 0.25, height: 1.4, tessellation: 10 },
      scene,
    );
    beacon.position = new Vector3(position.x + dx, 0.9, position.z + dz);
    beacon.material = glowMat;
  });
}

/** Builds hill/dune meshes from the shared deterministic terrain data, so visuals match server collision exactly. */
function buildTerrainVisuals(scene: Scene, terrain: TerrainData): void {
  const duneMat = new StandardMaterial("duneMat", scene);
  duneMat.diffuseColor = new Color3(0.78, 0.64, 0.44);
  duneMat.specularColor = new Color3(0.1, 0.1, 0.1);

  const hillMat = new StandardMaterial("hillMat", scene);
  hillMat.diffuseColor = new Color3(0.56, 0.46, 0.32);
  hillMat.specularColor = new Color3(0.1, 0.1, 0.1);

  terrain.dunes.forEach((dune, i) => {
    const mesh = MeshBuilder.CreateSphere(
      `dune${i}`,
      { diameterX: dune.width, diameterY: dune.height, diameterZ: dune.width, segments: 10 },
      scene,
    );
    mesh.position = new Vector3(dune.x, -dune.height * 0.3, dune.z);
    mesh.material = duneMat;

    const ledge = MeshBuilder.CreateCylinder(`duneLedge${i}`, { diameter: dune.width * 0.3, height: 0.2, tessellation: 12 }, scene);
    ledge.position = new Vector3(dune.ledge.x, dune.ledge.y, dune.ledge.z);
    ledge.material = duneMat;
  });

  const mesaMat = new StandardMaterial("mesaMat", scene);
  mesaMat.diffuseColor = new Color3(0.52, 0.37, 0.26);
  mesaMat.specularColor = new Color3(0.08, 0.08, 0.08);

  const mesaCapMat = new StandardMaterial("mesaCapMat", scene);
  mesaCapMat.diffuseColor = new Color3(0.62, 0.46, 0.32);
  mesaCapMat.specularColor = new Color3(0.06, 0.06, 0.06);

  terrain.mesas.forEach((mesa, i) => {
    // Flat-topped, straight-sided: the collision treats the whole disc as one height, so the
    // mesh has to read as a shelf you step onto rather than a slope you walk up.
    const body = MeshBuilder.CreateCylinder(
      `mesa${i}`,
      { diameterTop: mesa.radius * 2, diameterBottom: mesa.radius * 2.2, height: mesa.height, tessellation: 12 },
      scene,
    );
    body.position = new Vector3(mesa.x, mesa.height / 2, mesa.z);
    body.material = mesaMat;

    const cap = MeshBuilder.CreateCylinder(
      `mesaCap${i}`,
      { diameter: mesa.radius * 2, height: 0.12, tessellation: 12 },
      scene,
    );
    cap.position = new Vector3(mesa.x, mesa.height, mesa.z);
    cap.material = mesaCapMat;
  });

  terrain.hills.forEach((hill, i) => {
    const mesh = MeshBuilder.CreateSphere(
      `hill${i}`,
      { diameterX: hill.radius * 2, diameterY: hill.height * 2, diameterZ: hill.radius * 2, segments: 16 },
      scene,
    );
    mesh.position = new Vector3(hill.centerX, hill.centerY, hill.centerZ);
    mesh.material = hillMat;

    hill.ledges.forEach((ledge, s) => {
      const ledgeDiameter = s === 0 ? 3 : 2.5 + Math.random();
      const ledgeMesh = MeshBuilder.CreateCylinder(`hillLedge${i}_${s}`, { diameter: ledgeDiameter, height: 0.25, tessellation: 14 }, scene);
      ledgeMesh.position = new Vector3(ledge.x, ledge.y, ledge.z);
      ledgeMesh.material = hillMat;
    });
  });
}

/** Scatters rock clusters and cacti — purely decorative, so unlike hills/dunes they don't need to match the server. */
function createDecorations(scene: Scene, centerX: number, centerZ: number): void {
  const rockMat = new StandardMaterial("rockMat", scene);
  rockMat.diffuseColor = new Color3(0.42, 0.28, 0.2);
  rockMat.specularColor = new Color3(0.15, 0.12, 0.1);

  const cactusMat = new StandardMaterial("cactusMat", scene);
  cactusMat.diffuseColor = new Color3(0.25, 0.42, 0.22);
  cactusMat.specularColor = new Color3(0.05, 0.05, 0.05);

  const randomAround = (minRadius: number, maxRadius: number): Vector3 => {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    return new Vector3(centerX + Math.cos(angle) * radius, 0, centerZ + Math.sin(angle) * radius);
  };

  const woodMat = new StandardMaterial("deadWoodMat", scene);
  woodMat.diffuseColor = new Color3(0.34, 0.25, 0.17);
  woodMat.specularColor = new Color3(0.04, 0.04, 0.04);

  const stoneMat = new StandardMaterial("ruinStoneMat", scene);
  stoneMat.diffuseColor = new Color3(0.58, 0.52, 0.42);
  stoneMat.specularColor = new Color3(0.06, 0.06, 0.06);

  const scrubMat = new StandardMaterial("scrubMat", scene);
  scrubMat.diffuseColor = new Color3(0.38, 0.36, 0.18);
  scrubMat.specularColor = new Color3(0.03, 0.03, 0.03);

  // Dead trees: a leaning trunk with a couple of bare branches.
  for (let i = 0; i < 7; i++) {
    const pos = randomAround(10, 45);
    const trunkHeight = 2.2 + Math.random() * 2;
    const trunk = MeshBuilder.CreateCylinder(`deadTrunk${i}`, { diameterTop: 0.12, diameterBottom: 0.3, height: trunkHeight, tessellation: 7 }, scene);
    trunk.position = new Vector3(pos.x, trunkHeight / 2, pos.z);
    trunk.rotation.z = (Math.random() - 0.5) * 0.3;
    trunk.material = woodMat;

    for (let b = 0; b < 2 + Math.floor(Math.random() * 2); b++) {
      const branch = MeshBuilder.CreateCylinder(`deadBranch${i}_${b}`, { diameterTop: 0.03, diameterBottom: 0.1, height: 0.8 + Math.random() * 0.7, tessellation: 5 }, scene);
      branch.position = new Vector3(pos.x + (Math.random() - 0.5) * 0.5, trunkHeight * (0.55 + Math.random() * 0.35), pos.z + (Math.random() - 0.5) * 0.5);
      branch.rotation = new Vector3((Math.random() - 0.5) * 1.6, Math.random() * Math.PI, (Math.random() - 0.5) * 1.6);
      branch.material = woodMat;
    }
  }

  // Ruined walls: short broken runs of stone that make usable cover.
  for (let i = 0; i < 5; i++) {
    const pos = randomAround(14, 50);
    const yaw = Math.random() * Math.PI;
    const segments = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < segments; s++) {
      const height = 0.7 + Math.random() * 1.1;
      const block = MeshBuilder.CreateBox(`ruin${i}_${s}`, { width: 1.4, height, depth: 0.5 }, scene);
      block.position = new Vector3(
        pos.x + Math.cos(yaw) * s * 1.45,
        height / 2,
        pos.z + Math.sin(yaw) * s * 1.45,
      );
      block.rotation.y = yaw + (Math.random() - 0.5) * 0.12;
      block.material = stoneMat;
    }
  }

  // Dry scrub, scattered thickly and cheaply, to break up the empty sand.
  for (let i = 0; i < 26; i++) {
    const pos = randomAround(5, 55);
    const size = 0.25 + Math.random() * 0.4;
    const bush = MeshBuilder.CreatePolyhedron(`scrub${i}`, { type: 1, size }, scene);
    bush.position = new Vector3(pos.x, size * 0.6, pos.z);
    bush.rotation = new Vector3(Math.random(), Math.random() * Math.PI, Math.random());
    bush.material = scrubMat;
  }

  for (let i = 0; i < 10; i++) {
    const pos = randomAround(6, 48);
    const rocksInCluster = 2 + Math.floor(Math.random() * 4);
    for (let j = 0; j < rocksInCluster; j++) {
      const size = 0.6 + Math.random() * 1.4;
      const rock = MeshBuilder.CreatePolyhedron(`rock${i}_${j}`, { type: Math.floor(Math.random() * 4), size }, scene);
      rock.position = new Vector3(pos.x + (Math.random() - 0.5) * 2, size * 0.4, pos.z + (Math.random() - 0.5) * 2);
      rock.rotation = new Vector3(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.material = rockMat;
    }
  }

  for (let i = 0; i < 4; i++) {
    const pos = randomAround(6, 25);
    const trunkHeight = 1.5 + Math.random() * 1.5;
    const trunk = MeshBuilder.CreateCylinder(`cactusTrunk${i}`, { diameter: 0.35, height: trunkHeight, tessellation: 8 }, scene);
    trunk.position = new Vector3(pos.x, trunkHeight / 2, pos.z);
    trunk.material = cactusMat;

    const armCount = 1 + Math.floor(Math.random() * 2);
    for (let a = 0; a < armCount; a++) {
      const armHeight = 0.6 + Math.random() * 0.5;
      const arm = MeshBuilder.CreateCylinder(`cactusArm${i}_${a}`, { diameter: 0.22, height: armHeight, tessellation: 8 }, scene);
      const side = a % 2 === 0 ? 1 : -1;
      arm.position = new Vector3(pos.x + side * 0.3, trunkHeight * 0.5 + armHeight * 0.3, pos.z);
      arm.rotation.z = side * 0.6;
      arm.material = cactusMat;
    }
  }
}

function createScene(terrain: TerrainData): Scene {
  const scene = new Scene(engine);

  const camera = new UniversalCamera(
    "fpsCamera",
    new Vector3(SPAWN_PLATFORM_POSITION.x, GROUND_EYE_HEIGHT, SPAWN_PLATFORM_POSITION.z),
    scene,
  );
  camera.setTarget(Vector3.Zero());
  camera.attachControl(canvas, true);
  camera.minZ = 0.1;
  camera.angularSensibility = 4000;
  // Horizontal/vertical position is fully server-authoritative (shared stepMovement), so Babylon's
  // own gravity/collision integration is disabled -- it would otherwise fight our direct position writes.
  camera.applyGravity = false;
  camera.checkCollisions = false;

  // Desert haze: fades the finite ground's edge into the warm horizon color.
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.86, 0.75, 0.55);
  scene.fogStart = 20;
  scene.fogEnd = 100;

  const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
  light.diffuse = new Color3(1, 0.95, 0.8);
  light.groundColor = new Color3(0.45, 0.33, 0.2);

  const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000 }, scene);
  const skyMaterial = new SkyMaterial("skyMaterial", scene);
  skyMaterial.backFaceCulling = false;
  skyMaterial.turbidity = 20;
  skyMaterial.rayleigh = 1;
  skyMaterial.luminance = 1;
  skyMaterial.inclination = 0.3;
  skyMaterial.azimuth = 0.25;
  skybox.material = skyMaterial;
  skybox.infiniteDistance = true;

  const groundMat = new GridMaterial("groundGrid", scene);
  groundMat.majorUnitFrequency = 5;
  groundMat.minorUnitVisibility = 0.35;
  groundMat.gridRatio = 1;
  groundMat.mainColor = new Color3(0.76, 0.62, 0.42);
  groundMat.lineColor = new Color3(0.55, 0.42, 0.25);

  const groundHalfExtent = 300;
  const groundWidth = groundHalfExtent * 2;
  const moatCenterZ = (SPAWN_PLATFORM_POSITION.z + TELEPORT_PLATFORM_POSITION.z) / 2;
  const moatStartZ = moatCenterZ - MOAT_WIDTH / 2;
  const moatEndZ = moatCenterZ + MOAT_WIDTH / 2;

  const nearGround = MeshBuilder.CreateGround("nearGround", { width: groundWidth, height: moatStartZ + groundHalfExtent }, scene);
  nearGround.position.z = (-groundHalfExtent + moatStartZ) / 2;
  nearGround.material = groundMat;

  const farGround = MeshBuilder.CreateGround("farGround", { width: groundWidth, height: groundHalfExtent - moatEndZ }, scene);
  farGround.position.z = (moatEndZ + groundHalfExtent) / 2;
  farGround.material = groundMat;

  // Moat: a sunken floor beneath the gap, purely visual now -- the server's analytic ground height
  // field (groundSurfaceHeightAt) is what actually keeps a falling player from dropping forever.
  const moatFloor = MeshBuilder.CreateGround("moatFloor", { width: groundWidth, height: MOAT_WIDTH }, scene);
  moatFloor.position = new Vector3(0, -5, moatCenterZ);
  const moatMat = new StandardMaterial("moatMat", scene);
  moatMat.diffuseColor = new Color3(0.15, 0.35, 0.45);
  moatMat.specularColor = new Color3(0.3, 0.4, 0.45);
  moatFloor.material = moatMat;

  createSpawnPlatform(scene, SPAWN_PLATFORM_POSITION);
  createOutpostPlatform(scene, TELEPORT_PLATFORM_POSITION);
  buildTerrainVisuals(scene, terrain);
  createDecorations(scene, TELEPORT_PLATFORM_POSITION.x, TELEPORT_PLATFORM_POSITION.z);

  return scene;
}

const terrain = generateTerrain(WORLD_SEED, TELEPORT_PLATFORM_POSITION.x, TELEPORT_PLATFORM_POSITION.z);
const scene = createScene(terrain);
const camera = scene.activeCamera as UniversalCamera;
const baseFov = camera.fov;
const baseAngularSensibility = camera.angularSensibility;

const { room, $: stateCallbacks } = await connectToRoom();
const localSessionId = room.sessionId;
const reconciler = new InputReconciler(createSpawnPhysicsState(), terrain);
const remotePlayers = new Map<string, RemotePlayerView>();
const enemyViews = new Map<string, EnemyView>();
const shurikens = new ShurikenField(scene);

stateCallbacks(room.state).players.onAdd((player, sessionId) => {
  if (sessionId === localSessionId) {
    stateCallbacks(player).listen("health", (value, previous) => {
      if (value < previous && value > 0) sfx.hurt();
    });
    stateCallbacks(player).listen("isDead", (value) => {
      if (value) sfx.death();
      else sfx.respawn();
    });
    return;
  }
  const view = new RemotePlayerView(scene, player.x, player.y, player.z, player.rotY, player.skin, player.isProne);
  remotePlayers.set(sessionId, view);
  stateCallbacks(player).listen("skin", (value) => view.setSkin(value));
  stateCallbacks(player).listen("isProne", (value) => view.setProne(value));
  stateCallbacks(player).listen("isJumping", (value) => view.setJumping(value));
});
stateCallbacks(room.state).players.onRemove((_player, sessionId) => {
  remotePlayers.get(sessionId)?.dispose();
  remotePlayers.delete(sessionId);
});

stateCallbacks(room.state).enemies.onAdd((enemy, enemyId) => {
  // enemyId is server-assigned as "enemy-0", "enemy-1", ... -- use that index for a stable,
  // human-readable "1"/"2"/"3" marker label and a matching distinct body color.
  const index = Number(enemyId.split("-").pop()) || 0;
  const view = new EnemyView(scene, enemy.x, enemy.y, enemy.z, enemy.rotY, `${index + 1}`, index);
  enemyViews.set(enemyId, view);
  stateCallbacks(enemy).listen("health", (value, previous) => {
    if (value < previous) {
      view.flashHit();
      sfx.hitMarker();
    }
  });
});
stateCallbacks(room.state).enemies.onRemove((_enemy, enemyId) => {
  enemyViews.get(enemyId)?.dispose();
  enemyViews.delete(enemyId);
});
room.onMessage(ServerEvent.KnifeStab, (payload: KnifeStabEvent) => {
  enemyViews.get(payload.enemyId)?.stabKnife();
  sfx.swordSwing();
});
room.onMessage(ServerEvent.EnemyBroken, (payload: EnemyBrokenEvent) => {
  enemyViews.get(payload.enemyId)?.break(payload.x, payload.y, payload.z);
  sfx.enemyBreak();
});
room.onMessage(ServerEvent.ShurikenThrown, (payload: ShurikenThrownEvent) => {
  enemyViews.get(payload.enemyId)?.throwAnimation();
  sfx.shurikenThrow();
  shurikens.spawn(
    payload.id,
    new Vector3(payload.originX, payload.originY, payload.originZ),
    new Vector3(payload.dirX, payload.dirY, payload.dirZ),
  );
});
room.onMessage(ServerEvent.ShurikenGone, (payload: ShurikenGoneEvent) => {
  shurikens.retire(payload.id, new Vector3(payload.x, payload.y, payload.z), payload.hit);
  if (payload.hit) sfx.shurikenHit();
});
room.onMessage(ServerEvent.EnemyRespawned, (payload: EnemyRespawnedEvent) => {
  const enemy = room.state.enemies.get(payload.enemyId);
  if (enemy) enemyViews.get(payload.enemyId)?.respawn(enemy.x, enemy.y, enemy.z);
});

function updateEnemies(deltaSeconds: number): void {
  shurikens.update(deltaSeconds);
  for (const [enemyId, view] of enemyViews) {
    const enemy = room.state.enemies.get(enemyId);
    if (!enemy) continue;
    view.setTarget(enemy.x, enemy.y, enemy.z, enemy.rotY);
    view.update(deltaSeconds);
  }
}

const movementKeys = { forward: false, back: false, left: false, right: false };
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") movementKeys.forward = true;
  else if (e.code === "KeyS") movementKeys.back = true;
  else if (e.code === "KeyA") movementKeys.left = true;
  else if (e.code === "KeyD") movementKeys.right = true;
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") movementKeys.forward = false;
  else if (e.code === "KeyS") movementKeys.back = false;
  else if (e.code === "KeyA") movementKeys.left = false;
  else if (e.code === "KeyD") movementKeys.right = false;
});

function isLocalPlayerDead(): boolean {
  return room.state.players.get(localSessionId)?.isDead ?? false;
}

const INPUT_SEND_INTERVAL = 1 / 30;
let inputSendAccumulator = 0;
let wasDeadLastFrame = false;
// Joining is a spawn like any other and the server grants the grace window in onJoin, so start
// the local mirror of it here too -- otherwise the shield HUD and the local fire-block disagree
// with the server for the first three seconds of every session.
let invincibleUntil = performance.now() + RESPAWN_INVINCIBILITY_MS;

function updateNetworkedMovement(deltaSeconds: number): void {
  const localPlayer = room.state.players.get(localSessionId);
  if (!localPlayer) return;

  if (localPlayer.isDead) {
    if (!wasDeadLastFrame) wasDeadLastFrame = true;
    return;
  }
  if (wasDeadLastFrame) {
    // Just respawned server-side: drop stale prediction entirely rather than reconcile against it.
    reconciler.reset(createSpawnPhysicsState());
    wasDeadLastFrame = false;
    // Mirrors the server granting RESPAWN_INVINCIBILITY_MS of damage immunity on respawn.
    invincibleUntil = performance.now() + RESPAWN_INVINCIBILITY_MS;
  } else {
    reconciler.reconcile({ x: localPlayer.x, y: localPlayer.y, z: localPlayer.z }, localPlayer.lastProcessedSeq);
  }

  const input: PlayerInput = {
    moveX: (movementKeys.right ? 1 : 0) - (movementKeys.left ? 1 : 0),
    moveZ: (movementKeys.forward ? 1 : 0) - (movementKeys.back ? 1 : 0),
    yaw: camera.rotation.y,
  };
  const previousX = reconciler.state.x;
  const previousZ = reconciler.state.z;
  const wasAirborne = reconciler.state.isJumping;
  const fallSpeed = reconciler.state.velocityY;

  const seq = reconciler.predict(input, deltaSeconds);

  // Footfalls come out of distance covered, so the shake matches the actual pace -- including
  // the slow heavy sway of a crawl -- instead of running off a free clock.
  const travelled = Math.hypot(reconciler.state.x - previousX, reconciler.state.z - previousZ);
  const motion = cameraMotion.update(deltaSeconds, {
    speed: deltaSeconds > 0 ? travelled / deltaSeconds : 0,
    isJumping: reconciler.state.isJumping,
    isCrawling: reconciler.state.isProne,
    travelled,
  });
  if (wasAirborne && !reconciler.state.isJumping) sfx.land(fallSpeed < -9);

  camera.position.x = reconciler.state.x;
  camera.position.y = reconciler.state.y + motion.height;
  camera.position.z = reconciler.state.z;
  camera.rotation.z = motion.roll;

  inputSendAccumulator += deltaSeconds;
  if (inputSendAccumulator >= INPUT_SEND_INTERVAL) {
    inputSendAccumulator -= INPUT_SEND_INTERVAL;
    room.send(ClientMessage.Input, { ...input, seq });
  }
}

function updateRemotePlayers(deltaSeconds: number): void {
  for (const [sessionId, view] of remotePlayers) {
    const player = room.state.players.get(sessionId);
    if (!player) continue;
    view.updateDeathState(player.isDead, player.x, player.y, player.z, player.rotY);
    if (!player.isDead) view.setTarget(player.x, player.y, player.z, player.rotY);
    view.update(deltaSeconds);
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || isLocalPlayerDead()) return;
  e.preventDefault();
  const before = reconciler.state;
  reconciler.state = triggerJump(reconciler.state);
  if (reconciler.state !== before) {
    sfx.jump();
    cameraMotion.jumped();
  }
  room.send(ClientMessage.Jump);
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyC" || isLocalPlayerDead()) return;
  reconciler.state = triggerSlide(reconciler.state, camera.rotation.y);
  room.send(ClientMessage.Slide);
});

window.addEventListener("keydown", (e) => {
  // F is the crawl key; V stays bound to it so the old habit still works.
  if ((e.code !== "KeyF" && e.code !== "KeyV") || isLocalPlayerDead()) return;
  reconciler.state = toggleProne(reconciler.state, terrain);
  sfx.footstep(true);
  room.send(ClientMessage.ToggleProne);
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyP" || isLocalPlayerDead()) return;
  reconciler.state = teleport(reconciler.state);
  room.send(ClientMessage.Teleport);
});

const sniper = createDefaultSniper();
const minigun = createDefaultMinigun();
const sfx = new Sfx();
const cameraMotion = new CameraMotion();
const { root: weaponRoot, muzzle } = createSniperViewModel(scene, camera);
const minigunView = createMinigunViewModel(scene, camera);
minigunView.root.setEnabled(false);

/** Which weapon is in hand. The server holds the authoritative copy; this mirrors it locally. */
let activeSlot: WeaponSlotValue = WeaponSlot.Sniper;
/** True while the left mouse button is held, so the minigun can keep firing. */
let triggerDown = false;

const activeWeaponLocal = () => (activeSlot === WeaponSlot.Minigun ? minigun : sniper);

function switchWeapon(slot: WeaponSlotValue): void {
  if (slot === activeSlot || isLocalPlayerDead()) return;
  // Leaving the sniper while scoped would strand the zoomed FOV and the scope overlay.
  if (sniper.isScoped) {
    setScoped(false);
    sniper.toggleScope();
  }
  activeSlot = slot;
  weaponRoot.setEnabled(slot === WeaponSlot.Sniper);
  minigunView.root.setEnabled(slot === WeaponSlot.Minigun);
  sfx.weaponSwitch();
  room.send(ClientMessage.SwitchWeapon, { weapon: slot } satisfies SwitchWeaponPayload);
}

cameraMotion.onStep(() => sfx.footstep(reconciler.state.isProne));
const bulletTracer = new BulletTracer(scene);

const weaponRestPosition = weaponRoot.position.clone();
const weaponRestRotationX = weaponRoot.rotation.x;
const RECOIL_KICK_DISTANCE = 0.08;
const RECOIL_KICK_ANGLE = 0.14;
const RECOIL_RECOVERY_RATE = 9;
let recoilKick = 0;

/** Kicks the view model back and tips the muzzle up on fire, then eases back to rest each frame. */
function applyRecoil(deltaSeconds: number): void {
  recoilKick = Math.max(0, recoilKick - deltaSeconds * RECOIL_RECOVERY_RATE);
  weaponRoot.position.z = weaponRestPosition.z - recoilKick * RECOIL_KICK_DISTANCE;
  weaponRoot.rotation.x = weaponRestRotationX - recoilKick * RECOIL_KICK_ANGLE;
}

room.onMessage(ServerEvent.BulletFired, (payload: BulletFiredEvent) => {
  bulletTracer.spawn(
    new Vector3(payload.originX, payload.originY, payload.originZ),
    new Vector3(payload.hitX, payload.hitY, payload.hitZ),
  );
});

function setScoped(scoped: boolean): void {
  camera.fov = scoped ? sniper.scopeFov : baseFov;
  camera.angularSensibility = scoped
    ? baseAngularSensibility * sniper.scopeSensitivityDivisor
    : baseAngularSensibility;
  scopeOverlay.style.display = scoped ? "contents" : "none";
  crosshair.style.display = scoped ? "none" : "block";
  weaponRoot.setEnabled(!scoped);
}

const AIM_CONVERGENCE_DISTANCE = 1000;

/**
 * Fire-rate/ammo gated locally only to avoid spamming the server with messages it would just drop;
 * the server holds its own Sniper instance and is the one that actually resolves the hit and
 * broadcasts BulletFired (to everyone, including the shooter) -- so no local tracer spawns here.
 */
function fire(): void {
  const now = performance.now();
  const weapon = activeWeaponLocal();
  if (isLocalPlayerDead() || now < invincibleUntil || !weapon.fire(now)) return;
  const isMinigun = activeSlot === WeaponSlot.Minigun;
  // The minigun kicks far less per round, or seventeen shots a second would shake the view apart.
  recoilKick = isMinigun ? 0.28 : 1;
  const origin = (isMinigun ? minigunView.muzzle : muzzle).getAbsolutePosition();
  const aimRay = camera.getForwardRay(AIM_CONVERGENCE_DISTANCE);
  const aimPoint = aimRay.origin.add(aimRay.direction.scale(AIM_CONVERGENCE_DISTANCE));
  const direction = aimPoint.subtract(origin).normalize();
  if (isMinigun) {
    // Scatter into a cone. The server trusts the direction we send, so the spread has to be
    // applied here -- it is the weapon's defining drawback, not a visual effect.
    const spread = minigun.spreadRadians;
    direction.x += (Math.random() * 2 - 1) * spread;
    direction.y += (Math.random() * 2 - 1) * spread;
    direction.z += (Math.random() * 2 - 1) * spread;
    direction.normalize();
  }
  if (isMinigun) sfx.minigunShot();
  else sfx.sniperShot();
  room.send(ClientMessage.Fire, {
    originX: origin.x,
    originY: origin.y,
    originZ: origin.z,
    dirX: direction.x,
    dirY: direction.y,
    dirZ: direction.z,
  });
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyR" || isLocalPlayerDead()) return;
  if (activeWeaponLocal().startReload(performance.now())) {
    sfx.reload();
    room.send(ClientMessage.Reload);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Digit1") switchWeapon(WeaponSlot.Sniper);
  else if (e.code === "Digit2") switchWeapon(WeaponSlot.Minigun);
});

// --- Cosmetics menu -------------------------------------------------------------------------
const cosmeticsButton = document.getElementById("cosmeticsButton") as HTMLButtonElement;
const cosmeticsPanel = document.getElementById("cosmeticsPanel") as HTMLDivElement;
const cosmeticsOptions = document.getElementById("cosmeticsOptions") as HTMLDivElement;
const SKIN_STORAGE_KEY = "eagleeyes.skin";

function rgbToCss([r, g, b]: readonly [number, number, number]): string {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

/** Private browsing and blocked site data make localStorage throw, which shouldn't cost a round. */
function readStoredSkin(): number {
  try {
    return clampPlayerSkin(localStorage.getItem(SKIN_STORAGE_KEY));
  } catch {
    return 0;
  }
}

let selectedSkin = readStoredSkin();

const skinButtons = PLAYER_SKINS.map((skin, index) => {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "cosmeticsOption";
  const swatch = document.createElement("span");
  swatch.className = "cosmeticsSwatch";
  swatch.style.background = rgbToCss(skin.uniform);
  option.append(swatch, document.createTextNode(skin.label));
  option.addEventListener("click", () => selectSkin(index));
  cosmeticsOptions.append(option);
  return option;
});

/**
 * Stores the choice and publishes it to the room. The skin lives in player state rather than
 * staying local, because the point of it is what everyone *else* sees on your operator.
 */
function selectSkin(index: number): void {
  selectedSkin = clampPlayerSkin(index);
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, String(selectedSkin));
  } catch {
    // Not worth surfacing: the choice still applies for this session.
  }
  skinButtons.forEach((option, i) => option.setAttribute("aria-pressed", String(i === selectedSkin)));
  room.send(ClientMessage.SetSkin, { skin: selectedSkin } satisfies SetSkinPayload);
}

function setCosmeticsOpen(open: boolean): void {
  cosmeticsPanel.classList.toggle("open", open);
  // Mouse look holds a pointer lock, which hides the cursor and swallows clicks -- release it
  // while the menu is up. Clicking the view re-locks it, as it does on first load.
  if (open && document.pointerLockElement) document.exitPointerLock();
}

cosmeticsButton.addEventListener("click", () => setCosmeticsOpen(!cosmeticsPanel.classList.contains("open")));
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyB") setCosmeticsOpen(!cosmeticsPanel.classList.contains("open"));
  else if (e.code === "Escape") setCosmeticsOpen(false);
});

selectSkin(selectedSkin);

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("click", () => {
  sfx.unlock();
  if (!document.pointerLockElement) {
    canvas.requestPointerLock();
  }
});

canvas.addEventListener("pointerdown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) {
    triggerDown = true;
    fire();
  } else if (e.button === 2 && activeSlot === WeaponSlot.Sniper) {
    setScoped(sniper.toggleScope());
  }
});

window.addEventListener("pointerup", (e) => {
  if (e.button === 0) triggerDown = false;
});
// Losing the pointer lock (alt-tab, Escape) must not leave the trigger stuck down.
window.addEventListener("blur", () => {
  triggerDown = false;
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && sniper.isScoped) {
    setScoped(false);
    sniper.toggleScope();
  }
});

let respawnAt = 0;

function updateHud(): void {
  const localPlayer = room.state.players.get(localSessionId);
  if (!localPlayer) return;

  if (localPlayer.isDead) {
    if (!deathOverlay.classList.contains("visible")) {
      respawnAt = performance.now() + PLAYER_RESPAWN_DELAY_MS;
      deathOverlay.classList.add("visible");
    }
    const remainingMs = Math.max(0, respawnAt - performance.now());
    deathSubtitle.textContent = `Respawning in ${Math.ceil(remainingMs / 1000)}s`;
  } else {
    deathOverlay.classList.remove("visible");
  }

  const pct = (localPlayer.health / PLAYER_MAX_HEALTH) * 100;
  healthBarFill.style.width = `${pct}%`;
  healthText.textContent = `${Math.ceil(localPlayer.health)} / ${PLAYER_MAX_HEALTH}`;

  sniper.tick(performance.now());
  if (sniper.isReloading) {
    ammoCounter.textContent = `Reloading... ${(activeWeaponLocal().reloadRemainingMs(performance.now()) / 1000).toFixed(1)}s`;
    ammoCounter.classList.add("reloading");
  } else {
    ammoCounter.textContent = `${activeWeaponLocal().name.toUpperCase()}  ${localPlayer.ammo} / ${activeWeaponLocal().magazineSize}`;
    ammoCounter.classList.remove("reloading");
  }

  pvpZoneIndicator.classList.toggle("visible", isInPvpZone(localPlayer.z));

  const invincibleRemainingMs = Math.max(0, invincibleUntil - performance.now());
  if (invincibleRemainingMs > 0) {
    invincibilityShield.classList.add("visible");
    invincibilityRing.style.transform = `scale(${invincibleRemainingMs / RESPAWN_INVINCIBILITY_MS})`;
    invincibilityTimer.textContent = `${(invincibleRemainingMs / 1000).toFixed(1)}s`;
  } else {
    invincibilityShield.classList.remove("visible");
  }
}

const RADAR_RANGE = 60;
const RADAR_RADIUS_PX = radarCanvas.width / 2;
const RADAR_BLIP_RADIUS_PX = 5;
// Keep in sync with EnemyView's ACCENT_COLORS palette (the ninjas' sashes and headbands) so a
// given enemy reads as the same color here as it does in the world.
const RADAR_ENEMY_COLORS = ["#cc1a1a", "#d9800d", "#9926cc"];
// HUD blue for other players -- deliberately not the figure's shirt color, so a blip stays
// readable against the radar background.
const RADAR_PLAYER_COLOR = "#3380d9";

/**
 * Egocentric radar: player is always the centered, forward-facing marker, and enemy blips are
 * rotated into player-relative space (so "up" on the radar always means "in front of you"), with
 * out-of-range enemies clamped to the rim instead of hidden, so direction stays visible at any
 * distance.
 */
function updateRadar(): void {
  radarCtx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);

  const localPlayer = room.state.players.get(localSessionId);
  if (!localPlayer || localPlayer.isDead) return;

  const cx = radarCanvas.width / 2;
  const cy = radarCanvas.height / 2;
  const yaw = camera.rotation.y;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const pxPerUnit = (RADAR_RADIUS_PX - RADAR_BLIP_RADIUS_PX) / RADAR_RANGE;

  radarCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  radarCtx.lineWidth = 1;
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, RADAR_RADIUS_PX * 0.5, 0, Math.PI * 2);
  radarCtx.stroke();

  radarCtx.fillStyle = "#ffffff";
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy - 7);
  radarCtx.lineTo(cx - 5, cy + 5);
  radarCtx.lineTo(cx + 5, cy + 5);
  radarCtx.closePath();
  radarCtx.fill();

  // Maps a world position to radar pixel coords, rotated into player-relative space and clamped
  // to the rim so off-range blips still show direction instead of disappearing.
  const toRadarPx = (worldX: number, worldZ: number): { x: number; y: number } => {
    const dx = worldX - localPlayer.x;
    const dz = worldZ - localPlayer.z;
    const right = dx * cos - dz * sin;
    const forward = dx * sin + dz * cos;
    const dist = Math.sqrt(right * right + forward * forward);
    const clampScale = dist > RADAR_RANGE ? RADAR_RANGE / dist : 1;
    return { x: cx + right * clampScale * pxPerUnit, y: cy - forward * clampScale * pxPerUnit };
  };

  for (const [sessionId] of remotePlayers) {
    const player = room.state.players.get(sessionId);
    if (!player || player.isDead) continue;

    const { x, y } = toRadarPx(player.x, player.z);
    radarCtx.fillStyle = RADAR_PLAYER_COLOR;
    radarCtx.beginPath();
    radarCtx.arc(x, y, RADAR_BLIP_RADIUS_PX, 0, Math.PI * 2);
    radarCtx.fill();
  }

  for (const [enemyId] of enemyViews) {
    const enemy = room.state.enemies.get(enemyId);
    if (!enemy || enemy.broken) continue;

    const { x, y } = toRadarPx(enemy.x, enemy.z);
    const index = Number(enemyId.split("-").pop()) || 0;
    radarCtx.fillStyle = RADAR_ENEMY_COLORS[index % RADAR_ENEMY_COLORS.length];
    radarCtx.beginPath();
    radarCtx.arc(x, y, RADAR_BLIP_RADIUS_PX, 0, Math.PI * 2);
    radarCtx.fill();
  }
}

engine.runRenderLoop(() => {
  const deltaSeconds = engine.getDeltaTime() / 1000;
  updateNetworkedMovement(deltaSeconds);
  updateRemotePlayers(deltaSeconds);
  updateEnemies(deltaSeconds);
  updateHud();
  updateRadar();
  applyRecoil(deltaSeconds);
  // Held trigger: the weapon's own fire rate decides how many of these calls actually shoot.
  if (triggerDown && activeSlot === WeaponSlot.Minigun) fire();
  minigunView.update(deltaSeconds, triggerDown && activeSlot === WeaponSlot.Minigun);
  bulletTracer.update(deltaSeconds);
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

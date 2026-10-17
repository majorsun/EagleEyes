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
  ServerEvent,
  type PlayerInput,
  type KnifeStabEvent,
  type EnemyBrokenEvent,
  type EnemyRespawnedEvent,
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
  PLAYER_MAX_HEALTH,
  MOAT_WIDTH,
  isInPvpZone,
} from "@eagleeyes/shared";
import { createSniperViewModel } from "./weapons/SniperViewModel";
import { BulletTracer } from "./weapons/BulletTracer";
import { connectToRoom } from "./net/connection";
import { InputReconciler } from "./net/InputReconciler";
import { RemotePlayerView } from "./world/RemotePlayerView";
import { EnemyView } from "./world/EnemyView";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const crosshair = document.getElementById("crosshair") as HTMLDivElement;
const scopeOverlay = document.getElementById("scopeOverlay") as HTMLDivElement;
const healthBarFill = document.getElementById("healthBarFill") as HTMLDivElement;
const healthText = document.getElementById("healthText") as HTMLSpanElement;
const deathOverlay = document.getElementById("deathOverlay") as HTMLDivElement;
const deathSubtitle = document.getElementById("deathSubtitle") as HTMLDivElement;
const ammoCounter = document.getElementById("ammoCounter") as HTMLDivElement;
const pvpZoneIndicator = document.getElementById("pvpZoneIndicator") as HTMLDivElement;
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

  for (let i = 0; i < 6; i++) {
    const pos = randomAround(6, 32);
    const rocksInCluster = 2 + Math.floor(Math.random() * 3);
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

stateCallbacks(room.state).players.onAdd((player, sessionId) => {
  if (sessionId === localSessionId) return;
  remotePlayers.set(sessionId, new RemotePlayerView(scene, player.x, player.y, player.z, player.rotY));
});
stateCallbacks(room.state).players.onRemove((_player, sessionId) => {
  remotePlayers.get(sessionId)?.dispose();
  remotePlayers.delete(sessionId);
});

stateCallbacks(room.state).enemies.onAdd((enemy, enemyId) => {
  const view = new EnemyView(scene, enemy.x, enemy.y, enemy.z, enemy.rotY);
  enemyViews.set(enemyId, view);
  stateCallbacks(enemy).listen("health", (value, previous) => {
    if (value < previous) view.flashHit();
  });
});
stateCallbacks(room.state).enemies.onRemove((_enemy, enemyId) => {
  enemyViews.get(enemyId)?.dispose();
  enemyViews.delete(enemyId);
});
room.onMessage(ServerEvent.KnifeStab, (payload: KnifeStabEvent) => {
  enemyViews.get(payload.enemyId)?.stabKnife();
});
room.onMessage(ServerEvent.EnemyBroken, (payload: EnemyBrokenEvent) => {
  enemyViews.get(payload.enemyId)?.break(payload.x, payload.y, payload.z);
});
room.onMessage(ServerEvent.EnemyRespawned, (payload: EnemyRespawnedEvent) => {
  const enemy = room.state.enemies.get(payload.enemyId);
  if (enemy) enemyViews.get(payload.enemyId)?.respawn(enemy.x, enemy.y, enemy.z);
});

function updateEnemies(deltaSeconds: number): void {
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
  } else {
    reconciler.reconcile({ x: localPlayer.x, y: localPlayer.y, z: localPlayer.z }, localPlayer.lastProcessedSeq);
  }

  const input: PlayerInput = {
    moveX: (movementKeys.right ? 1 : 0) - (movementKeys.left ? 1 : 0),
    moveZ: (movementKeys.forward ? 1 : 0) - (movementKeys.back ? 1 : 0),
    yaw: camera.rotation.y,
  };
  const seq = reconciler.predict(input, deltaSeconds);
  camera.position.x = reconciler.state.x;
  camera.position.y = reconciler.state.y;
  camera.position.z = reconciler.state.z;

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
  reconciler.state = triggerJump(reconciler.state);
  room.send(ClientMessage.Jump);
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyC" || isLocalPlayerDead()) return;
  reconciler.state = triggerSlide(reconciler.state, camera.rotation.y);
  room.send(ClientMessage.Slide);
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyV" || isLocalPlayerDead()) return;
  reconciler.state = toggleProne(reconciler.state, terrain);
  room.send(ClientMessage.ToggleProne);
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyP" || isLocalPlayerDead()) return;
  reconciler.state = teleport(reconciler.state);
  room.send(ClientMessage.Teleport);
});

const sniper = createDefaultSniper();
const { root: weaponRoot, muzzle } = createSniperViewModel(scene, camera);
const bulletTracer = new BulletTracer(scene);

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
  if (isLocalPlayerDead() || !sniper.fire(performance.now())) return;
  const origin = muzzle.getAbsolutePosition();
  const aimRay = camera.getForwardRay(AIM_CONVERGENCE_DISTANCE);
  const aimPoint = aimRay.origin.add(aimRay.direction.scale(AIM_CONVERGENCE_DISTANCE));
  const direction = aimPoint.subtract(origin).normalize();
  room.send(ClientMessage.Fire, {
    originX: origin.x,
    originY: origin.y,
    originZ: origin.z,
    dirX: direction.x,
    dirY: direction.y,
    dirZ: direction.z,
  });
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("click", () => {
  if (!document.pointerLockElement) {
    canvas.requestPointerLock();
  }
});

canvas.addEventListener("pointerdown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) {
    fire();
  } else if (e.button === 2) {
    setScoped(sniper.toggleScope());
  }
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
  ammoCounter.textContent = `${localPlayer.ammo} / ${sniper.magazineSize}`;
  pvpZoneIndicator.classList.toggle("visible", isInPvpZone(localPlayer.z));
}

engine.runRenderLoop(() => {
  const deltaSeconds = engine.getDeltaTime() / 1000;
  updateNetworkedMovement(deltaSeconds);
  updateRemotePlayers(deltaSeconds);
  updateEnemies(deltaSeconds);
  updateHud();
  bulletTracer.update(deltaSeconds);
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

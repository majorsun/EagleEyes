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
import { createDefaultSniper } from "./weapons/Sniper";
import { createSniperViewModel } from "./weapons/SniperViewModel";
import { BulletSystem } from "./weapons/BulletSystem";
import { Target } from "./world/Target";
import { PlayerHealth } from "./world/PlayerHealth";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const crosshair = document.getElementById("crosshair") as HTMLDivElement;
const scopeOverlay = document.getElementById("scopeOverlay") as HTMLDivElement;
const healthBarFill = document.getElementById("healthBarFill") as HTMLDivElement;
const healthText = document.getElementById("healthText") as HTMLSpanElement;
const deathOverlay = document.getElementById("deathOverlay") as HTMLDivElement;
const deathSubtitle = document.getElementById("deathSubtitle") as HTMLDivElement;
const ammoCounter = document.getElementById("ammoCounter") as HTMLDivElement;
const engine = new Engine(canvas, true);

function createScene(): Scene {
  const scene = new Scene(engine);

  const camera = new UniversalCamera("fpsCamera", new Vector3(0, 1.8, -10), scene);
  camera.setTarget(Vector3.Zero());
  camera.attachControl(canvas, true);
  camera.applyGravity = true;
  camera.checkCollisions = true;
  camera.ellipsoid = new Vector3(0.5, 0.9, 0.5);
  camera.minZ = 0.1;
  camera.speed = 0.3;
  camera.angularSensibility = 4000;
  camera.keysUp.push(87); // W
  camera.keysDown.push(83); // S
  camera.keysLeft.push(65); // A
  camera.keysRight.push(68); // D

  scene.gravity = new Vector3(0, -0.9, 0);
  scene.collisionsEnabled = true;

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

  const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
  const groundMat = new GridMaterial("groundGrid", scene);
  groundMat.majorUnitFrequency = 5;
  groundMat.minorUnitVisibility = 0.35;
  groundMat.gridRatio = 1;
  groundMat.mainColor = new Color3(0.76, 0.62, 0.42);
  groundMat.lineColor = new Color3(0.55, 0.42, 0.25);
  ground.material = groundMat;
  ground.checkCollisions = true;

  // Spawn platform: a visible landmark marking where the player respawns.
  const spawnPlatform = MeshBuilder.CreateCylinder(
    "spawnPlatform",
    { diameter: 4, height: 0.12, tessellation: 24 },
    scene,
  );
  spawnPlatform.position = new Vector3(0, 0.06, -10);
  const platformMat = new StandardMaterial("spawnPlatformMat", scene);
  platformMat.diffuseColor = new Color3(0.35, 0.4, 0.45);
  platformMat.specularColor = new Color3(0.3, 0.3, 0.3);
  spawnPlatform.material = platformMat;

  const platformRim = MeshBuilder.CreateTorus(
    "spawnPlatformRim",
    { diameter: 4, thickness: 0.08, tessellation: 32 },
    scene,
  );
  platformRim.position = new Vector3(0, 0.1, -10);
  const rimMat = new StandardMaterial("spawnPlatformRimMat", scene);
  rimMat.diffuseColor = new Color3(0.2, 0.6, 0.9);
  rimMat.emissiveColor = new Color3(0.1, 0.35, 0.5);
  platformRim.material = rimMat;

  return scene;
}

const scene = createScene();
const camera = scene.activeCamera as UniversalCamera;
const baseFov = camera.fov;
const baseAngularSensibility = camera.angularSensibility;
const groundEyeHeight = camera.position.y;
const spawnPosition = camera.position.clone();

const sniper = createDefaultSniper();
const { root: weaponRoot, muzzle } = createSniperViewModel(scene, camera);
const bulletSystem = new BulletSystem(scene);
const playerHealth = new PlayerHealth(100);
const ENEMY_COUNT = 3;
const targets = Array.from(
  { length: ENEMY_COUNT },
  () =>
    new Target(scene, {
      maxHealth: 100,
      respawnDelayMs: 3000,
      getPlayerPosition: () => camera.position,
      playerTarget: playerHealth,
    }),
);

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

function fire(): void {
  if (!sniper.fire(performance.now())) return;
  const origin = muzzle.getAbsolutePosition();
  const aimRay = camera.getForwardRay(AIM_CONVERGENCE_DISTANCE);
  const aimPoint = aimRay.origin.add(aimRay.direction.scale(AIM_CONVERGENCE_DISTANCE));
  const direction = aimPoint.subtract(origin).normalize();
  bulletSystem.spawn(origin, direction, sniper.damage, sniper.name);
  ammoCounter.textContent = `${sniper.currentAmmo} / ${sniper.magazineSize}`;
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

const JUMP_SPEED = 6;
const GRAVITY_ACCEL = -18;
let verticalVelocity = 0;
let isJumping = false;

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (isJumping) return;
  isJumping = true;
  verticalVelocity = JUMP_SPEED;
  camera.applyGravity = false;
});

function updateJump(deltaSeconds: number): void {
  if (!isJumping) return;
  verticalVelocity += GRAVITY_ACCEL * deltaSeconds;
  camera.position.y += verticalVelocity * deltaSeconds;
  if (camera.position.y <= groundEyeHeight) {
    camera.position.y = groundEyeHeight;
    isJumping = false;
    verticalVelocity = 0;
    camera.applyGravity = true;
  }
}

const SLIDE_DISTANCE = 5;
const SLIDE_SPEED = 10;
let isSliding = false;
let slideDirection = Vector3.Zero();
let slideDistanceRemaining = 0;

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyC" || isSliding) return;
  isSliding = true;
  slideDistanceRemaining = SLIDE_DISTANCE;
  const forward = camera.getDirection(Vector3.Forward());
  forward.y = 0;
  slideDirection = forward.normalize();
});

function updateSlide(deltaSeconds: number): void {
  if (!isSliding) return;
  const step = Math.min(SLIDE_SPEED * deltaSeconds, slideDistanceRemaining);
  camera.cameraDirection.addInPlace(slideDirection.scale(step));
  slideDistanceRemaining -= step;
  if (slideDistanceRemaining <= 0) isSliding = false;
}

const RESPAWN_DELAY_MS = 2500;
let isPlayerDead = false;
let respawnAt = 0;

function updatePlayerDeath(): void {
  if (playerHealth.isDead && !isPlayerDead) {
    isPlayerDead = true;
    respawnAt = performance.now() + RESPAWN_DELAY_MS;
    deathOverlay.classList.add("visible");
  }
  if (!isPlayerDead) return;

  const remainingMs = Math.max(0, respawnAt - performance.now());
  deathSubtitle.textContent = `Respawning in ${Math.ceil(remainingMs / 1000)}s`;

  if (remainingMs <= 0) {
    isPlayerDead = false;
    playerHealth.reset();
    camera.position.copyFrom(spawnPosition);
    deathOverlay.classList.remove("visible");
  }
}

function updateHealthUI(): void {
  const pct = (playerHealth.current / playerHealth.max) * 100;
  healthBarFill.style.width = `${pct}%`;
  healthText.textContent = `${Math.ceil(playerHealth.current)} / ${playerHealth.max}`;
}

engine.runRenderLoop(() => {
  const deltaSeconds = engine.getDeltaTime() / 1000;
  updateJump(deltaSeconds);
  updateSlide(deltaSeconds);
  for (const target of targets) target.update(deltaSeconds);
  updatePlayerDeath();
  updateHealthUI();
  bulletSystem.update(deltaSeconds);
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

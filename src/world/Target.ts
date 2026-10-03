import { Scene, Mesh, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { Damageable } from "./Damageable";

export interface SpawnArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TargetOptions {
  maxHealth?: number;
  respawnDelayMs?: number;
  spawnArea?: SpawnArea;
  /** Y position of the target's center, i.e. half its height above the ground. */
  groundY?: number;
  /** Returns the current player position each frame, used to chase and aim attacks. */
  getPlayerPosition: () => Vector3;
  /** Receives attack damage once the target closes within attackRange. */
  playerTarget: Damageable;
  chaseSpeed?: number;
  attackRange?: number;
  attackDamage?: number;
  attackIntervalMs?: number;
}

const INTACT_COLOR = new Color3(0.8, 0.1, 0.1);
const DEBRIS_COLOR = new Color3(0.25, 0.22, 0.2);
const DEFAULT_SPAWN_AREA: SpawnArea = { minX: -15, maxX: 15, minZ: -5, maxZ: 20 };

/** A practice target that reacts to bullet hits, breaks into debris at 0 health, then respawns at a random spot. */
export class Target implements Damageable {
  readonly mesh: Mesh;
  private health: number;
  private readonly maxHealth: number;
  private readonly respawnDelayMs: number;
  private readonly spawnArea: SpawnArea;
  private readonly groundY: number;
  private readonly bodyMat: StandardMaterial;
  private readonly debrisMat: StandardMaterial;
  private readonly getPlayerPosition: () => Vector3;
  private readonly playerTarget: Damageable;
  private readonly chaseSpeed: number;
  private readonly attackRange: number;
  private readonly attackDamage: number;
  private readonly attackIntervalMs: number;
  private lastAttackTime = 0;
  private broken = false;
  private flashResetTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly knife: TransformNode;
  private readonly knifeRestRotation: Vector3;
  private stabResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly scene: Scene, options: TargetOptions) {
    this.maxHealth = options.maxHealth ?? 100;
    this.health = this.maxHealth;
    this.respawnDelayMs = options.respawnDelayMs ?? 3000;
    this.spawnArea = options.spawnArea ?? DEFAULT_SPAWN_AREA;
    this.groundY = options.groundY ?? 0.8;
    this.getPlayerPosition = options.getPlayerPosition;
    this.playerTarget = options.playerTarget;
    this.chaseSpeed = options.chaseSpeed ?? 3;
    this.attackRange = options.attackRange ?? 2.2;
    this.attackDamage = options.attackDamage ?? 10;
    this.attackIntervalMs = options.attackIntervalMs ?? 700;

    this.bodyMat = new StandardMaterial("targetBodyMat", scene);
    this.bodyMat.diffuseColor = INTACT_COLOR.clone();

    this.debrisMat = new StandardMaterial("targetDebrisMat", scene);
    this.debrisMat.diffuseColor = DEBRIS_COLOR.clone();

    this.mesh = MeshBuilder.CreateBox("target", { width: 1, height: 1.6, depth: 0.2 }, scene);
    this.mesh.position = this.randomSpawnPosition();
    this.mesh.checkCollisions = true;
    this.mesh.material = this.bodyMat;
    this.mesh.metadata = { damageable: this };

    this.knife = this.createKnife();
    this.knifeRestRotation = this.knife.rotation.clone();
  }

  private createKnife(): TransformNode {
    const knife = new TransformNode("knife", this.scene);
    knife.parent = this.mesh;
    knife.position = new Vector3(0.62, 0.1, 0.15);
    knife.rotation = new Vector3(0, 0, -Math.PI / 2.4);

    const bladeMat = new StandardMaterial("knifeBladeMat", this.scene);
    bladeMat.diffuseColor = new Color3(0.75, 0.78, 0.8);
    bladeMat.specularColor = new Color3(0.9, 0.9, 0.9);
    bladeMat.specularPower = 64;

    const hiltMat = new StandardMaterial("knifeHiltMat", this.scene);
    hiltMat.diffuseColor = new Color3(0.1, 0.08, 0.06);
    hiltMat.specularColor = new Color3(0, 0, 0);

    const blade = MeshBuilder.CreateBox("knifeBlade", { width: 0.04, height: 0.32, depth: 0.012 }, this.scene);
    blade.material = bladeMat;
    blade.position = new Vector3(0, 0.24, 0);
    blade.parent = knife;
    blade.isPickable = false;

    const tip = MeshBuilder.CreateCylinder("knifeTip", { diameterTop: 0, diameterBottom: 0.04, height: 0.06, tessellation: 8 }, this.scene);
    tip.material = bladeMat;
    tip.position = new Vector3(0, 0.43, 0);
    tip.parent = knife;
    tip.isPickable = false;

    const hilt = MeshBuilder.CreateCylinder("knifeHilt", { diameter: 0.05, height: 0.16, tessellation: 10 }, this.scene);
    hilt.material = hiltMat;
    hilt.position = new Vector3(0, 0, 0);
    hilt.parent = knife;
    hilt.isPickable = false;

    return knife;
  }

  private randomSpawnPosition(): Vector3 {
    const { minX, maxX, minZ, maxZ } = this.spawnArea;
    const x = minX + Math.random() * (maxX - minX);
    const z = minZ + Math.random() * (maxZ - minZ);
    return new Vector3(x, this.groundY, z);
  }

  /** Chases the player when alive and out of range, otherwise attacks on a cooldown. */
  update(deltaSeconds: number): void {
    if (this.broken) return;

    const toPlayer = this.getPlayerPosition().subtract(this.mesh.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    if (distance < 1e-4) return;

    const direction = toPlayer.scale(1 / distance);

    if (distance > this.attackRange) {
      this.mesh.moveWithCollisions(direction.scale(this.chaseSpeed * deltaSeconds));
      this.mesh.rotation.y = Math.atan2(direction.x, direction.z);
      return;
    }

    const now = performance.now();
    if (now - this.lastAttackTime >= this.attackIntervalMs) {
      this.lastAttackTime = now;
      this.playerTarget.takeDamage(this.attackDamage);
      this.stabKnife();
    }
  }

  private stabKnife(): void {
    this.knife.rotation.x = this.knifeRestRotation.x - 1.1;
    if (this.stabResetTimer) clearTimeout(this.stabResetTimer);
    this.stabResetTimer = setTimeout(() => {
      this.knife.rotation.copyFrom(this.knifeRestRotation);
    }, 150);
  }

  takeDamage(amount: number): void {
    if (this.broken) return;

    this.health -= amount;
    this.flashHit();

    if (this.health <= 0) {
      this.break();
    }
  }

  private flashHit(): void {
    this.bodyMat.diffuseColor = Color3.White();
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    this.flashResetTimer = setTimeout(() => {
      if (!this.broken) this.bodyMat.diffuseColor = INTACT_COLOR.clone();
    }, 80);
  }

  private break(): void {
    this.broken = true;
    const breakPosition = this.mesh.position.clone();
    this.mesh.setEnabled(false);
    this.spawnDebris(breakPosition);
    setTimeout(() => this.regenerate(), this.respawnDelayMs);
  }

  private spawnDebris(origin: Vector3): void {
    const engine = this.scene.getEngine();
    const chunkCount = 8;

    for (let i = 0; i < chunkCount; i++) {
      const chunk = MeshBuilder.CreateBox(
        `targetDebris${i}`,
        { size: 0.12 + Math.random() * 0.18 },
        this.scene,
      );
      chunk.material = this.debrisMat;
      chunk.isPickable = false;
      chunk.position = origin.add(
        new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.3),
      );

      const velocity = new Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1.5, (Math.random() - 0.5) * 4);
      const spin = new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const bornAt = performance.now();

      const observer = this.scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000;
        velocity.y -= 9.8 * dt;
        chunk.position.addInPlace(velocity.scale(dt));
        chunk.rotation.x += spin.x * dt;
        chunk.rotation.y += spin.y * dt;
        chunk.rotation.z += spin.z * dt;

        if (performance.now() - bornAt > 1200) {
          this.scene.onBeforeRenderObservable.remove(observer);
          chunk.dispose();
        }
      });
    }
  }

  private regenerate(): void {
    this.health = this.maxHealth;
    this.broken = false;
    this.mesh.position = this.randomSpawnPosition();
    this.mesh.scaling.set(1, 1, 1);
    this.bodyMat.diffuseColor = INTACT_COLOR.clone();
    this.mesh.setEnabled(true);
  }
}

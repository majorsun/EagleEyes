import { Scene, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { spawnDebris } from "./debris";

const LERP_RATE = 12;
const CRUMBLE_DURATION = 0.4;
const CRUMBLE_SINK_SPEED = 1.5;

// Generic special-operations palette (coyote-tan fatigues, black plate carrier, dark helmet) --
// an original color/silhouette combo, not a reproduction of any specific licensed character.
const UNIFORM_COLOR = new Color3(0.42, 0.35, 0.25);
const VEST_COLOR = new Color3(0.07, 0.07, 0.07);
const HELMET_COLOR = new Color3(0.08, 0.1, 0.07);
const SKIN_COLOR = new Color3(0.74, 0.58, 0.46);
const WEAPON_COLOR = new Color3(0.09, 0.09, 0.1);
const BOOT_COLOR = new Color3(0.05, 0.05, 0.05);

/**
 * Placeholder visual for a remote player: a blocky low-poly humanoid (legs/torso/arms/head) in
 * tactical gear, standing in for the capsule that used to represent other players. The root is a
 * bare TransformNode -- every body part is parented to it, so position/rotation/scale lerps (and
 * the death crumble) apply to the whole figure for free with no extra per-part frame work.
 */
export class RemotePlayerView {
  readonly root: TransformNode;
  private readonly debrisMat: StandardMaterial;
  private targetX: number;
  private targetY: number;
  private targetZ: number;
  private targetRotY: number;
  private isDeadState = false;
  private crumbleElapsed = 0;

  constructor(
    private readonly scene: Scene,
    x: number,
    y: number,
    z: number,
    rotY: number,
  ) {
    this.root = new TransformNode("remotePlayerRoot", scene);
    this.root.position = new Vector3(x, y, z);
    this.root.rotation.y = rotY;

    this.debrisMat = new StandardMaterial("remotePlayerDebrisMat", scene);
    this.debrisMat.diffuseColor = new Color3(0.1, 0.1, 0.08);

    this.buildBody();

    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  /**
   * Builds the figure out of simple primitives sized against the same 1.8-tall, feet-at-root
   * silhouette the old capsule used (the actual hit detection is an independent server-side
   * capsule keyed off player x/y/z, so this is purely cosmetic and free to look however).
   */
  private buildBody(): void {
    const uniformMat = new StandardMaterial("remotePlayerUniformMat", this.scene);
    uniformMat.diffuseColor = UNIFORM_COLOR.clone();

    const vestMat = new StandardMaterial("remotePlayerVestMat", this.scene);
    vestMat.diffuseColor = VEST_COLOR.clone();

    const bootMat = new StandardMaterial("remotePlayerBootMat", this.scene);
    bootMat.diffuseColor = BOOT_COLOR.clone();

    const skinMat = new StandardMaterial("remotePlayerSkinMat", this.scene);
    skinMat.diffuseColor = SKIN_COLOR.clone();

    const helmetMat = new StandardMaterial("remotePlayerHelmetMat", this.scene);
    helmetMat.diffuseColor = HELMET_COLOR.clone();
    helmetMat.specularColor = new Color3(0.15, 0.15, 0.15);

    const part = (mesh: ReturnType<typeof MeshBuilder.CreateBox>, material: StandardMaterial, position: Vector3) => {
      mesh.material = material;
      mesh.position = position;
      mesh.parent = this.root;
      mesh.isPickable = false;
      return mesh;
    };

    // Legs: boots at the very bottom, pants above, hips at y=-0.1 so the root's feet sit at -0.9.
    for (const side of [-1, 1]) {
      part(
        MeshBuilder.CreateBox("remotePlayerLeg", { width: 0.17, height: 0.62, depth: 0.19 }, this.scene),
        uniformMat,
        new Vector3(side * 0.11, -0.52, 0),
      );
      part(
        MeshBuilder.CreateBox("remotePlayerBoot", { width: 0.18, height: 0.16, depth: 0.24 }, this.scene),
        bootMat,
        new Vector3(side * 0.11, -0.88, 0.02),
      );
    }

    // Torso + chest rig, hips to shoulders.
    const torso = part(
      MeshBuilder.CreateBox("remotePlayerTorso", { width: 0.46, height: 0.56, depth: 0.26 }, this.scene),
      uniformMat,
      new Vector3(0, 0.18, 0),
    );
    part(
      MeshBuilder.CreateBox("remotePlayerVest", { width: 0.5, height: 0.42, depth: 0.1 }, this.scene),
      vestMat,
      new Vector3(0, 0.26, 0.17),
    );
    torso.isPickable = false;

    // Arms, shoulders to roughly waist height.
    for (const side of [-1, 1]) {
      part(
        MeshBuilder.CreateBox("remotePlayerArm", { width: 0.14, height: 0.5, depth: 0.14 }, this.scene),
        uniformMat,
        new Vector3(side * 0.3, 0.17, 0.02),
      );
    }

    // Head + a simple dark visor/mask band standing in for facial detail at this low poly count.
    part(
      MeshBuilder.CreateBox("remotePlayerHead", { width: 0.26, height: 0.28, depth: 0.26 }, this.scene),
      skinMat,
      new Vector3(0, 0.62, 0),
    );
    part(
      MeshBuilder.CreateBox("remotePlayerVisor", { width: 0.27, height: 0.07, depth: 0.1 }, this.scene),
      vestMat,
      new Vector3(0, 0.64, 0.12),
    );

    const helmet = MeshBuilder.CreateSphere("remotePlayerHelmet", { diameter: 0.34, segments: 12 }, this.scene);
    helmet.material = helmetMat;
    helmet.position = new Vector3(0, 0.78, -0.01);
    helmet.scaling.set(1, 0.8, 1.05);
    helmet.parent = this.root;
    helmet.isPickable = false;

    this.buildWeapon();
  }

  private buildWeapon(): void {
    const weaponMat = new StandardMaterial("remotePlayerWeaponMat", this.scene);
    weaponMat.diffuseColor = WEAPON_COLOR.clone();
    weaponMat.specularColor = new Color3(0.3, 0.3, 0.35);

    const weapon = new TransformNode("remotePlayerWeapon", this.scene);
    weapon.parent = this.root;
    weapon.position = new Vector3(0.22, 0.12, 0.16);
    weapon.rotation = new Vector3(0, -0.35, 0.1);

    const weaponBody = MeshBuilder.CreateBox("remotePlayerWeaponBody", { width: 0.07, height: 0.08, depth: 0.5 }, this.scene);
    weaponBody.material = weaponMat;
    weaponBody.parent = weapon;
    weaponBody.isPickable = false;

    const weaponBarrel = MeshBuilder.CreateCylinder(
      "remotePlayerWeaponBarrel",
      { diameter: 0.03, height: 0.35, tessellation: 10 },
      this.scene,
    );
    weaponBarrel.material = weaponMat;
    weaponBarrel.rotation.x = Math.PI / 2;
    weaponBarrel.position.z = 0.42;
    weaponBarrel.parent = weapon;
    weaponBarrel.isPickable = false;

    const weaponMag = MeshBuilder.CreateBox("remotePlayerWeaponMag", { width: 0.03, height: 0.18, depth: 0.06 }, this.scene);
    weaponMag.material = weaponMat;
    weaponMag.position = new Vector3(0, -0.12, 0.1);
    weaponMag.rotation.x = -0.25;
    weaponMag.parent = weapon;
    weaponMag.isPickable = false;

    const weaponStock = MeshBuilder.CreateBox("remotePlayerWeaponStock", { width: 0.05, height: 0.07, depth: 0.22 }, this.scene);
    weaponStock.material = weaponMat;
    weaponStock.position.z = -0.32;
    weaponStock.parent = weapon;
    weaponStock.isPickable = false;
  }

  setTarget(x: number, y: number, z: number, rotY: number): void {
    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  /** Call every frame with the server's current isDead flag; triggers crumble/reset on edges. */
  updateDeathState(isDead: boolean, x: number, y: number, z: number, rotY: number): void {
    if (isDead && !this.isDeadState) {
      this.crumble();
    } else if (!isDead && this.isDeadState) {
      this.reset(x, y, z, rotY);
    }
  }

  private crumble(): void {
    this.isDeadState = true;
    this.crumbleElapsed = 0;
    spawnDebris(this.scene, this.root.position.clone(), this.debrisMat, "playerDebris", 10);
  }

  private reset(x: number, y: number, z: number, rotY: number): void {
    this.isDeadState = false;
    this.root.scaling.set(1, 1, 1);
    this.root.position.set(x, y, z);
    this.root.rotation.y = rotY;
    this.root.setEnabled(true);
    this.setTarget(x, y, z, rotY);
  }

  update(deltaSeconds: number): void {
    if (this.isDeadState) {
      // Shrink and sink into the ground over CRUMBLE_DURATION, then hide -- the spawned
      // debris chunks (from crumble()) carry the rest of the visual weight after that.
      this.crumbleElapsed += deltaSeconds;
      const scale = Math.max(0, 1 - this.crumbleElapsed / CRUMBLE_DURATION);
      this.root.scaling.set(scale, scale, scale);
      this.root.position.y -= deltaSeconds * CRUMBLE_SINK_SPEED;
      if (scale <= 0) this.root.setEnabled(false);
      return;
    }

    const t = Math.min(1, deltaSeconds * LERP_RATE);
    this.root.position.x += (this.targetX - this.root.position.x) * t;
    this.root.position.y += (this.targetY - this.root.position.y) * t;
    this.root.position.z += (this.targetZ - this.root.position.z) * t;
    this.root.rotation.y += (this.targetRotY - this.root.rotation.y) * t;
  }

  dispose(): void {
    this.root.dispose();
  }
}

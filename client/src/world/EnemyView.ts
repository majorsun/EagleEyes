import { Scene, Mesh, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { spawnDebris } from "./debris";

const INTACT_COLOR = new Color3(0.8, 0.1, 0.1);
const DEBRIS_COLOR = new Color3(0.25, 0.22, 0.2);
const LERP_RATE = 12;

/**
 * Purely reactive visual for a server-driven enemy: no AI, no health authority, just renders
 * whatever EnemyState says and plays the matching reaction (stab/break/respawn) on broadcast events.
 */
export class EnemyView {
  readonly mesh: Mesh;
  private readonly bodyMat: StandardMaterial;
  private readonly debrisMat: StandardMaterial;
  private readonly knife: TransformNode;
  private readonly knifeRestRotation: Vector3;
  private flashResetTimer: ReturnType<typeof setTimeout> | null = null;
  private stabResetTimer: ReturnType<typeof setTimeout> | null = null;

  private targetX: number;
  private targetY: number;
  private targetZ: number;
  private targetRotY: number;

  constructor(
    private readonly scene: Scene,
    x: number,
    y: number,
    z: number,
    rotY: number,
  ) {
    this.bodyMat = new StandardMaterial("enemyBodyMat", scene);
    this.bodyMat.diffuseColor = INTACT_COLOR.clone();

    this.debrisMat = new StandardMaterial("enemyDebrisMat", scene);
    this.debrisMat.diffuseColor = DEBRIS_COLOR.clone();

    this.mesh = MeshBuilder.CreateBox("enemy", { width: 1, height: 1.6, depth: 0.2 }, scene);
    this.mesh.position = new Vector3(x, y, z);
    this.mesh.rotation.y = rotY;
    this.mesh.material = this.bodyMat;

    this.knife = this.createKnife();
    this.knifeRestRotation = this.knife.rotation.clone();

    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
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

    const tip = MeshBuilder.CreateCylinder(
      "knifeTip",
      { diameterTop: 0, diameterBottom: 0.04, height: 0.06, tessellation: 8 },
      this.scene,
    );
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

  setTarget(x: number, y: number, z: number, rotY: number): void {
    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  update(deltaSeconds: number): void {
    const t = Math.min(1, deltaSeconds * LERP_RATE);
    this.mesh.position.x += (this.targetX - this.mesh.position.x) * t;
    this.mesh.position.y += (this.targetY - this.mesh.position.y) * t;
    this.mesh.position.z += (this.targetZ - this.mesh.position.z) * t;
    this.mesh.rotation.y += (this.targetRotY - this.mesh.rotation.y) * t;
  }

  flashHit(): void {
    this.bodyMat.diffuseColor = Color3.White();
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    this.flashResetTimer = setTimeout(() => {
      this.bodyMat.diffuseColor = INTACT_COLOR.clone();
    }, 80);
  }

  stabKnife(): void {
    this.knife.rotation.x = this.knifeRestRotation.x - 1.1;
    if (this.stabResetTimer) clearTimeout(this.stabResetTimer);
    this.stabResetTimer = setTimeout(() => {
      this.knife.rotation.copyFrom(this.knifeRestRotation);
    }, 150);
  }

  break(x: number, y: number, z: number): void {
    this.mesh.setEnabled(false);
    spawnDebris(this.scene, new Vector3(x, y, z), this.debrisMat, "enemyDebris");
  }

  respawn(x: number, y: number, z: number): void {
    this.bodyMat.diffuseColor = INTACT_COLOR.clone();
    this.mesh.position.set(x, y, z);
    this.setTarget(x, y, z, 0);
    this.mesh.setEnabled(true);
  }

  dispose(): void {
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    if (this.stabResetTimer) clearTimeout(this.stabResetTimer);
    this.mesh.dispose();
  }
}

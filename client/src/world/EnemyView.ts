import { Scene, Mesh, TransformNode, MeshBuilder, StandardMaterial, DynamicTexture, Color3, Vector3 } from "@babylonjs/core";
import { spawnDebris } from "./debris";

// Distinct per-enemy body colors so overlapping/distant silhouettes don't blend into one blob.
const BODY_COLORS = [new Color3(0.8, 0.1, 0.1), new Color3(0.85, 0.5, 0.05), new Color3(0.6, 0.15, 0.8)];
const DEBRIS_COLOR = new Color3(0.25, 0.22, 0.2);
const LERP_RATE = 12;

const MARKER_Y_OFFSET = 1.3;
/** Scales the marker plane by (distance to camera * this) each frame so its on-screen size stays
 * roughly constant instead of shrinking into an unreadable speck at range. */
const MARKER_DISTANCE_SCALE = 0.045;

/**
 * Purely reactive visual for a server-driven enemy: no AI, no health authority, just renders
 * whatever EnemyState says and plays the matching reaction (stab/break/respawn) on broadcast events.
 */
export class EnemyView {
  readonly mesh: Mesh;
  private readonly intactColor: Color3;
  private readonly bodyMat: StandardMaterial;
  private readonly debrisMat: StandardMaterial;
  private readonly knife: TransformNode;
  private readonly knifeRestRotation: Vector3;
  private readonly marker: Mesh;
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
    label: string,
    colorIndex: number,
  ) {
    this.intactColor = BODY_COLORS[colorIndex % BODY_COLORS.length];

    this.bodyMat = new StandardMaterial("enemyBodyMat", scene);
    this.bodyMat.diffuseColor = this.intactColor.clone();

    this.debrisMat = new StandardMaterial("enemyDebrisMat", scene);
    this.debrisMat.diffuseColor = DEBRIS_COLOR.clone();

    this.mesh = MeshBuilder.CreateBox("enemy", { width: 1, height: 1.6, depth: 0.2 }, scene);
    this.mesh.position = new Vector3(x, y, z);
    this.mesh.rotation.y = rotY;
    this.mesh.material = this.bodyMat;

    this.knife = this.createKnife();
    this.knifeRestRotation = this.knife.rotation.clone();

    this.marker = this.createMarker(label);
    this.marker.position = new Vector3(x, y + MARKER_Y_OFFSET, z);

    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  /**
   * A billboarded, distance-scaled number tag above the enemy's head. Unlike the body mesh (which
   * can read as a thin sliver edge-on, or blend into neighbors at range), this always faces the
   * camera and keeps a roughly constant on-screen size, so enemy count stays readable from any
   * distance or angle.
   */
  private createMarker(label: string): Mesh {
    const texture = new DynamicTexture(`enemyMarkerTex-${label}`, { width: 128, height: 128 }, this.scene, true);
    texture.hasAlpha = true;
    texture.drawText(label, null, null, "bold 88px sans-serif", "#ffffff", "transparent", true);

    const material = new StandardMaterial("enemyMarkerMat", this.scene);
    material.diffuseTexture = texture;
    material.emissiveColor = Color3.White();
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;

    const marker = MeshBuilder.CreatePlane("enemyMarker", { size: 1 }, this.scene);
    marker.material = material;
    marker.billboardMode = Mesh.BILLBOARDMODE_ALL;
    marker.isPickable = false;
    return marker;
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

    this.marker.position.x = this.mesh.position.x;
    this.marker.position.y = this.mesh.position.y + MARKER_Y_OFFSET;
    this.marker.position.z = this.mesh.position.z;

    const camera = this.scene.activeCamera;
    if (camera) {
      const distance = Vector3.Distance(camera.globalPosition, this.marker.position);
      const scale = distance * MARKER_DISTANCE_SCALE;
      this.marker.scaling.set(scale, scale, scale);
    }
  }

  flashHit(): void {
    this.bodyMat.diffuseColor = Color3.White();
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    this.flashResetTimer = setTimeout(() => {
      this.bodyMat.diffuseColor = this.intactColor.clone();
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
    this.marker.setEnabled(false);
    spawnDebris(this.scene, new Vector3(x, y, z), this.debrisMat, "enemyDebris");
  }

  respawn(x: number, y: number, z: number): void {
    this.bodyMat.diffuseColor = this.intactColor.clone();
    this.mesh.position.set(x, y, z);
    this.marker.position.set(x, y + MARKER_Y_OFFSET, z);
    this.marker.setEnabled(true);
    this.setTarget(x, y, z, 0);
    this.mesh.setEnabled(true);
  }

  dispose(): void {
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    if (this.stabResetTimer) clearTimeout(this.stabResetTimer);
    this.marker.material?.dispose(false, true);
    this.marker.dispose();
    this.mesh.dispose();
  }
}

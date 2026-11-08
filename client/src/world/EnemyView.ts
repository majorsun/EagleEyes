import { Scene, Mesh, TransformNode, MeshBuilder, StandardMaterial, DynamicTexture, Color3, Vector3 } from "@babylonjs/core";
import { spawnDebris } from "./debris";

// Each ninja wears the same near-black shozoku; the per-enemy color lives in the sash, hood trim
// and eye band instead, so overlapping or distant silhouettes stay tellable apart without three
// differently colored people running around.
const ACCENT_COLORS = [new Color3(0.8, 0.1, 0.1), new Color3(0.85, 0.5, 0.05), new Color3(0.6, 0.15, 0.8)];
const CLOTH_COLOR = new Color3(0.09, 0.1, 0.13);
const CLOTH_DARK_COLOR = new Color3(0.05, 0.055, 0.07);
const SKIN_COLOR = new Color3(0.72, 0.56, 0.44);
const STEEL_COLOR = new Color3(0.75, 0.78, 0.8);
const DEBRIS_COLOR = new Color3(0.25, 0.22, 0.2);
const LERP_RATE = 12;

const MARKER_Y_OFFSET = 1.3;
/** Scales the marker plane by (distance to camera * this) each frame so its on-screen size stays
 * roughly constant instead of shrinking into an unreadable speck at range. */
const MARKER_DISTANCE_SCALE = 0.045;

/**
 * Purely reactive visual for a server-driven enemy: no AI, no health authority, just renders
 * whatever EnemyState says and plays the matching reaction (stab/break/respawn) on broadcast
 * events. The figure is built around the enemy's own origin, which the server places at the
 * body's centre, so the feet sit at -0.8 and the hood tops out near +0.8.
 */
export class EnemyView {
  readonly root: TransformNode;
  private readonly intactColor: Color3;
  private readonly clothMat: StandardMaterial;
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
    this.intactColor = CLOTH_COLOR;
    const accent = ACCENT_COLORS[colorIndex % ACCENT_COLORS.length];

    this.root = new TransformNode("enemy", scene);
    this.root.position = new Vector3(x, y, z);
    this.root.rotation.y = rotY;

    this.clothMat = new StandardMaterial("enemyClothMat", scene);
    this.clothMat.diffuseColor = CLOTH_COLOR.clone();
    this.clothMat.specularColor = new Color3(0.04, 0.04, 0.05);

    this.debrisMat = new StandardMaterial("enemyDebrisMat", scene);
    this.debrisMat.diffuseColor = DEBRIS_COLOR.clone();

    this.buildNinja(accent);
    this.knife = this.createKnife();
    this.knifeRestRotation = this.knife.rotation.clone();

    this.marker = this.createMarker(label, accent);
    this.marker.position = new Vector3(x, y + MARKER_Y_OFFSET, z);

    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  /** Blocky shinobi: black shozoku, colored sash, wrapped hood with an exposed eye band. */
  private buildNinja(accent: Color3): void {
    const darkMat = new StandardMaterial("enemyClothDarkMat", this.scene);
    darkMat.diffuseColor = CLOTH_DARK_COLOR.clone();
    darkMat.specularColor = new Color3(0.03, 0.03, 0.04);

    const accentMat = new StandardMaterial("enemyAccentMat", this.scene);
    accentMat.diffuseColor = accent.clone();
    accentMat.specularColor = new Color3(0.08, 0.08, 0.08);

    const skinMat = new StandardMaterial("enemySkinMat", this.scene);
    skinMat.diffuseColor = SKIN_COLOR.clone();

    const steelMat = new StandardMaterial("enemySteelMat", this.scene);
    steelMat.diffuseColor = STEEL_COLOR.clone();
    steelMat.specularColor = new Color3(0.9, 0.9, 0.9);
    steelMat.specularPower = 64;

    const part = (mesh: Mesh, material: StandardMaterial, position: Vector3) => {
      mesh.material = material;
      mesh.position = position;
      mesh.parent = this.root;
      mesh.isPickable = false;
      return mesh;
    };

    // Legs and split-toe tabi boots.
    for (const side of [-1, 1]) {
      part(
        MeshBuilder.CreateBox("enemyLeg", { width: 0.16, height: 0.6, depth: 0.18 }, this.scene),
        this.clothMat,
        new Vector3(side * 0.11, -0.42, 0),
      );
      part(
        MeshBuilder.CreateBox("enemyTabi", { width: 0.18, height: 0.13, depth: 0.25 }, this.scene),
        darkMat,
        new Vector3(side * 0.11, -0.74, 0.03),
      );
    }

    // Torso, with the sash knotted at the waist and a strap across the chest.
    part(
      MeshBuilder.CreateBox("enemyTorso", { width: 0.42, height: 0.52, depth: 0.24 }, this.scene),
      this.clothMat,
      new Vector3(0, 0.16, 0),
    );
    part(
      MeshBuilder.CreateBox("enemySash", { width: 0.45, height: 0.11, depth: 0.27 }, this.scene),
      accentMat,
      new Vector3(0, -0.06, 0),
    );
    part(
      MeshBuilder.CreateBox("enemySashKnot", { width: 0.1, height: 0.16, depth: 0.08 }, this.scene),
      accentMat,
      new Vector3(0.16, -0.11, 0.14),
    );
    part(
      MeshBuilder.CreateBox("enemyChestStrap", { width: 0.09, height: 0.5, depth: 0.26 }, this.scene),
      darkMat,
      new Vector3(-0.05, 0.18, 0),
    ).rotation.z = 0.35;

    // Arms, with wrapped forearms and bare hands.
    for (const side of [-1, 1]) {
      part(
        MeshBuilder.CreateBox("enemyUpperArm", { width: 0.13, height: 0.28, depth: 0.15 }, this.scene),
        this.clothMat,
        new Vector3(side * 0.28, 0.26, 0),
      );
      part(
        MeshBuilder.CreateBox("enemyWrap", { width: 0.115, height: 0.24, depth: 0.13 }, this.scene),
        darkMat,
        new Vector3(side * 0.28, 0.0, 0.01),
      );
      part(
        MeshBuilder.CreateBox("enemyHand", { width: 0.11, height: 0.1, depth: 0.12 }, this.scene),
        skinMat,
        new Vector3(side * 0.28, -0.17, 0.02),
      );
    }

    // Hood: a wrapped head with only a band of face showing, plus a tail hanging down the back.
    part(
      MeshBuilder.CreateBox("enemyHead", { width: 0.25, height: 0.27, depth: 0.25 }, this.scene),
      this.clothMat,
      new Vector3(0, 0.57, 0),
    );
    part(
      MeshBuilder.CreateBox("enemyHoodCrown", { width: 0.27, height: 0.1, depth: 0.27 }, this.scene),
      darkMat,
      new Vector3(0, 0.7, -0.01),
    );
    part(
      MeshBuilder.CreateBox("enemyHoodTail", { width: 0.16, height: 0.3, depth: 0.05 }, this.scene),
      darkMat,
      new Vector3(0, 0.56, -0.15),
    );
    part(
      MeshBuilder.CreateBox("enemyEyeBand", { width: 0.26, height: 0.06, depth: 0.02 }, this.scene),
      skinMat,
      new Vector3(0, 0.6, 0.126),
    );
    part(
      MeshBuilder.CreateBox("enemyHeadband", { width: 0.27, height: 0.035, depth: 0.265 }, this.scene),
      accentMat,
      new Vector3(0, 0.665, 0),
    );

    // Sheathed katana slung across the back.
    const scabbard = part(
      MeshBuilder.CreateBox("enemyScabbard", { width: 0.05, height: 0.86, depth: 0.05 }, this.scene),
      darkMat,
      new Vector3(-0.02, 0.2, -0.2),
    );
    scabbard.rotation.z = 0.6;
    const hilt = part(
      MeshBuilder.CreateBox("enemyKatanaHilt", { width: 0.04, height: 0.22, depth: 0.04 }, this.scene),
      steelMat,
      new Vector3(0.26, 0.47, -0.2),
    );
    hilt.rotation.z = 0.6;
  }

  /**
   * A billboarded, distance-scaled number tag above the enemy's head. Unlike the body (which can
   * blend into neighbors at range), this always faces the camera and keeps a roughly constant
   * on-screen size, so enemy count stays readable from any distance or angle.
   */
  private createMarker(label: string, accent: Color3): Mesh {
    const texture = new DynamicTexture(`enemyMarkerTex-${label}`, { width: 128, height: 128 }, this.scene, true);
    texture.hasAlpha = true;
    texture.drawText(label, null, null, "bold 88px sans-serif", "#ffffff", "transparent", true);

    const material = new StandardMaterial("enemyMarkerMat", this.scene);
    material.diffuseTexture = texture;
    // Mostly white, faintly tinted toward the ninja's accent: the tag has to stay legible
    // against a bright desert sky first, and colour-match the sash second.
    material.emissiveColor = accent.scale(0.25).add(new Color3(0.82, 0.82, 0.82));
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;

    const marker = MeshBuilder.CreatePlane("enemyMarker", { size: 1 }, this.scene);
    marker.material = material;
    marker.billboardMode = Mesh.BILLBOARDMODE_ALL;
    marker.isPickable = false;
    return marker;
  }

  /** The tanto held in the right hand; stabKnife() swings this, driven by the server's event. */
  private createKnife(): TransformNode {
    const knife = new TransformNode("knife", this.scene);
    knife.parent = this.root;
    knife.position = new Vector3(0.3, -0.16, 0.14);
    knife.rotation = new Vector3(0, 0, -Math.PI / 2.4);

    const bladeMat = new StandardMaterial("knifeBladeMat", this.scene);
    bladeMat.diffuseColor = STEEL_COLOR.clone();
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
    this.root.position.x += (this.targetX - this.root.position.x) * t;
    this.root.position.y += (this.targetY - this.root.position.y) * t;
    this.root.position.z += (this.targetZ - this.root.position.z) * t;
    this.root.rotation.y += (this.targetRotY - this.root.rotation.y) * t;

    this.marker.position.x = this.root.position.x;
    this.marker.position.y = this.root.position.y + MARKER_Y_OFFSET;
    this.marker.position.z = this.root.position.z;

    const camera = this.scene.activeCamera;
    if (camera) {
      const distance = Vector3.Distance(camera.globalPosition, this.marker.position);
      const scale = distance * MARKER_DISTANCE_SCALE;
      this.marker.scaling.set(scale, scale, scale);
    }
  }

  flashHit(): void {
    this.clothMat.diffuseColor = Color3.White();
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    this.flashResetTimer = setTimeout(() => {
      this.clothMat.diffuseColor = this.intactColor.clone();
    }, 80);
  }

  stabKnife(): void {
    this.knife.rotation.x = this.knifeRestRotation.x - 1.1;
    if (this.stabResetTimer) clearTimeout(this.stabResetTimer);
    this.stabResetTimer = setTimeout(() => {
      this.knife.rotation.copyFrom(this.knifeRestRotation);
    }, 150);
  }

  /** Plays the wind-up for a shuriken throw: the same arm snap, reused. */
  throwAnimation(): void {
    this.knife.rotation.x = this.knifeRestRotation.x - 1.6;
    if (this.stabResetTimer) clearTimeout(this.stabResetTimer);
    this.stabResetTimer = setTimeout(() => {
      this.knife.rotation.copyFrom(this.knifeRestRotation);
    }, 220);
  }

  break(x: number, y: number, z: number): void {
    this.root.setEnabled(false);
    this.marker.setEnabled(false);
    spawnDebris(this.scene, new Vector3(x, y, z), this.debrisMat, "enemyDebris");
  }

  respawn(x: number, y: number, z: number): void {
    this.clothMat.diffuseColor = this.intactColor.clone();
    this.root.position.set(x, y, z);
    this.marker.position.set(x, y + MARKER_Y_OFFSET, z);
    this.marker.setEnabled(true);
    this.setTarget(x, y, z, 0);
    this.root.setEnabled(true);
  }

  dispose(): void {
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    if (this.stabResetTimer) clearTimeout(this.stabResetTimer);
    this.marker.material?.dispose(false, true);
    this.marker.dispose();
    this.root.dispose();
  }
}

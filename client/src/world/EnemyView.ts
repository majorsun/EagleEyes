import { Scene, Mesh, TransformNode, MeshBuilder, StandardMaterial, DynamicTexture, Color3, Vector3 } from "@babylonjs/core";
import { spawnDebris } from "./debris";

// Each ninja wears the same near-black shozoku; the per-enemy color lives in the sash, hood trim
// and headband instead, so overlapping or distant silhouettes stay tellable apart without three
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

// --- Animation tuning -------------------------------------------------------------------------
/** Radians of leg swing at a full run. */
const WALK_LEG_SWING = 0.85;
/** Arms swing a little less than legs, and opposite to them. */
const WALK_ARM_SWING = 0.55;
/** Stride cycles per metre travelled -- keeps the gait tied to distance, so it never moonwalks. */
const STRIDE_PER_METRE = 1.15;
/** Below this speed (m/s) the ninja settles back to an idle stance. */
const WALK_SPEED_FLOOR = 0.25;
/** How fast the limbs relax back to neutral when the ninja stops. */
const POSE_RELAX_RATE = 8;
const THROW_DURATION = 0.42;
const SWING_DURATION = 0.34;

type ActionKind = "throw" | "swing";

/**
 * Purely reactive visual for a server-driven enemy: no AI, no health authority, just renders
 * whatever EnemyState says and plays the matching reaction on broadcast events. The figure is
 * built around the enemy's own origin, which the server places at the body's centre, so the feet
 * sit at -0.8 and the hood tops out near +0.8.
 *
 * Limbs hang off pivot nodes at the hips and shoulders rather than being positioned directly, so
 * the walk cycle and the attack animations can rotate them about a joint instead of spinning each
 * box around its own middle.
 */
export class EnemyView {
  readonly root: TransformNode;
  private readonly intactColor: Color3;
  private readonly clothMat: StandardMaterial;
  private readonly debrisMat: StandardMaterial;
  private readonly marker: Mesh;

  private readonly hips: TransformNode[] = [];
  private readonly shoulders: TransformNode[] = [];
  /** The throwing/blade arm: shoulders[1] is the right side. */
  private rightShoulder!: TransformNode;
  private readonly blade: TransformNode;

  private walkPhase = 0;
  /** Interpolated ground height, kept apart from the stride bob layered on top of it. */
  private baseY: number;
  private action: ActionKind | null = null;
  private actionElapsed = 0;
  private flashResetTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.blade = this.createBlade();

    this.marker = this.createMarker(label, accent);
    this.marker.position = new Vector3(x, y + MARKER_Y_OFFSET, z);

    this.baseY = y;
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

    const attach = (mesh: Mesh, material: StandardMaterial, parent: TransformNode, position: Vector3) => {
      mesh.material = material;
      mesh.position = position;
      mesh.parent = parent;
      mesh.isPickable = false;
      return mesh;
    };

    // Legs on hip pivots, so the walk cycle swings them from the joint.
    for (const side of [-1, 1]) {
      const hip = new TransformNode(`enemyHip${side}`, this.scene);
      hip.parent = this.root;
      hip.position = new Vector3(side * 0.11, -0.12, 0);
      this.hips.push(hip);

      attach(
        MeshBuilder.CreateBox("enemyLeg", { width: 0.16, height: 0.6, depth: 0.18 }, this.scene),
        this.clothMat,
        hip,
        new Vector3(0, -0.3, 0),
      );
      attach(
        MeshBuilder.CreateBox("enemyTabi", { width: 0.18, height: 0.13, depth: 0.25 }, this.scene),
        darkMat,
        hip,
        new Vector3(0, -0.62, 0.03),
      );
    }

    // Torso, sash and chest strap.
    attach(
      MeshBuilder.CreateBox("enemyTorso", { width: 0.42, height: 0.52, depth: 0.24 }, this.scene),
      this.clothMat,
      this.root,
      new Vector3(0, 0.16, 0),
    );
    attach(
      MeshBuilder.CreateBox("enemySash", { width: 0.45, height: 0.11, depth: 0.27 }, this.scene),
      accentMat,
      this.root,
      new Vector3(0, -0.06, 0),
    );
    attach(
      MeshBuilder.CreateBox("enemySashKnot", { width: 0.1, height: 0.16, depth: 0.08 }, this.scene),
      accentMat,
      this.root,
      new Vector3(0.16, -0.11, 0.14),
    );
    attach(
      MeshBuilder.CreateBox("enemyChestStrap", { width: 0.09, height: 0.5, depth: 0.26 }, this.scene),
      darkMat,
      this.root,
      new Vector3(-0.05, 0.18, 0),
    ).rotation.z = 0.35;

    // Arms on shoulder pivots. Index 0 is the left side, 1 the right (the blade/throwing arm).
    for (const side of [-1, 1]) {
      const shoulder = new TransformNode(`enemyShoulder${side}`, this.scene);
      shoulder.parent = this.root;
      shoulder.position = new Vector3(side * 0.28, 0.38, 0);
      this.shoulders.push(shoulder);

      attach(
        MeshBuilder.CreateBox("enemyUpperArm", { width: 0.13, height: 0.28, depth: 0.15 }, this.scene),
        this.clothMat,
        shoulder,
        new Vector3(0, -0.14, 0),
      );
      attach(
        MeshBuilder.CreateBox("enemyWrap", { width: 0.115, height: 0.24, depth: 0.13 }, this.scene),
        darkMat,
        shoulder,
        new Vector3(0, -0.38, 0.01),
      );
      attach(
        MeshBuilder.CreateBox("enemyHand", { width: 0.11, height: 0.1, depth: 0.12 }, this.scene),
        skinMat,
        shoulder,
        new Vector3(0, -0.55, 0.02),
      );
    }
    this.rightShoulder = this.shoulders[1];

    // Hood: a wrapped head with only a band of face showing, plus a tail down the back.
    attach(
      MeshBuilder.CreateBox("enemyHead", { width: 0.25, height: 0.27, depth: 0.25 }, this.scene),
      this.clothMat,
      this.root,
      new Vector3(0, 0.57, 0),
    );
    attach(
      MeshBuilder.CreateBox("enemyHoodCrown", { width: 0.27, height: 0.1, depth: 0.27 }, this.scene),
      darkMat,
      this.root,
      new Vector3(0, 0.7, -0.01),
    );
    attach(
      MeshBuilder.CreateBox("enemyHoodTail", { width: 0.16, height: 0.3, depth: 0.05 }, this.scene),
      darkMat,
      this.root,
      new Vector3(0, 0.56, -0.15),
    );
    attach(
      MeshBuilder.CreateBox("enemyEyeBand", { width: 0.26, height: 0.06, depth: 0.02 }, this.scene),
      skinMat,
      this.root,
      new Vector3(0, 0.6, 0.126),
    );
    attach(
      MeshBuilder.CreateBox("enemyHeadband", { width: 0.27, height: 0.035, depth: 0.265 }, this.scene),
      accentMat,
      this.root,
      new Vector3(0, 0.665, 0),
    );

    // Sheathed katana slung across the back.
    attach(
      MeshBuilder.CreateBox("enemyScabbard", { width: 0.05, height: 0.86, depth: 0.05 }, this.scene),
      darkMat,
      this.root,
      new Vector3(-0.02, 0.2, -0.2),
    ).rotation.z = 0.6;
    attach(
      MeshBuilder.CreateBox("enemyKatanaHilt", { width: 0.04, height: 0.22, depth: 0.04 }, this.scene),
      steelMat,
      this.root,
      new Vector3(0.26, 0.47, -0.2),
    ).rotation.z = 0.6;
  }

  /** The drawn blade, hanging from the right hand so it follows every arm animation. */
  private createBlade(): TransformNode {
    const blade = new TransformNode("enemyBlade", this.scene);
    blade.parent = this.rightShoulder;
    blade.position = new Vector3(0, -0.58, 0.06);
    blade.rotation = new Vector3(-0.5, 0, 0);

    const bladeMat = new StandardMaterial("bladeMat", this.scene);
    bladeMat.diffuseColor = STEEL_COLOR.clone();
    bladeMat.specularColor = new Color3(0.9, 0.9, 0.9);
    bladeMat.specularPower = 64;

    const hiltMat = new StandardMaterial("bladeHiltMat", this.scene);
    hiltMat.diffuseColor = new Color3(0.1, 0.08, 0.06);
    hiltMat.specularColor = new Color3(0, 0, 0);

    const steel = MeshBuilder.CreateBox("bladeSteel", { width: 0.035, height: 0.52, depth: 0.012 }, this.scene);
    steel.material = bladeMat;
    steel.position = new Vector3(0, 0.34, 0);
    steel.parent = blade;
    steel.isPickable = false;

    const tip = MeshBuilder.CreateCylinder(
      "bladeTip",
      { diameterTop: 0, diameterBottom: 0.035, height: 0.08, tessellation: 8 },
      this.scene,
    );
    tip.material = bladeMat;
    tip.position = new Vector3(0, 0.64, 0);
    tip.parent = blade;
    tip.isPickable = false;

    const guard = MeshBuilder.CreateBox("bladeGuard", { width: 0.1, height: 0.02, depth: 0.05 }, this.scene);
    guard.material = hiltMat;
    guard.position = new Vector3(0, 0.07, 0);
    guard.parent = blade;
    guard.isPickable = false;

    const grip = MeshBuilder.CreateCylinder("bladeGrip", { diameter: 0.04, height: 0.16, tessellation: 10 }, this.scene);
    grip.material = hiltMat;
    grip.parent = blade;
    grip.isPickable = false;

    return blade;
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
    // Mostly white, faintly tinted toward the ninja's accent: the tag has to stay legible against
    // a bright desert sky first, and colour-match the sash second.
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

  setTarget(x: number, y: number, z: number, rotY: number): void {
    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  update(deltaSeconds: number): void {
    const previousX = this.root.position.x;
    const previousZ = this.root.position.z;

    const t = Math.min(1, deltaSeconds * LERP_RATE);
    this.root.position.x += (this.targetX - this.root.position.x) * t;
    this.baseY += (this.targetY - this.baseY) * t;
    this.root.position.z += (this.targetZ - this.root.position.z) * t;
    this.root.rotation.y += (this.targetRotY - this.root.rotation.y) * t;

    this.marker.position.x = this.root.position.x;
    this.marker.position.y = this.baseY + MARKER_Y_OFFSET;
    this.marker.position.z = this.root.position.z;

    const camera = this.scene.activeCamera;
    if (camera) {
      const distance = Vector3.Distance(camera.globalPosition, this.marker.position);
      const scale = distance * MARKER_DISTANCE_SCALE;
      this.marker.scaling.set(scale, scale, scale);
    }

    const travelled = Math.hypot(this.root.position.x - previousX, this.root.position.z - previousZ);
    this.animate(travelled, deltaSeconds);
  }

  /**
   * Drives the gait off distance actually covered this frame (not off a free-running clock), so
   * the stride matches the speed the server is moving the ninja at and stops dead when it does.
   */
  private animate(travelled: number, deltaSeconds: number): void {
    const speed = deltaSeconds > 0 ? travelled / deltaSeconds : 0;
    const walking = speed > WALK_SPEED_FLOOR;
    if (walking) this.walkPhase += travelled * STRIDE_PER_METRE * Math.PI * 2;

    const intensity = walking ? Math.min(1, speed / 3) : 0;
    const legSwing = Math.sin(this.walkPhase) * WALK_LEG_SWING * intensity;
    const armSwing = Math.sin(this.walkPhase) * WALK_ARM_SWING * intensity;
    const relax = Math.min(1, deltaSeconds * POSE_RELAX_RATE);

    // Opposite limbs lead: left leg forward pairs with right arm back.
    this.hips[0].rotation.x += (legSwing - this.hips[0].rotation.x) * relax;
    this.hips[1].rotation.x += (-legSwing - this.hips[1].rotation.x) * relax;
    this.shoulders[0].rotation.x += (-armSwing - this.shoulders[0].rotation.x) * relax;

    // A slight bob, so the body rides the stride instead of gliding.
    const bob = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.035 * intensity : 0;
    this.root.position.y = this.baseY + bob;

    if (this.action) {
      this.actionElapsed += deltaSeconds;
      this.playAction();
      return;
    }
    this.rightShoulder.rotation.x += (armSwing - this.rightShoulder.rotation.x) * relax;
    this.rightShoulder.rotation.z += (0 - this.rightShoulder.rotation.z) * relax;
    this.blade.rotation.x += (-0.5 - this.blade.rotation.x) * relax;
  }

  /** Poses the right arm through whichever attack is currently playing. */
  private playAction(): void {
    if (this.action === "throw") {
      const p = Math.min(1, this.actionElapsed / THROW_DURATION);
      // Wind the arm back over the first third, then snap it forward and overhand.
      const pose = p < 0.35 ? (p / 0.35) * 1.9 : 1.9 - ((p - 0.35) / 0.65) * 3.6;
      this.rightShoulder.rotation.x = -pose;
      this.rightShoulder.rotation.z = 0.25 * Math.sin(p * Math.PI);
      // The blade is tucked away while the hand is throwing steel.
      this.blade.rotation.x = -0.5 + Math.sin(p * Math.PI) * 1.4;
      if (p >= 1) this.endAction();
      return;
    }

    const p = Math.min(1, this.actionElapsed / SWING_DURATION);
    // A diagonal kesagiri: up and across on the wind-up, down hard through the cut.
    const arc = p < 0.3 ? -(p / 0.3) * 2.2 : -2.2 + ((p - 0.3) / 0.7) * 4.4;
    this.rightShoulder.rotation.x = arc;
    this.rightShoulder.rotation.z = -0.7 * Math.sin(p * Math.PI);
    this.blade.rotation.x = -0.5 - Math.sin(p * Math.PI) * 0.6;
    if (p >= 1) this.endAction();
  }

  private endAction(): void {
    this.action = null;
    this.actionElapsed = 0;
  }

  private startAction(kind: ActionKind): void {
    this.action = kind;
    this.actionElapsed = 0;
  }

  flashHit(): void {
    this.clothMat.diffuseColor = Color3.White();
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    this.flashResetTimer = setTimeout(() => {
      this.clothMat.diffuseColor = this.intactColor.clone();
    }, 80);
  }

  /** Melee: a full sword swing, driven by the server's attack broadcast. */
  stabKnife(): void {
    this.startAction("swing");
  }

  /** Ranged: the overhand snap that releases a shuriken. */
  throwAnimation(): void {
    this.startAction("throw");
  }

  break(x: number, y: number, z: number): void {
    this.root.setEnabled(false);
    this.marker.setEnabled(false);
    spawnDebris(this.scene, new Vector3(x, y, z), this.debrisMat, "enemyDebris");
  }

  respawn(x: number, y: number, z: number): void {
    this.clothMat.diffuseColor = this.intactColor.clone();
    this.baseY = y;
    this.root.position.set(x, y, z);
    this.marker.position.set(x, y + MARKER_Y_OFFSET, z);
    this.marker.setEnabled(true);
    this.setTarget(x, y, z, 0);
    this.root.setEnabled(true);
    this.endAction();
  }

  dispose(): void {
    if (this.flashResetTimer) clearTimeout(this.flashResetTimer);
    this.marker.material?.dispose(false, true);
    this.marker.dispose();
    this.root.dispose();
  }
}

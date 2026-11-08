import {
  Scene,
  TransformNode,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  PBRMaterial,
  SceneLoader,
  AssetContainer,
  AnimationGroup,
  InstantiatedEntries,
  Color3,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import {
  PLAYER_SKINS,
  DEFAULT_PLAYER_SKIN,
  GROUND_EYE_HEIGHT,
  PRONE_EYE_DROP,
  type PlayerSkin,
} from "@eagleeyes/shared";
import { spawnDebris } from "./debris";

const LERP_RATE = 12;
/** How long a body lies where it fell before it is cleared away. */
const CORPSE_LINGER = 2.2;
/** Once cleared, it sinks out of sight rather than blinking out. */
const CORPSE_SINK_SPEED = 0.9;

// Rigged operator model (client/public/models/operator.glb): Quaternius "Soldier Male" from the
// Ultimate Animated Characters pack, CC0, no attribution required. Loaded once per scene into an
// AssetContainer and instantiated per player, so twenty remote players share one download and one
// set of materials.
const MODEL_ROOT_URL = "/models/";
const MODEL_FILE = "operator.glb";
/** Metres from sole to crown. */
const MODEL_HEIGHT = 1.8;
/**
 * A player's networked y is their EYE height, not their centre or their feet, so the figure hangs
 * a full GROUND_EYE_HEIGHT below the root. The old blocky stand-in used half that and floated
 * about 0.9m above the sand.
 */
const MODEL_FEET_OFFSET = -GROUND_EYE_HEIGHT;
/**
 * Prone drops the eye by PRONE_EYE_DROP without changing anything else, so the body hangs that
 * much closer to the ground. Going prone is also the only pose you hold while standing still --
 * any movement input unprones you -- so a figure that ignores it looks like it sinks whenever
 * its player stops moving.
 */
const PRONE_FEET_OFFSET = -(GROUND_EYE_HEIGHT - PRONE_EYE_DROP);
/** The model already faces +Z, which is what the rest of the game treats as a player's facing. */
const MODEL_FACING_OFFSET = 0;
/**
 * Prefix applied to every instantiated node AND material name. Babylon runs the instantiation's
 * name function over cloned materials too, so the skin lookup has to strip this back off to
 * recover the authored material name.
 */
const INSTANCE_PREFIX = "remotePlayer_";
/** Bone the rifle rides on, so it tracks the hand through every animation instead of floating. */
const HAND_BONE = "FistR";
/** Rifle placement in hand-bone space, tuned against the idle pose. */
const WEAPON_OFFSET = new Vector3(0, 0.05, 0.12);
/** Horizontal speed (m/s) above which the figure switches from the idle to the run animation. */
const RUN_ANIMATION_SPEED = 0.6;

// Which slot of a PlayerSkin each of the model's materials is painted from. "Skin" and "Face" are
// painted from the mask slot on purpose: every skin covers the face, so no player ever renders a
// bare low-poly face (which at this size reads as crude features rather than as a person).
const MATERIAL_SLOTS: Record<string, keyof Omit<PlayerSkin, "id" | "label">> = {
  Main: "uniform",
  Character_Main: "uniform",
  DarkGreen: "secondary",
  Pants: "secondary",
  Helmet: "helmet",
  Skin: "mask",
  Face: "mask",
  Black: "gear",
};

// Stand-in palette for the blocky figure drawn until the model arrives (and kept permanently if
// the download fails, so a missing asset degrades to a visible player rather than an invisible one).
const PLACEHOLDER_CAMO = new Color3(0.17, 0.19, 0.23);
const PLACEHOLDER_VEST = new Color3(0.07, 0.075, 0.09);
const PLACEHOLDER_GEAR = new Color3(0.05, 0.05, 0.06);
const PLACEHOLDER_POUCH = new Color3(0.44, 0.39, 0.26);

const WEAPON_COLOR = new Color3(0.09, 0.09, 0.1);

const containerCache = new WeakMap<Scene, Promise<AssetContainer | null>>();

/**
 * Loads (once per scene) the operator model, left in its stock colors -- each player instance
 * clones the materials and paints its own skin over them. Resolves to null if the asset is
 * missing or fails to parse; callers keep their primitive stand-in in that case.
 */
function loadOperatorContainer(scene: Scene): Promise<AssetContainer | null> {
  const cached = containerCache.get(scene);
  if (cached) return cached;

  const pending = SceneLoader.LoadAssetContainerAsync(MODEL_ROOT_URL, MODEL_FILE, scene)
    .catch((error: unknown) => {
      console.warn(`[RemotePlayerView] ${MODEL_FILE} failed to load; keeping the blocky stand-in`, error);
      return null;
    });

  containerCache.set(scene, pending);
  return pending;
}

/**
 * Visual for a remote player: a rigged, animated operator model standing in for the capsule that
 * used to represent other players. The root is a bare TransformNode -- the model and every
 * fallback part is parented to it, so position/rotation/scale lerps (and the death crumble) apply
 * to the whole figure for free with no extra per-part frame work.
 */
export class RemotePlayerView {
  readonly root: TransformNode;
  private readonly debrisMat: StandardMaterial;
  private placeholder: TransformNode | null = null;
  private instance: InstantiatedEntries | null = null;
  private weapon: Mesh | null = null;
  private model: TransformNode | null = null;
  /** Metres the model must be lifted for its soles to sit on the figure's own ground plane. */
  private modelSoleLift = 0;
  /** Same, for the lying pose: the model's rotated-down extent below its origin. */
  private modelProneLift = 0;
  private isProneState: boolean;
  private idleAnimation: AnimationGroup | null = null;
  private runAnimation: AnimationGroup | null = null;
  private walkAnimation: AnimationGroup | null = null;
  private jumpAnimation: AnimationGroup | null = null;
  private deathAnimation: AnimationGroup | null = null;
  private isJumpingState = false;
  private activeAnimation: AnimationGroup | null = null;
  private isDisposed = false;
  private skinIndex: number;
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
    skin: number = DEFAULT_PLAYER_SKIN,
    isProne = false,
  ) {
    this.skinIndex = skin;
    this.isProneState = isProne;
    this.root = new TransformNode("remotePlayerRoot", scene);
    this.root.position = new Vector3(x, y, z);
    this.root.rotation.y = rotY;

    this.debrisMat = new StandardMaterial("remotePlayerDebrisMat", scene);
    this.debrisMat.diffuseColor = new Color3(0.1, 0.1, 0.08);

    this.buildPlaceholder();
    void this.attachModel();

    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  /**
   * Instantiates the shared model under this player's root, scaled and seated so the soles sit at
   * the root's feet (-0.9) regardless of the authored units, then drops the stand-in.
   */
  private async attachModel(): Promise<void> {
    const container = await loadOperatorContainer(this.scene);
    if (!container || this.isDisposed) return;

    // cloneMaterials, because every player paints their own cosmetic skin over the stock colors
    // and so can't share one material set with the rest of the room.
    const instance = container.instantiateModelsToScene((name) => `${INSTANCE_PREFIX}${name}`, true);
    this.instance = instance;

    const model = new TransformNode("remotePlayerModel", this.scene);
    for (const node of instance.rootNodes) node.parent = model;
    model.rotation.y = MODEL_FACING_OFFSET;

    // Measure while the model still sits at the origin, BEFORE parenting it to the player root.
    // getHierarchyBoundingVectors reports world space, so measuring after parenting folds the
    // player's own Y into the offset and buries the figure that far into the ground.
    const bounds = model.getHierarchyBoundingVectors();
    const authoredHeight = bounds.max.y - bounds.min.y;
    const scale = authoredHeight > 0 ? MODEL_HEIGHT / authoredHeight : 1;
    model.scaling.setAll(scale);
    model.parent = this.root;
    this.model = model;
    this.modelSoleLift = -bounds.min.y * scale;
    // Lying down rotates the model -90 degrees about X, which swaps its depth onto the vertical
    // axis -- so the belly, not the soles, becomes the lowest point.
    this.modelProneLift = -bounds.min.z * scale;
    this.applyStance();

    for (const group of instance.animationGroups) {
      group.stop();
      if (group.name.includes("Idle")) this.idleAnimation ??= group;
      if (group.name.includes("Run")) this.runAnimation ??= group;
      if (group.name.includes("Walk")) this.walkAnimation ??= group;
      if (group.name.includes("Jump")) this.jumpAnimation ??= group;
      if (group.name.includes("Death")) this.deathAnimation ??= group;
    }
    this.playAnimation(this.idleAnimation);
    this.attachWeapon(model, scale);
    this.applySkin();

    this.placeholder?.dispose();
    this.placeholder = null;
  }

  /** Mirrors the server's prone flag; safe to call before the model has finished loading. */
  setProne(isProne: boolean): void {
    if (isProne === this.isProneState) return;
    this.isProneState = isProne;
    this.applyStance();
  }

  /** Seats the model for the current stance so it rests on the ground either way. */
  private applyStance(): void {
    const model = this.model;
    if (!model) return;
    if (this.isProneState) {
      model.rotation.x = -Math.PI / 2;
      model.position.y = PRONE_FEET_OFFSET + this.modelProneLift;
    } else {
      model.rotation.x = 0;
      model.position.y = MODEL_FEET_OFFSET + this.modelSoleLift;
    }
  }

  /** Switches this player's cosmetic skin; safe to call before the model has finished loading. */
  setSkin(skin: number): void {
    if (skin === this.skinIndex) return;
    this.skinIndex = skin;
    this.applySkin();
  }

  /**
   * Paints the instance's (cloned) materials from the selected skin, matching on the authored
   * material name recovered from the instance prefix.
   */
  private applySkin(): void {
    const skin = PLAYER_SKINS[this.skinIndex] ?? PLAYER_SKINS[DEFAULT_PLAYER_SKIN];
    for (const node of this.instance?.rootNodes ?? []) {
      for (const mesh of node.getChildMeshes()) {
        const material = mesh.material;
        if (!(material instanceof PBRMaterial)) continue;
        const stem = material.name.startsWith(INSTANCE_PREFIX)
          ? material.name.slice(INSTANCE_PREFIX.length)
          : material.name;
        const slot = MATERIAL_SLOTS[stem];
        if (!slot) continue;
        const [r, g, b] = skin[slot];
        material.albedoColor.set(r, g, b);
        material.metallic = 0;
        material.roughness = 0.9;
      }
    }
  }

  /**
   * Hangs the rifle off the model's right-hand bone. Bone-attached meshes inherit the bone's world
   * matrix (model scaling included), so the rifle is counter-scaled to stay life-sized, and it
   * lives outside the root hierarchy -- hence the explicit dispose().
   */
  private attachWeapon(model: TransformNode, modelScale: number): void {
    const skinned = model.getChildMeshes().find((mesh) => mesh.skeleton);
    const hand = skinned?.skeleton?.bones.find((bone) => bone.name === HAND_BONE);
    if (!skinned || !hand) return;

    const weaponMat = new StandardMaterial("remotePlayerWeaponMat", this.scene);
    weaponMat.diffuseColor = WEAPON_COLOR.clone();
    weaponMat.specularColor = new Color3(0.3, 0.3, 0.35);

    const weapon = new Mesh("remotePlayerWeapon", this.scene);
    const addPart = (part: Mesh, position: Vector3, rotationX = 0) => {
      part.material = weaponMat;
      part.position = position;
      part.rotation.x = rotationX;
      part.parent = weapon;
      part.isPickable = false;
    };
    addPart(MeshBuilder.CreateBox("weaponBody", { width: 0.06, height: 0.07, depth: 0.42 }, this.scene), new Vector3(0, 0, 0));
    addPart(
      MeshBuilder.CreateCylinder("weaponBarrel", { diameter: 0.025, height: 0.3, tessellation: 8 }, this.scene),
      new Vector3(0, 0, 0.34),
      Math.PI / 2,
    );
    addPart(MeshBuilder.CreateBox("weaponMag", { width: 0.03, height: 0.16, depth: 0.05 }, this.scene), new Vector3(0, -0.11, 0.06), -0.25);
    addPart(MeshBuilder.CreateBox("weaponStock", { width: 0.045, height: 0.06, depth: 0.2 }, this.scene), new Vector3(0, 0, -0.28));

    weapon.scaling.setAll(modelScale > 0 ? 1 / modelScale : 1);
    weapon.attachToBone(hand, skinned);

    // Cancel the hand bone's own rotation so the barrel points along the figure's facing instead
    // of along the fingers (which, with the arms down in idle, aims the rifle at the floor). The
    // weapon still tracks every later bone movement, since attachToBone recomposes each frame.
    const boneRotation = Quaternion.Identity();
    hand.getFinalMatrix().decompose(undefined, boneRotation, undefined);
    weapon.rotationQuaternion = boneRotation.conjugate();
    weapon.position = WEAPON_OFFSET.clone();
    weapon.isPickable = false;
    this.weapon = weapon;
  }

  private playAnimation(group: AnimationGroup | null, loop = true): void {
    if (!group || group === this.activeAnimation) return;
    this.activeAnimation?.stop();
    group.start(loop);
    this.activeAnimation = group;
  }

  /** Mirrors the server's isJumping flag so airborne players are visibly airborne. */
  setJumping(isJumping: boolean): void {
    this.isJumpingState = isJumping;
  }

  /**
   * Blocky stand-in shown for the frames before the model finishes loading: dark camo, plate
   * carrier with khaki mag pouches, helmet, rifle. Built from the same 1.8-tall silhouette so the
   * swap doesn't move the figure.
   */
  private buildPlaceholder(): void {
    const placeholder = new TransformNode("remotePlayerPlaceholder", this.scene);
    placeholder.parent = this.root;
    // Its parts are authored with the soles at -0.9; shift the group so they reach the ground.
    placeholder.position.y = (this.isProneState ? PRONE_FEET_OFFSET : MODEL_FEET_OFFSET) + 0.9;
    this.placeholder = placeholder;

    const material = (name: string, color: Color3) => {
      const mat = new StandardMaterial(name, this.scene);
      mat.diffuseColor = color.clone();
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      return mat;
    };

    const camoMat = material("remotePlayerCamoMat", PLACEHOLDER_CAMO);
    const vestMat = material("remotePlayerVestMat", PLACEHOLDER_VEST);
    const gearMat = material("remotePlayerGearMat", PLACEHOLDER_GEAR);
    const pouchMat = material("remotePlayerPouchMat", PLACEHOLDER_POUCH);

    const part = (mesh: ReturnType<typeof MeshBuilder.CreateBox>, mat: StandardMaterial, position: Vector3) => {
      mesh.material = mat;
      mesh.position = position;
      mesh.parent = placeholder;
      mesh.isPickable = false;
      return mesh;
    };

    for (const side of [-1, 1]) {
      part(
        MeshBuilder.CreateBox("remotePlayerLeg", { width: 0.18, height: 0.62, depth: 0.2 }, this.scene),
        camoMat,
        new Vector3(side * 0.115, -0.52, 0),
      );
      part(
        MeshBuilder.CreateBox("remotePlayerBoot", { width: 0.19, height: 0.17, depth: 0.26 }, this.scene),
        gearMat,
        new Vector3(side * 0.115, -0.86, 0.02),
      );
      part(
        MeshBuilder.CreateBox("remotePlayerArm", { width: 0.15, height: 0.54, depth: 0.16 }, this.scene),
        camoMat,
        new Vector3(side * 0.29, 0.16, 0.01),
      );
    }

    part(
      MeshBuilder.CreateBox("remotePlayerTorso", { width: 0.44, height: 0.52, depth: 0.25 }, this.scene),
      camoMat,
      new Vector3(0, 0.16, 0),
    );
    part(
      MeshBuilder.CreateBox("remotePlayerPlateCarrier", { width: 0.47, height: 0.4, depth: 0.31 }, this.scene),
      vestMat,
      new Vector3(0, 0.24, 0),
    );
    for (const offset of [-0.11, 0, 0.11]) {
      part(
        MeshBuilder.CreateBox("remotePlayerMagPouch", { width: 0.1, height: 0.15, depth: 0.07 }, this.scene),
        pouchMat,
        new Vector3(offset, 0.22, 0.17),
      );
    }
    part(
      MeshBuilder.CreateBox("remotePlayerHead", { width: 0.24, height: 0.27, depth: 0.24 }, this.scene),
      gearMat,
      new Vector3(0, 0.615, 0),
    );

    const helmet = MeshBuilder.CreateSphere("remotePlayerHelmet", { diameter: 0.35, segments: 10 }, this.scene);
    helmet.material = gearMat;
    helmet.position = new Vector3(0, 0.765, -0.01);
    helmet.scaling.set(1, 0.85, 1.05);
    helmet.parent = placeholder;
    helmet.isPickable = false;
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

  /**
   * Death plays the model's own collapse and leaves the body lying where it fell, rather than
   * shrinking it into the sand. A player killed mid-crawl is stood back up first, since the clip
   * is authored from an upright pose.
   */
  private crumble(): void {
    this.isDeadState = true;
    this.crumbleElapsed = 0;
    this.isProneState = false;
    this.applyStance();
    if (this.deathAnimation) {
      this.playAnimation(this.deathAnimation, false);
    } else {
      this.activeAnimation?.stop();
      this.activeAnimation = null;
    }
    spawnDebris(this.scene, this.root.position.clone(), this.debrisMat, "playerDebris", 4);
  }

  private reset(x: number, y: number, z: number, rotY: number): void {
    this.isDeadState = false;
    this.deathAnimation?.stop();
    this.activeAnimation = null;
    this.root.scaling.set(1, 1, 1);
    this.root.position.set(x, y, z);
    this.root.rotation.y = rotY;
    this.root.setEnabled(true);
    this.playAnimation(this.idleAnimation);
    this.setTarget(x, y, z, rotY);
  }

  update(deltaSeconds: number): void {
    if (this.isDeadState) {
      // The body holds its final pose where it dropped, then sinks away once the kill has had
      // time to read. The server's respawn is what actually brings it back.
      this.crumbleElapsed += deltaSeconds;
      if (this.crumbleElapsed > CORPSE_LINGER) {
        this.root.position.y -= deltaSeconds * CORPSE_SINK_SPEED;
        if (this.crumbleElapsed > CORPSE_LINGER + 2) this.root.setEnabled(false);
      }
      return;
    }

    const previousX = this.root.position.x;
    const previousZ = this.root.position.z;

    const t = Math.min(1, deltaSeconds * LERP_RATE);
    this.root.position.x += (this.targetX - this.root.position.x) * t;
    this.root.position.y += (this.targetY - this.root.position.y) * t;
    this.root.position.z += (this.targetZ - this.root.position.z) * t;
    this.root.rotation.y += (this.targetRotY - this.root.rotation.y) * t;

    // Drive the animation off the figure's own rendered motion rather than off raw state deltas,
    // so the legs match what the eye actually sees after interpolation.
    if (deltaSeconds > 0) {
      const speed = Math.hypot(this.root.position.x - previousX, this.root.position.z - previousZ) / deltaSeconds;
      const moving = speed > RUN_ANIMATION_SPEED;
      if (this.isJumpingState) {
        this.playAnimation(this.jumpAnimation ?? this.idleAnimation);
      } else if (this.isProneState) {
        // No crawl clip ships with the model, so a crawling player gets the walk cycle while
        // lying down -- the limbs move, which is what sells it at this size.
        this.playAnimation(moving ? this.walkAnimation ?? this.runAnimation : this.idleAnimation);
      } else {
        this.playAnimation(moving ? this.runAnimation : this.idleAnimation);
      }
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.weapon?.dispose(false, true);
    for (const group of this.instance?.animationGroups ?? []) group.dispose();
    this.instance?.dispose();
    this.root.dispose();
  }
}

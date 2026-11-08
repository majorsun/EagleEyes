import {
  Scene,
  UniversalCamera,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
} from "@babylonjs/core";

export interface MinigunViewModel {
  /** Root node of the visible minigun, parented to the camera. */
  root: TransformNode;
  /** Reference point at the end of the barrels, used as the bullet spawn origin. */
  muzzle: TransformNode;
  /**
   * Spins the barrel cluster up while held and lets it coast down when released. Call every
   * frame with whether the trigger is currently down.
   */
  update(deltaSeconds: number, firing: boolean): void;
}

const BARREL_COUNT = 6;
const BARREL_RING_RADIUS = 0.055;
/** Radians per second at full speed. */
const MAX_SPIN_RATE = 42;
const SPIN_UP_RATE = 90;
const SPIN_DOWN_RATE = 28;

/** A six-barrel minigun braced at the camera's lower right, barrels spinning while you hold fire. */
export function createMinigunViewModel(scene: Scene, camera: UniversalCamera): MinigunViewModel {
  const root = new TransformNode("minigunViewModel", scene);
  root.parent = camera;
  root.position = new Vector3(0.22, -0.26, 0.55);
  root.rotation = new Vector3(0, -0.04, 0);

  const metalMat = new StandardMaterial("minigunMetal", scene);
  metalMat.diffuseColor = new Color3(0.11, 0.115, 0.13);
  metalMat.specularColor = new Color3(0.45, 0.45, 0.5);
  metalMat.specularPower = 32;

  const barrelMat = new StandardMaterial("minigunBarrel", scene);
  barrelMat.diffuseColor = new Color3(0.2, 0.2, 0.22);
  barrelMat.specularColor = new Color3(0.6, 0.6, 0.65);
  barrelMat.specularPower = 48;

  const brassMat = new StandardMaterial("minigunBrass", scene);
  brassMat.diffuseColor = new Color3(0.52, 0.4, 0.16);
  brassMat.specularColor = new Color3(0.7, 0.6, 0.3);

  const part = (name: string, options: Parameters<typeof MeshBuilder.CreateBox>[1], material: StandardMaterial, position: Vector3, parent: TransformNode) => {
    const mesh = MeshBuilder.CreateBox(name, options, scene);
    mesh.material = material;
    mesh.position = position;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  };

  // Receiver, grip and the ammo box feeding it from the side.
  part("minigunBody", { width: 0.17, height: 0.17, depth: 0.42 }, metalMat, new Vector3(0, 0, 0), root);
  part("minigunGrip", { width: 0.07, height: 0.17, depth: 0.09 }, metalMat, new Vector3(0, -0.15, -0.12), root).rotation.x = 0.25;
  part("minigunAmmoBox", { width: 0.14, height: 0.16, depth: 0.2 }, metalMat, new Vector3(-0.17, -0.06, -0.14), root);
  part("minigunBelt", { width: 0.12, height: 0.04, depth: 0.05 }, brassMat, new Vector3(-0.1, 0.01, -0.06), root).rotation.z = 0.3;

  // The spinning cluster: barrels arranged around the bore axis, plus the plate they sit in.
  const spinner = new TransformNode("minigunSpinner", scene);
  spinner.parent = root;
  spinner.position = new Vector3(0, 0, 0.3);

  for (let i = 0; i < BARREL_COUNT; i++) {
    const angle = (i / BARREL_COUNT) * Math.PI * 2;
    const barrel = MeshBuilder.CreateCylinder(
      `minigunBarrel${i}`,
      { diameter: 0.032, height: 0.46, tessellation: 8 },
      scene,
    );
    barrel.material = barrelMat;
    barrel.rotation.x = Math.PI / 2;
    barrel.position = new Vector3(Math.cos(angle) * BARREL_RING_RADIUS, Math.sin(angle) * BARREL_RING_RADIUS, 0.2);
    barrel.parent = spinner;
    barrel.isPickable = false;
  }

  const hub = MeshBuilder.CreateCylinder("minigunHub", { diameter: 0.15, height: 0.06, tessellation: 12 }, scene);
  hub.material = metalMat;
  hub.rotation.x = Math.PI / 2;
  hub.parent = spinner;
  hub.isPickable = false;

  const muzzle = new TransformNode("minigunMuzzle", scene);
  muzzle.parent = root;
  muzzle.position = new Vector3(0, 0, 0.72);

  let spinRate = 0;

  return {
    root,
    muzzle,
    update(deltaSeconds: number, firing: boolean): void {
      const target = firing ? MAX_SPIN_RATE : 0;
      const rate = firing ? SPIN_UP_RATE : SPIN_DOWN_RATE;
      spinRate += Math.sign(target - spinRate) * Math.min(Math.abs(target - spinRate), rate * deltaSeconds);
      spinner.rotation.z += spinRate * deltaSeconds;
    },
  };
}

import {
  Scene,
  UniversalCamera,
  TransformNode,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
} from "@babylonjs/core";

export interface SniperViewModel {
  /** Root node of the visible rifle mesh, parented to the camera. */
  root: TransformNode;
  /** Reference point at the end of the muzzle brake, used as the bullet spawn origin. */
  muzzle: TransformNode;
}

/** Builds a detailed low-poly sniper rifle held in the camera's lower-right, like a right-handed FPS viewmodel. */
export function createSniperViewModel(scene: Scene, camera: UniversalCamera): SniperViewModel {
  const root = new TransformNode("sniperViewModel", scene);
  root.parent = camera;
  root.position = new Vector3(0.15, -0.18, 0.6);

  const metalMat = new StandardMaterial("gunMetal", scene);
  metalMat.diffuseColor = new Color3(0.09, 0.09, 0.1);
  metalMat.specularColor = new Color3(0.4, 0.4, 0.45);
  metalMat.specularPower = 32;

  const woodMat = new StandardMaterial("gunWood", scene);
  woodMat.diffuseColor = new Color3(0.28, 0.17, 0.09);
  woodMat.specularColor = new Color3(0.15, 0.1, 0.05);

  const rubberMat = new StandardMaterial("gunRubber", scene);
  rubberMat.diffuseColor = new Color3(0.04, 0.04, 0.04);
  rubberMat.specularColor = new Color3(0, 0, 0);

  const lensMat = new StandardMaterial("scopeLensMat", scene);
  lensMat.diffuseColor = new Color3(0.05, 0.2, 0.25);
  lensMat.emissiveColor = new Color3(0.08, 0.22, 0.26);

  const part = (mesh: Mesh, material: StandardMaterial, position: Vector3, rotation?: Vector3) => {
    mesh.material = material;
    mesh.position = position;
    if (rotation) mesh.rotation = rotation;
    mesh.parent = root;
    return mesh;
  };

  // Buttstock assembly
  part(MeshBuilder.CreateBox("buttpad", { width: 0.09, height: 0.1, depth: 0.03 }, scene), rubberMat, new Vector3(0, -0.02, -0.43));
  part(MeshBuilder.CreateBox("stock", { width: 0.08, height: 0.09, depth: 0.35 }, scene), woodMat, new Vector3(0, -0.02, -0.25));
  part(MeshBuilder.CreateBox("cheekRest", { width: 0.06, height: 0.03, depth: 0.18 }, scene), woodMat, new Vector3(0, 0.05, -0.2));
  part(
    MeshBuilder.CreateTorus("slingLoop", { diameter: 0.04, thickness: 0.006, tessellation: 12 }, scene),
    metalMat,
    new Vector3(0, -0.03, -0.42),
    new Vector3(Math.PI / 2, 0, 0),
  );

  // Receiver / trigger group
  part(MeshBuilder.CreateBox("body", { width: 0.07, height: 0.08, depth: 0.4 }, scene), metalMat, new Vector3(0, 0, 0.05));
  part(
    MeshBuilder.CreateTorus("triggerGuard", { diameter: 0.1, thickness: 0.01, tessellation: 16 }, scene),
    metalMat,
    new Vector3(0, -0.09, -0.05),
    new Vector3(Math.PI / 2, 0, 0),
  );
  part(MeshBuilder.CreateBox("trigger", { width: 0.015, height: 0.05, depth: 0.01 }, scene), metalMat, new Vector3(0, -0.06, -0.06));
  part(
    MeshBuilder.CreateCylinder("boltHandle", { diameter: 0.018, height: 0.09, tessellation: 10 }, scene),
    metalMat,
    new Vector3(0.045, 0, 0.18),
    new Vector3(0, 0, Math.PI / 2),
  );
  part(MeshBuilder.CreateSphere("boltKnob", { diameter: 0.03, segments: 8 }, scene), metalMat, new Vector3(0.09, 0, 0.18));
  part(MeshBuilder.CreateBox("magazine", { width: 0.04, height: 0.2, depth: 0.08 }, scene), metalMat, new Vector3(0, -0.13, 0.08), new Vector3(-0.3, 0, 0));

  // Optics rail + scope
  part(MeshBuilder.CreateBox("rail", { width: 0.02, height: 0.015, depth: 0.35 }, scene), metalMat, new Vector3(0, 0.045, 0.1));
  part(
    MeshBuilder.CreateCylinder("scopeRingRear", { diameter: 0.06, height: 0.02, tessellation: 16 }, scene),
    metalMat,
    new Vector3(0, 0.07, 0.0),
    new Vector3(Math.PI / 2, 0, 0),
  );
  part(
    MeshBuilder.CreateCylinder("scopeRingFront", { diameter: 0.06, height: 0.02, tessellation: 16 }, scene),
    metalMat,
    new Vector3(0, 0.07, 0.18),
    new Vector3(Math.PI / 2, 0, 0),
  );
  part(
    MeshBuilder.CreateCylinder("scopeTube", { diameter: 0.055, height: 0.26, tessellation: 16 }, scene),
    metalMat,
    new Vector3(0, 0.07, 0.09),
    new Vector3(Math.PI / 2, 0, 0),
  );
  part(
    MeshBuilder.CreateDisc("scopeLensFront", { radius: 0.028, tessellation: 16 }, scene),
    lensMat,
    new Vector3(0, 0.07, 0.22),
    new Vector3(Math.PI / 2, 0, 0),
  );
  part(
    MeshBuilder.CreateDisc("scopeLensRear", { radius: 0.02, tessellation: 16 }, scene),
    lensMat,
    new Vector3(0, 0.07, -0.04),
    new Vector3(-Math.PI / 2, 0, 0),
  );

  // Barrel + muzzle brake + bipod
  part(
    MeshBuilder.CreateCylinder("barrel", { diameter: 0.032, height: 0.6, tessellation: 12 }, scene),
    metalMat,
    new Vector3(0, 0.01, 0.58),
    new Vector3(Math.PI / 2, 0, 0),
  );
  part(
    MeshBuilder.CreateCylinder("muzzleBrake", { diameter: 0.05, height: 0.08, tessellation: 12 }, scene),
    metalMat,
    new Vector3(0, 0.01, 0.86),
    new Vector3(Math.PI / 2, 0, 0),
  );
  part(
    MeshBuilder.CreateCylinder("bipodLegLeft", { diameter: 0.015, height: 0.22, tessellation: 8 }, scene),
    metalMat,
    new Vector3(-0.05, -0.07, 0.48),
    new Vector3(0, 0, 0.35),
  );
  part(
    MeshBuilder.CreateCylinder("bipodLegRight", { diameter: 0.015, height: 0.22, tessellation: 8 }, scene),
    metalMat,
    new Vector3(0.05, -0.07, 0.48),
    new Vector3(0, 0, -0.35),
  );

  const muzzle = new TransformNode("muzzleTip", scene);
  muzzle.parent = root;
  muzzle.position = new Vector3(0, 0.01, 0.9);

  for (const mesh of root.getChildMeshes()) {
    mesh.isPickable = false;
  }

  return { root, muzzle };
}

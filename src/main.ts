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

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
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

  new HemisphericLight("light", new Vector3(0, 1, 0), scene);

  const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
  ground.material = groundMat;
  ground.checkCollisions = true;

  const target = MeshBuilder.CreateBox("target", { size: 1 }, scene);
  target.position = new Vector3(0, 1, 0);
  const targetMat = new StandardMaterial("targetMat", scene);
  targetMat.diffuseColor = new Color3(0.8, 0.1, 0.1);
  target.material = targetMat;
  target.checkCollisions = true;

  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  return scene;
}

const scene = createScene();

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

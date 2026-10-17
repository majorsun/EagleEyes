import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";

interface ActiveTracer {
  mesh: Mesh;
  direction: Vector3;
  speed: number;
  distanceTraveled: number;
  maxDistance: number;
}

/** Purely cosmetic bullet visual -- hit resolution already happened server-side before this spawns. */
export class BulletTracer {
  private readonly tracers: ActiveTracer[] = [];
  private readonly material: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.material = new StandardMaterial("bulletMat", scene);
    this.material.emissiveColor = new Color3(1, 0.85, 0.3);
    this.material.diffuseColor = new Color3(1, 0.85, 0.3);
  }

  spawn(origin: Vector3, target: Vector3, speed = 250): void {
    const direction = target.subtract(origin);
    const maxDistance = direction.length();
    if (maxDistance < 1e-4) return;
    direction.scaleInPlace(1 / maxDistance);

    const mesh = MeshBuilder.CreateSphere("bullet", { diameter: 0.04, segments: 6 }, this.scene);
    mesh.material = this.material;
    mesh.position.copyFrom(origin);
    mesh.isPickable = false;

    this.tracers.push({ mesh, direction, speed, distanceTraveled: 0, maxDistance });
  }

  update(deltaSeconds: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      const step = Math.min(tracer.speed * deltaSeconds, tracer.maxDistance - tracer.distanceTraveled);
      tracer.mesh.position.addInPlace(tracer.direction.scale(step));
      tracer.distanceTraveled += step;

      if (tracer.distanceTraveled >= tracer.maxDistance) {
        tracer.mesh.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}

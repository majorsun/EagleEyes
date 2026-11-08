import { Scene, Mesh, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { SHURIKEN_SPEED } from "@eagleeyes/shared";

/** Radians per second the star spins about its own axis while in flight. */
const SPIN_RATE = 26;
/**
 * Safety net: if a "gone" broadcast is ever missed, a star still retires on its own rather than
 * flying off across the desert forever.
 */
const MAX_LIFETIME_SECONDS = 3;

interface FlyingShuriken {
  root: TransformNode;
  dir: Vector3;
  age: number;
}

/**
 * Cosmetic layer for the ninjas' thrown stars. The server owns the projectile -- these are purely
 * the visible stars, flown at the same speed from the same origin, and retired when the server
 * says that one is gone. Nothing here can damage anybody.
 */
export class ShurikenField {
  private readonly inFlight = new Map<string, FlyingShuriken>();
  private readonly bladeMat: StandardMaterial;
  private template: Mesh | null = null;

  constructor(private readonly scene: Scene) {
    this.bladeMat = new StandardMaterial("shurikenMat", scene);
    this.bladeMat.diffuseColor = new Color3(0.62, 0.66, 0.7);
    this.bladeMat.specularColor = new Color3(0.9, 0.9, 0.95);
    this.bladeMat.specularPower = 96;
  }

  /**
   * One four-pointed star, built once and cloned per throw: two crossed blades and a hub, lying
   * in the node's XZ plane so spinning about Y reads as the classic flat sawing spin.
   */
  private getTemplate(): Mesh {
    if (this.template) return this.template;

    const blade = MeshBuilder.CreateBox("shurikenBlade", { width: 0.26, height: 0.012, depth: 0.05 }, this.scene);
    const cross = MeshBuilder.CreateBox("shurikenBladeCross", { width: 0.05, height: 0.012, depth: 0.26 }, this.scene);
    const hub = MeshBuilder.CreateBox("shurikenHub", { width: 0.07, height: 0.016, depth: 0.07 }, this.scene);
    cross.parent = blade;
    hub.parent = blade;
    blade.material = this.bladeMat;
    cross.material = this.bladeMat;
    hub.material = this.bladeMat;
    blade.isPickable = false;
    cross.isPickable = false;
    hub.isPickable = false;
    blade.setEnabled(false);

    this.template = blade;
    return blade;
  }

  spawn(id: string, origin: Vector3, direction: Vector3): void {
    if (this.inFlight.has(id)) return;

    const root = new TransformNode(`shuriken-${id}`, this.scene);
    root.position.copyFrom(origin);

    const star = this.getTemplate().clone(`shurikenMesh-${id}`);
    star.setEnabled(true);
    star.parent = root;

    this.inFlight.set(id, { root, dir: direction.normalizeToNew(), age: 0 });
  }

  /** Retires a star the server has resolved, leaving a small spark where it struck. */
  retire(id: string, at: Vector3, hit: boolean): void {
    const entry = this.inFlight.get(id);
    if (!entry) return;
    if (hit) this.spark(at);
    entry.root.dispose(false, true);
    this.inFlight.delete(id);
  }

  private spark(at: Vector3): void {
    const spark = MeshBuilder.CreateSphere("shurikenSpark", { diameter: 0.16, segments: 6 }, this.scene);
    const mat = new StandardMaterial("shurikenSparkMat", this.scene);
    mat.diffuseColor = new Color3(0.9, 0.85, 0.6);
    mat.emissiveColor = new Color3(0.8, 0.7, 0.3);
    spark.material = mat;
    spark.position.copyFrom(at);
    spark.isPickable = false;
    setTimeout(() => spark.dispose(false, true), 90);
  }

  update(deltaSeconds: number): void {
    for (const [id, entry] of this.inFlight) {
      entry.age += deltaSeconds;
      if (entry.age >= MAX_LIFETIME_SECONDS) {
        entry.root.dispose(false, true);
        this.inFlight.delete(id);
        continue;
      }
      const step = SHURIKEN_SPEED * deltaSeconds;
      entry.root.position.addInPlace(entry.dir.scale(step));
      entry.root.rotation.y += SPIN_RATE * deltaSeconds;
    }
  }

  dispose(): void {
    for (const entry of this.inFlight.values()) entry.root.dispose(false, true);
    this.inFlight.clear();
    this.template?.dispose(false, true);
  }
}

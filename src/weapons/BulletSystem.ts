import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, Ray } from "@babylonjs/core";
import { Damageable } from "../world/Damageable";

interface ActiveBullet {
  mesh: Mesh;
  direction: Vector3;
  speed: number;
  distanceTraveled: number;
  maxDistance: number;
  damage: number;
  weaponName: string;
}

/** Manages visible bullet projectiles: moves them each frame and resolves hits via a swept ray. */
export class BulletSystem {
  private readonly bullets: ActiveBullet[] = [];
  private readonly material: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.material = new StandardMaterial("bulletMat", scene);
    this.material.emissiveColor = new Color3(1, 0.85, 0.3);
    this.material.diffuseColor = new Color3(1, 0.85, 0.3);
  }

  spawn(
    origin: Vector3,
    direction: Vector3,
    damage: number,
    weaponName: string,
    speed = 250,
    maxDistance = 500,
  ): void {
    const mesh = MeshBuilder.CreateSphere("bullet", { diameter: 0.04, segments: 6 }, this.scene);
    mesh.material = this.material;
    mesh.position.copyFrom(origin);
    mesh.isPickable = false;

    this.bullets.push({
      mesh,
      direction: direction.normalize(),
      speed,
      distanceTraveled: 0,
      maxDistance,
      damage,
      weaponName,
    });
  }

  update(deltaSeconds: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      const step = bullet.speed * deltaSeconds;

      const ray = new Ray(bullet.mesh.position, bullet.direction, step);
      const hit = this.scene.pickWithRay(ray);
      if (hit?.pickedMesh) {
        const metadata = hit.pickedMesh.metadata as { damageable?: Damageable } | null;
        metadata?.damageable?.takeDamage(bullet.damage);
        console.log(`${bullet.weaponName} hit ${hit.pickedMesh.name} for ${bullet.damage} damage`);
        this.removeBullet(i);
        continue;
      }

      bullet.mesh.position.addInPlace(bullet.direction.scale(step));
      bullet.distanceTraveled += step;
      if (bullet.distanceTraveled >= bullet.maxDistance) {
        this.removeBullet(i);
      }
    }
  }

  private removeBullet(index: number): void {
    this.bullets[index].mesh.dispose();
    this.bullets.splice(index, 1);
  }
}

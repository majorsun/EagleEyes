import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { spawnDebris } from "./debris";

const LERP_RATE = 12;
const CRUMBLE_DURATION = 0.4;
const CRUMBLE_SINK_SPEED = 1.5;

/** Placeholder visual for a remote player — smoothly lerps toward the latest known server position each frame. */
export class RemotePlayerView {
  readonly mesh: Mesh;
  private readonly debrisMat: StandardMaterial;
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
  ) {
    this.mesh = MeshBuilder.CreateCapsule("remotePlayer", { height: 1.8, radius: 0.4 }, scene);
    this.mesh.position = new Vector3(x, y, z);
    this.mesh.rotation.y = rotY;

    const material = new StandardMaterial("remotePlayerMat", scene);
    material.diffuseColor = new Color3(0.2, 0.5, 0.85);
    this.mesh.material = material;

    this.debrisMat = new StandardMaterial("remotePlayerDebrisMat", scene);
    this.debrisMat.diffuseColor = new Color3(0.15, 0.25, 0.4);

    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    this.targetRotY = rotY;
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

  private crumble(): void {
    this.isDeadState = true;
    this.crumbleElapsed = 0;
    spawnDebris(this.scene, this.mesh.position.clone(), this.debrisMat, "playerDebris", 10);
  }

  private reset(x: number, y: number, z: number, rotY: number): void {
    this.isDeadState = false;
    this.mesh.scaling.set(1, 1, 1);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = rotY;
    this.mesh.setEnabled(true);
    this.setTarget(x, y, z, rotY);
  }

  update(deltaSeconds: number): void {
    if (this.isDeadState) {
      // Shrink and sink into the ground over CRUMBLE_DURATION, then hide -- the spawned
      // debris chunks (from crumble()) carry the rest of the visual weight after that.
      this.crumbleElapsed += deltaSeconds;
      const scale = Math.max(0, 1 - this.crumbleElapsed / CRUMBLE_DURATION);
      this.mesh.scaling.set(scale, scale, scale);
      this.mesh.position.y -= deltaSeconds * CRUMBLE_SINK_SPEED;
      if (scale <= 0) this.mesh.setEnabled(false);
      return;
    }

    const t = Math.min(1, deltaSeconds * LERP_RATE);
    this.mesh.position.x += (this.targetX - this.mesh.position.x) * t;
    this.mesh.position.y += (this.targetY - this.mesh.position.y) * t;
    this.mesh.position.z += (this.targetZ - this.mesh.position.z) * t;
    this.mesh.rotation.y += (this.targetRotY - this.mesh.rotation.y) * t;
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

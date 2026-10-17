import { Scene, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";

/** Scatters small chunks outward from a point under fake gravity, self-disposing after ~1.2s. */
export function spawnDebris(scene: Scene, origin: Vector3, material: StandardMaterial, namePrefix: string, chunkCount = 8): void {
  const engine = scene.getEngine();

  for (let i = 0; i < chunkCount; i++) {
    const chunk = MeshBuilder.CreateBox(`${namePrefix}${i}`, { size: 0.12 + Math.random() * 0.18 }, scene);
    chunk.material = material;
    chunk.isPickable = false;
    chunk.position = origin.add(
      new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.3),
    );

    const velocity = new Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1.5, (Math.random() - 0.5) * 4);
    const spin = new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const bornAt = performance.now();

    const observer = scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime() / 1000;
      velocity.y -= 9.8 * dt;
      chunk.position.addInPlace(velocity.scale(dt));
      chunk.rotation.x += spin.x * dt;
      chunk.rotation.y += spin.y * dt;
      chunk.rotation.z += spin.z * dt;

      if (performance.now() - bornAt > 1200) {
        scene.onBeforeRenderObservable.remove(observer);
        chunk.dispose();
      }
    });
  }
}

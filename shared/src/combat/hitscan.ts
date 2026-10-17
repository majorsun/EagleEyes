export interface HitTarget {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface HitResult {
  targetId: string;
  distance: number;
}

/**
 * Closest-point-on-segment-to-sphere-center test against every candidate, picking the nearest hit
 * along the ray. Direction must already be normalized.
 */
export function raycastClosestHit(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
  targets: HitTarget[],
): HitResult | null {
  let closest: HitResult | null = null;

  for (const target of targets) {
    const toTargetX = target.x - originX;
    const toTargetY = target.y - originY;
    const toTargetZ = target.z - originZ;
    const tClosest = Math.max(0, Math.min(maxDistance, toTargetX * dirX + toTargetY * dirY + toTargetZ * dirZ));

    const closestX = originX + dirX * tClosest;
    const closestY = originY + dirY * tClosest;
    const closestZ = originZ + dirZ * tClosest;

    const dx = target.x - closestX;
    const dy = target.y - closestY;
    const dz = target.z - closestZ;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq <= target.radius * target.radius && (!closest || tClosest < closest.distance)) {
      closest = { targetId: target.id, distance: tClosest };
    }
  }

  return closest;
}

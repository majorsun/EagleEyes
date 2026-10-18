export interface CapsuleTarget {
  kind: "capsule";
  id: string;
  /** Vertical spine from (x, yBottom, z) to (x, yTop, z); axis is always world-up. */
  x: number;
  z: number;
  yBottom: number;
  yTop: number;
  radius: number;
}

export interface BoxTarget {
  kind: "box";
  id: string;
  /** Box center. */
  x: number;
  y: number;
  z: number;
  /** Yaw rotation about Y, matching the rendered mesh's rotation.y. */
  rotY: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
}

export type HitTarget = CapsuleTarget | BoxTarget;

export interface HitResult {
  targetId: string;
  distance: number;
}

/**
 * Casts a ray against a mix of capsule and oriented-box targets shaped to match what's actually
 * rendered (player capsules, enemy silhouette boxes) instead of one oversized sphere per target,
 * and returns the nearest hit along the ray.
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
    const distance =
      target.kind === "capsule"
        ? raycastCapsule(originX, originY, originZ, dirX, dirY, dirZ, maxDistance, target)
        : raycastBox(originX, originY, originZ, dirX, dirY, dirZ, maxDistance, target);

    if (distance !== null && (!closest || distance < closest.distance)) {
      closest = { targetId: target.id, distance };
    }
  }

  return closest;
}

/**
 * Approximates capsule intersection by finding the closest approach between the ray and the
 * capsule's vertical spine segment, then testing that distance against the radius -- the same
 * closest-point simplification the old sphere test used, generalized from a point to a segment.
 */
function raycastCapsule(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
  capsule: CapsuleTarget,
): number | null {
  const { s, distSq } = closestPointsBetweenSegments(
    originX,
    originY,
    originZ,
    originX + dirX * maxDistance,
    originY + dirY * maxDistance,
    originZ + dirZ * maxDistance,
    capsule.x,
    capsule.yBottom,
    capsule.z,
    capsule.x,
    capsule.yTop,
    capsule.z,
  );

  if (distSq > capsule.radius * capsule.radius) return null;
  return s * maxDistance;
}

/** Exact ray-vs-oriented-box (slab method), computed in the box's local, unrotated space. */
function raycastBox(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
  box: BoxTarget,
): number | null {
  const relX = originX - box.x;
  const relZ = originZ - box.z;

  // Rotate the ray into the box's local frame by -rotY (box's own axes are world-aligned there).
  const cos = Math.cos(-box.rotY);
  const sin = Math.sin(-box.rotY);
  const localOriginX = relX * cos - relZ * sin;
  const localOriginZ = relX * sin + relZ * cos;
  const localOriginY = originY - box.y;
  const localDirX = dirX * cos - dirZ * sin;
  const localDirZ = dirX * sin + dirZ * cos;

  let interval: [number, number] | null = [0, maxDistance];
  interval = clipSlab(localOriginX, localDirX, -box.halfWidth, box.halfWidth, interval);
  interval = clipSlab(localOriginY, dirY, -box.halfHeight, box.halfHeight, interval);
  interval = clipSlab(localOriginZ, localDirZ, -box.halfDepth, box.halfDepth, interval);

  return interval === null ? null : interval[0];
}

/** Narrows a [tMin, tMax] interval against one axis-aligned slab; null once the interval is empty. */
function clipSlab(
  origin: number,
  dir: number,
  min: number,
  max: number,
  interval: [number, number] | null,
): [number, number] | null {
  if (interval === null) return null;
  const [tMin, tMax] = interval;

  const EPS = 1e-9;
  if (Math.abs(dir) < EPS) {
    return origin < min || origin > max ? null : interval;
  }

  let t1 = (min - origin) / dir;
  let t2 = (max - origin) / dir;
  if (t1 > t2) [t1, t2] = [t2, t1];

  const newMin = Math.max(tMin, t1);
  const newMax = Math.min(tMax, t2);
  return newMin <= newMax ? [newMin, newMax] : null;
}

/**
 * Closest points between two line segments (Ericson, "Real-Time Collision Detection" 5.1.9).
 * Returns s/t in [0, 1] (fractions along segment 1 / segment 2) and the squared distance between
 * the closest points.
 */
function closestPointsBetweenSegments(
  p1x: number,
  p1y: number,
  p1z: number,
  q1x: number,
  q1y: number,
  q1z: number,
  p2x: number,
  p2y: number,
  p2z: number,
  q2x: number,
  q2y: number,
  q2z: number,
): { s: number; t: number; distSq: number } {
  const EPS = 1e-9;
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;

  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;

  let s: number;
  let t: number;

  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  const c1x = p1x + d1x * s, c1y = p1y + d1y * s, c1z = p1z + d1z * s;
  const c2x = p2x + d2x * t, c2y = p2y + d2y * t, c2z = p2z + d2z * t;
  const dx = c1x - c2x, dy = c1y - c2y, dz = c1z - c2z;

  return { s, t, distSq: dx * dx + dy * dy + dz * dz };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

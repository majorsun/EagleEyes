import { PLAYER_HIT_RADIUS, PLAYER_HIT_HALF_HEIGHT } from "../movement/constants";

export const SHURIKEN_SPEED = 16;
/** Metres a shuriken travels before dropping out of the world. */
export const SHURIKEN_MAX_RANGE = 24;
export const SHURIKEN_DAMAGE = 7;
/** Collision radius of the star itself, added to the player capsule's. */
export const SHURIKEN_RADIUS = 0.25;
/** Height above the enemy's centre that the star leaves the hand. */
export const SHURIKEN_LAUNCH_HEIGHT = 0.35;
/** Where on a player a ninja aims: below the eye position, around the chest. */
export const SHURIKEN_AIM_DROP = 0.6;

export interface ShurikenState {
  id: string;
  enemyId: string;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  travelled: number;
}

/** A player a shuriken can hit. y is the player's eye height, matching PlayerState. */
export interface ShurikenTarget {
  sessionId: string;
  x: number;
  y: number;
  z: number;
}

export type ShurikenOutcome =
  | { type: "flying"; state: ShurikenState }
  | { type: "hit"; x: number; y: number; z: number; targetSessionId: string; damage: number }
  | { type: "expired"; x: number; y: number; z: number };

export function createShuriken(
  id: string,
  enemyId: string,
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
): ShurikenState {
  const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z) || 1;
  return {
    id,
    enemyId,
    x: origin.x,
    y: origin.y,
    z: origin.z,
    dirX: direction.x / length,
    dirY: direction.y / length,
    dirZ: direction.z / length,
    travelled: 0,
  };
}

/**
 * Advances one shuriken and reports what became of it. Collision is a point-in-capsule test at the
 * step's end position rather than a swept one: at SHURIKEN_SPEED on a 60Hz tick a step is ~0.27m
 * against a combined radius of ~0.65m, so a star cannot pass through a player between ticks.
 */
export function stepShuriken(state: ShurikenState, targets: ShurikenTarget[], dt: number): ShurikenOutcome {
  const step = SHURIKEN_SPEED * dt;
  const next: ShurikenState = {
    ...state,
    x: state.x + state.dirX * step,
    y: state.y + state.dirY * step,
    z: state.z + state.dirZ * step,
    travelled: state.travelled + step,
  };

  const reach = PLAYER_HIT_RADIUS + SHURIKEN_RADIUS;
  for (const target of targets) {
    const dx = next.x - target.x;
    const dz = next.z - target.z;
    if (dx * dx + dz * dz > reach * reach) continue;
    if (next.y < target.y - PLAYER_HIT_HALF_HEIGHT - SHURIKEN_RADIUS) continue;
    if (next.y > target.y + PLAYER_HIT_HALF_HEIGHT + SHURIKEN_RADIUS) continue;
    return { type: "hit", x: next.x, y: next.y, z: next.z, targetSessionId: target.sessionId, damage: SHURIKEN_DAMAGE };
  }

  if (next.travelled >= SHURIKEN_MAX_RANGE) {
    return { type: "expired", x: next.x, y: next.y, z: next.z };
  }
  return { type: "flying", state: next };
}

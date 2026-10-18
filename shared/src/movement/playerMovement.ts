import {
  GROUND_EYE_HEIGHT,
  PLAYER_SPEED,
  MOAT_WIDTH,
  MOAT_CENTER_Z,
  MOAT_FLOOR_Y,
  JUMP_SPEED,
  GRAVITY_ACCEL,
  MAX_JUMPS,
  SLIDE_DISTANCE,
  SLIDE_SPEED,
  PRONE_EYE_DROP,
  PRONE_LEDGE_EYE_OFFSET,
  PRONE_LEDGE_SNAP_RANGE,
  HILL_SPEED_MULTIPLIER,
  SPAWN_PLATFORM_POSITION,
  TELEPORT_PLATFORM_POSITION,
} from "./constants";
import { HillInfo, LedgePoint, TerrainData } from "./terrain";

export interface PlayerPhysicsState {
  x: number;
  y: number;
  z: number;
  velocityY: number;
  isJumping: boolean;
  /** Jumps used since last touching the ground; reset to 0 on landing. */
  jumpCount: number;
  isSliding: boolean;
  slideDirX: number;
  slideDirZ: number;
  slideRemaining: number;
  isProne: boolean;
  isAtOutpost: boolean;
}

export interface PlayerInput {
  moveX: number;
  moveZ: number;
  yaw: number;
}

export function createSpawnPhysicsState(): PlayerPhysicsState {
  return {
    x: SPAWN_PLATFORM_POSITION.x,
    y: GROUND_EYE_HEIGHT,
    z: SPAWN_PLATFORM_POSITION.z,
    velocityY: 0,
    isJumping: false,
    jumpCount: 0,
    isSliding: false,
    slideDirX: 0,
    slideDirZ: 0,
    slideRemaining: 0,
    isProne: false,
    isAtOutpost: false,
  };
}

export function findHillUnderPlayer(x: number, z: number, hills: HillInfo[]): HillInfo | null {
  for (const hill of hills) {
    const dx = x - hill.centerX;
    const dz = z - hill.centerZ;
    if (dx * dx + dz * dz <= hill.radius * hill.radius) return hill;
  }
  return null;
}

export function hillSurfaceY(hill: HillInfo, x: number, z: number): number {
  const dx = x - hill.centerX;
  const dz = z - hill.centerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const heightFraction = Math.sqrt(Math.max(0, 1 - (dist / hill.radius) ** 2));
  return hill.centerY + hill.height * heightFraction;
}

function isOverMoat(z: number): boolean {
  return Math.abs(z - MOAT_CENTER_Z) <= MOAT_WIDTH / 2;
}

/** Terrain surface height (not eye height) at a point: hill dome, sunken moat floor, or flat ground. */
export function groundSurfaceHeightAt(x: number, z: number, terrain: TerrainData): number {
  if (isOverMoat(z)) return MOAT_FLOOR_Y;
  const hill = findHillUnderPlayer(x, z, terrain.hills);
  if (hill) return hillSurfaceY(hill, x, z);
  return 0;
}

export function findNearestLedge(x: number, z: number, ledges: LedgePoint[]): LedgePoint | null {
  let nearest: LedgePoint | null = null;
  let nearestDistSq = Infinity;
  for (const ledge of ledges) {
    const dx = x - ledge.x;
    const dz = z - ledge.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = ledge;
    }
  }
  return nearest && nearestDistSq <= PRONE_LEDGE_SNAP_RANGE * PRONE_LEDGE_SNAP_RANGE ? nearest : null;
}

function unprone(state: PlayerPhysicsState): PlayerPhysicsState {
  if (!state.isProne) return state;
  return { ...state, isProne: false, y: GROUND_EYE_HEIGHT };
}

/** Double jump: allows one jump from the ground plus one more mid-air; a third press is ignored until landing. */
export function triggerJump(state: PlayerPhysicsState): PlayerPhysicsState {
  if (state.jumpCount >= MAX_JUMPS) return state;
  const next = unprone(state);
  return { ...next, isJumping: true, velocityY: JUMP_SPEED, jumpCount: next.jumpCount + 1 };
}

export function triggerSlide(state: PlayerPhysicsState, yaw: number): PlayerPhysicsState {
  if (state.isSliding) return state;
  const next = unprone(state);
  return {
    ...next,
    isSliding: true,
    slideDirX: Math.sin(yaw),
    slideDirZ: Math.cos(yaw),
    slideRemaining: SLIDE_DISTANCE,
  };
}

export function toggleProne(state: PlayerPhysicsState, terrain: TerrainData): PlayerPhysicsState {
  if (state.isProne) return unprone(state);

  const ledge = findNearestLedge(state.x, state.z, terrain.ledges);
  if (ledge) {
    return { ...state, isProne: true, x: ledge.x, z: ledge.z, y: ledge.y + PRONE_LEDGE_EYE_OFFSET };
  }
  return { ...state, isProne: true, y: state.y - PRONE_EYE_DROP };
}

export function teleport(state: PlayerPhysicsState): PlayerPhysicsState {
  const isAtOutpost = !state.isAtOutpost;
  const destination = isAtOutpost ? TELEPORT_PLATFORM_POSITION : SPAWN_PLATFORM_POSITION;
  return {
    ...state,
    isAtOutpost,
    x: destination.x,
    z: destination.z,
    y: GROUND_EYE_HEIGHT,
    isJumping: false,
    jumpCount: 0,
    velocityY: 0,
    isSliding: false,
    isProne: false,
  };
}

/** Continuous per-tick integrator: horizontal movement, jump arc, slide, hill-walking, prone lock. */
export function stepMovement(
  state: PlayerPhysicsState,
  input: PlayerInput,
  terrain: TerrainData,
  dt: number,
): PlayerPhysicsState {
  const hasMovementInput = input.moveX !== 0 || input.moveZ !== 0;
  let next = hasMovementInput ? unprone(state) : state;

  let x = next.x;
  let z = next.z;

  if (!next.isProne) {
    const onHill = findHillUnderPlayer(x, z, terrain.hills) !== null;
    const speed = PLAYER_SPEED * (onHill ? HILL_SPEED_MULTIPLIER : 1);

    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);

    let dx = input.moveX * rightX + input.moveZ * forwardX;
    let dz = input.moveX * rightZ + input.moveZ * forwardZ;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length > 1) {
      dx /= length;
      dz /= length;
    }
    x += dx * speed * dt;
    z += dz * speed * dt;
  }

  let slideRemaining = next.slideRemaining;
  let isSliding = next.isSliding;
  if (isSliding) {
    const step = Math.min(SLIDE_SPEED * dt, slideRemaining);
    x += next.slideDirX * step;
    z += next.slideDirZ * step;
    slideRemaining -= step;
    if (slideRemaining <= 0) isSliding = false;
  }

  let y = next.y;
  let velocityY = next.velocityY;
  let isJumping = next.isJumping;
  let jumpCount = next.jumpCount;
  if (isJumping) {
    velocityY += GRAVITY_ACCEL * dt;
    y += velocityY * dt;
    const groundY = groundSurfaceHeightAt(x, z, terrain) + GROUND_EYE_HEIGHT;
    if (velocityY <= 0 && y <= groundY) {
      y = groundY;
      velocityY = 0;
      isJumping = false;
      jumpCount = 0;
    }
  } else if (!next.isProne) {
    y = groundSurfaceHeightAt(x, z, terrain) + GROUND_EYE_HEIGHT;
    jumpCount = 0;
  }

  return { ...next, x, y, z, velocityY, isJumping, jumpCount, isSliding, slideRemaining };
}

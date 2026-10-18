import { MIN_ENEMY_SEPARATION } from "../movement/constants";

export interface SpawnArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface EnemyAIConfig {
  maxHealth: number;
  respawnDelayMs: number;
  spawnArea: SpawnArea;
  /** Y position of the enemy's center, i.e. half its height above the ground. */
  groundY: number;
  chaseSpeed: number;
  attackRange: number;
  attackDamage: number;
  attackIntervalMs: number;
}

export interface EnemyAIState {
  x: number;
  y: number;
  z: number;
  rotY: number;
  health: number;
  broken: boolean;
  lastAttackTime: number;
  respawnAt: number | null;
}

export interface LivingPlayer {
  sessionId: string;
  x: number;
  z: number;
  /** Airborne players (mid-jump) can't be melee-attacked, even if an enemy is chasing them. */
  isJumping: boolean;
}

export type EnemyAIEvent =
  | { type: "attack"; targetSessionId: string; damage: number }
  | { type: "broken"; x: number; y: number; z: number }
  | { type: "respawned" };

export interface EnemyAIResult {
  state: EnemyAIState;
  events: EnemyAIEvent[];
}

function randomSpawnPosition(spawnArea: SpawnArea, rng: () => number): { x: number; z: number } {
  const { minX, maxX, minZ, maxZ } = spawnArea;
  return { x: minX + rng() * (maxX - minX), z: minZ + rng() * (maxZ - minZ) };
}

export function createEnemyAIState(config: EnemyAIConfig, rng: () => number): EnemyAIState {
  const pos = randomSpawnPosition(config.spawnArea, rng);
  return {
    x: pos.x,
    y: config.groundY,
    z: pos.z,
    rotY: 0,
    health: config.maxHealth,
    broken: false,
    lastAttackTime: 0,
    respawnAt: null,
  };
}

function findNearestLivingPlayer(state: EnemyAIState, players: LivingPlayer[]): LivingPlayer | null {
  let nearest: LivingPlayer | null = null;
  let nearestDistSq = Infinity;
  for (const player of players) {
    const dx = player.x - state.x;
    const dz = player.z - state.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = player;
    }
  }
  return nearest;
}

/** Chases the nearest living player when out of range, otherwise attacks on a cooldown. Call every server tick. */
export function stepEnemyAI(
  state: EnemyAIState,
  config: EnemyAIConfig,
  players: LivingPlayer[],
  now: number,
  dt: number,
  rng: () => number,
): EnemyAIResult {
  if (state.broken) {
    if (state.respawnAt !== null && now >= state.respawnAt) {
      return { state: createEnemyAIState(config, rng), events: [{ type: "respawned" }] };
    }
    return { state, events: [] };
  }

  const nearest = findNearestLivingPlayer(state, players);
  if (!nearest) return { state, events: [] };

  const dx = nearest.x - state.x;
  const dz = nearest.z - state.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance < 1e-4) return { state, events: [] };

  if (distance > config.attackRange) {
    const dirX = dx / distance;
    const dirZ = dz / distance;
    return {
      state: {
        ...state,
        x: state.x + dirX * config.chaseSpeed * dt,
        z: state.z + dirZ * config.chaseSpeed * dt,
        rotY: Math.atan2(dirX, dirZ),
      },
      events: [],
    };
  }

  // In range but jumping: let the enemy keep waiting (don't consume the cooldown) so it can land
  // the hit the instant the player touches back down, instead of resetting the timer for nothing.
  if (nearest.isJumping) return { state, events: [] };

  if (now - state.lastAttackTime >= config.attackIntervalMs) {
    return {
      state: { ...state, lastAttackTime: now },
      events: [{ type: "attack", targetSessionId: nearest.sessionId, damage: config.attackDamage }],
    };
  }
  return { state, events: [] };
}

export function applyDamageToEnemy(state: EnemyAIState, config: EnemyAIConfig, amount: number, now: number): EnemyAIResult {
  if (state.broken) return { state, events: [] };

  const health = state.health - amount;
  if (health <= 0) {
    return {
      state: { ...state, health, broken: true, respawnAt: now + config.respawnDelayMs },
      events: [{ type: "broken", x: state.x, y: state.y, z: state.z }],
    };
  }
  return { state: { ...state, health }, events: [] };
}

/**
 * Pushes intact enemies apart in the XZ plane so no two ever sit closer than MIN_ENEMY_SEPARATION
 * (e.g. several converging on the same player). Several relaxation passes let a push away from
 * one neighbor settle against the others instead of re-violating them; cheap for the enemy counts
 * this game uses.
 */
export function separateEnemies(states: EnemyAIState[], rng: () => number): EnemyAIState[] {
  const next = states.map((state) => ({ ...state }));

  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < next.length; i++) {
      if (next[i].broken) continue;
      for (let j = i + 1; j < next.length; j++) {
        if (next[j].broken) continue;

        const dx = next[j].x - next[i].x;
        const dz = next[j].z - next[i].z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist >= MIN_ENEMY_SEPARATION) continue;

        let dirX: number;
        let dirZ: number;
        if (dist < 1e-6) {
          const angle = rng() * Math.PI * 2;
          dirX = Math.cos(angle);
          dirZ = Math.sin(angle);
        } else {
          dirX = dx / dist;
          dirZ = dz / dist;
        }

        const pushEach = (MIN_ENEMY_SEPARATION - dist) / 2;
        next[i].x -= dirX * pushEach;
        next[i].z -= dirZ * pushEach;
        next[j].x += dirX * pushEach;
        next[j].z += dirZ * pushEach;
      }
    }
  }

  return next;
}

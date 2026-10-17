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

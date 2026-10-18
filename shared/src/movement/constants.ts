export const GROUND_EYE_HEIGHT = 1.8;

/** Tuned to match the original Babylon camera.speed=0.3 feel; validated by playtest. */
export const PLAYER_SPEED = 6;

export const SPAWN_PLATFORM_POSITION = { x: 0, z: -10 };
// Beyond the fog's fully-opaque distance (100 units) from spawn, so neither platform is visible from the other.
export const TELEPORT_PLATFORM_POSITION = { x: 0, z: 160 };

export const SPAWN_POSITION = { x: SPAWN_PLATFORM_POSITION.x, y: GROUND_EYE_HEIGHT, z: SPAWN_PLATFORM_POSITION.z };

/** Fixed so server and client scatter identical hills/dunes/ledges. */
export const WORLD_SEED = 1337;

// Width of the impassable gap between the two ground halves, directly between the platforms.
export const MOAT_WIDTH = 10;
export const MOAT_CENTER_Z = (SPAWN_PLATFORM_POSITION.z + TELEPORT_PLATFORM_POSITION.z) / 2;
export const MOAT_FLOOR_Y = -5;

export const JUMP_SPEED = 6;
export const GRAVITY_ACCEL = -18;
/** Double jump: one jump from the ground, one more while airborne; resets on landing. */
export const MAX_JUMPS = 2;

export const SLIDE_DISTANCE = 0.5;
export const SLIDE_SPEED = 10;

export const PRONE_EYE_DROP = 1.2;
export const PRONE_LEDGE_EYE_OFFSET = 0.4;
export const PRONE_LEDGE_SNAP_RANGE = 40;

export const HILL_SPEED_MULTIPLIER = 0.75;

export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_RESPAWN_DELAY_MS = 2500;
/** Grace period after respawning during which the player takes no damage from anything. */
export const RESPAWN_INVINCIBILITY_MS = 3000;
/** Passive health regen, always ticking while alive, even outside the respawn grace period. */
export const PLAYER_REGEN_PER_SECOND = 5;

export const ENEMY_COUNT = 3;
/** Minimum center-to-center distance enemies are pushed apart to (1/4 of a world unit). */
export const MIN_ENEMY_SEPARATION = 0.25;

export const MAX_BULLET_RANGE = 500;
/** Generous tolerance for the client-reported muzzle origin vs. its authoritative eye position. */
export const FIRE_ORIGIN_TOLERANCE = 3;

/** Matches RemotePlayerView's capsule mesh (height 1.8, radius 0.4), centered on player.y. */
export const PLAYER_HIT_RADIUS = 0.4;
export const PLAYER_HIT_HALF_HEIGHT = 0.9;

/** Matches EnemyView's box mesh (width 1, height 1.6, depth 0.2), centered on enemy.y. */
export const ENEMY_HIT_HALF_WIDTH = 0.5;
export const ENEMY_HIT_HALF_HEIGHT = 0.8;
export const ENEMY_HIT_HALF_DEPTH = 0.1;

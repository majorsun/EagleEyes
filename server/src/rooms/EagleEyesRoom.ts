import { Room, Client } from "colyseus";
import {
  EagleEyesRoomState,
  PlayerState,
  EnemyState,
  ClientMessage,
  ServerEvent,
  type InputPayload,
  type FirePayload,
  stepMovement,
  triggerJump,
  triggerSlide,
  toggleProne,
  teleport,
  createSpawnPhysicsState,
  type PlayerPhysicsState,
  generateTerrain,
  type TerrainData,
  createEnemyAIState,
  stepEnemyAI,
  separateEnemies,
  applyDamageToEnemy,
  type EnemyAIState,
  type EnemyAIConfig,
  raycastClosestHit,
  type HitTarget,
  createDefaultSniper,
  Sniper,
  isInPvpZone,
  WORLD_SEED,
  TELEPORT_PLATFORM_POSITION,
  SPAWN_POSITION,
  PLAYER_MAX_HEALTH,
  PLAYER_RESPAWN_DELAY_MS,
  RESPAWN_INVINCIBILITY_MS,
  PLAYER_REGEN_PER_SECOND,
  ENEMY_COUNT,
  MAX_BULLET_RANGE,
  FIRE_ORIGIN_TOLERANCE,
  PLAYER_HIT_RADIUS,
  PLAYER_HIT_HALF_HEIGHT,
  ENEMY_HIT_HALF_WIDTH,
  ENEMY_HIT_HALF_HEIGHT,
  ENEMY_HIT_HALF_DEPTH,
} from "@eagleeyes/shared";

const DEFAULT_ENEMY_CONFIG: EnemyAIConfig = {
  maxHealth: 100,
  respawnDelayMs: 3000,
  spawnArea: { minX: -15, maxX: 15, minZ: -5, maxZ: 20 },
  groundY: 0.8,
  chaseSpeed: 3,
  attackRange: 2.2,
  attackDamage: 10,
  attackIntervalMs: 700,
};

const DEFAULT_INPUT: InputPayload = { moveX: 0, moveZ: 0, yaw: 0, seq: 0 };

export class EagleEyesRoom extends Room<{ state: EagleEyesRoomState }> {
  private readonly terrain: TerrainData = generateTerrain(
    WORLD_SEED,
    TELEPORT_PLATFORM_POSITION.x,
    TELEPORT_PLATFORM_POSITION.z,
  );
  private readonly latestInputs = new Map<string, InputPayload>();
  private readonly physics = new Map<string, PlayerPhysicsState>();
  private readonly playerRespawnAt = new Map<string, number>();
  private readonly playerInvincibleUntil = new Map<string, number>();
  private readonly enemies = new Map<string, EnemyAIState>();
  private readonly snipers = new Map<string, Sniper>();

  onCreate(): void {
    this.setState(new EagleEyesRoomState());

    for (let i = 0; i < ENEMY_COUNT; i++) {
      const enemyId = `enemy-${i}`;
      const aiState = createEnemyAIState(DEFAULT_ENEMY_CONFIG, Math.random);
      this.enemies.set(enemyId, aiState);

      const enemy = new EnemyState();
      enemy.enemyId = enemyId;
      enemy.x = aiState.x;
      enemy.y = aiState.y;
      enemy.z = aiState.z;
      enemy.rotY = aiState.rotY;
      enemy.health = aiState.health;
      enemy.broken = aiState.broken;
      this.state.enemies.set(enemyId, enemy);
    }

    this.onMessage(ClientMessage.Input, (client, message: InputPayload) => {
      this.latestInputs.set(client.sessionId, message);
    });
    this.onMessage(ClientMessage.Jump, (client) => {
      this.updatePhysics(client.sessionId, triggerJump);
    });
    this.onMessage(ClientMessage.Slide, (client) => {
      const input = this.latestInputs.get(client.sessionId) ?? DEFAULT_INPUT;
      this.updatePhysics(client.sessionId, (state) => triggerSlide(state, input.yaw));
    });
    this.onMessage(ClientMessage.ToggleProne, (client) => {
      this.updatePhysics(client.sessionId, (state) => toggleProne(state, this.terrain));
    });
    this.onMessage(ClientMessage.Teleport, (client) => {
      this.updatePhysics(client.sessionId, teleport);
    });
    this.onMessage(ClientMessage.Fire, (client, message: FirePayload) => {
      this.handleFire(client.sessionId, message);
    });
    this.onMessage(ClientMessage.Reload, (client) => {
      const player = this.state.players.get(client.sessionId);
      const sniper = this.snipers.get(client.sessionId);
      if (!player || !sniper || player.isDead) return;
      sniper.startReload(Date.now());
    });

    this.setFixedTimestep((ctx) => this.fixedTick(ctx.dt), 60);
  }

  onJoin(client: Client): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.x = SPAWN_POSITION.x;
    player.y = SPAWN_POSITION.y;
    player.z = SPAWN_POSITION.z;
    player.rotY = 0;
    player.health = PLAYER_MAX_HEALTH;
    this.state.players.set(client.sessionId, player);
    this.physics.set(client.sessionId, createSpawnPhysicsState());
    this.latestInputs.set(client.sessionId, DEFAULT_INPUT);
    this.snipers.set(client.sessionId, createDefaultSniper());
    console.log(`${client.sessionId} joined (${this.state.players.size} players)`);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.latestInputs.delete(client.sessionId);
    this.physics.delete(client.sessionId);
    this.playerRespawnAt.delete(client.sessionId);
    this.playerInvincibleUntil.delete(client.sessionId);
    this.snipers.delete(client.sessionId);
    console.log(`${client.sessionId} left (${this.state.players.size} players)`);
  }

  private updatePhysics(sessionId: string, transform: (state: PlayerPhysicsState) => PlayerPhysicsState): void {
    const current = this.physics.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!current || !player || player.isDead) return;
    this.physics.set(sessionId, transform(current));
  }

  private fixedTick(dt: number): void {
    const now = Date.now();

    for (const [sessionId, player] of this.state.players.entries()) {
      if (player.isDead) {
        const respawnAt = this.playerRespawnAt.get(sessionId);
        if (respawnAt !== undefined && now >= respawnAt) {
          this.respawnPlayer(sessionId, player, now);
        }
        continue;
      }

      const input = this.latestInputs.get(sessionId) ?? DEFAULT_INPUT;
      const current = this.physics.get(sessionId);
      if (!current) continue;

      const next = stepMovement(current, input, this.terrain, dt);
      this.physics.set(sessionId, next);

      player.x = next.x;
      player.y = next.y;
      player.z = next.z;
      player.rotY = input.yaw;
      player.isProne = next.isProne;
      player.lastProcessedSeq = input.seq;

      if (player.health < PLAYER_MAX_HEALTH) {
        player.health = Math.min(PLAYER_MAX_HEALTH, player.health + PLAYER_REGEN_PER_SECOND * dt);
      }

      // Resolves a completed reload even if the player hasn't fired/reloaded again since, so the
      // ammo count other clients see (and this player's own HUD) doesn't lag behind reality.
      const sniper = this.snipers.get(sessionId);
      if (sniper) {
        sniper.tick(now);
        player.ammo = sniper.currentAmmo;
      }
    }

    // Players past the moat are in the PvP zone -- enemies can't see or attack them there.
    const livingPlayers = [...this.state.players.entries()]
      .filter(([, p]) => !p.isDead && !isInPvpZone(p.z))
      .map(([sessionId, p]) => ({
        sessionId,
        x: p.x,
        z: p.z,
        isJumping: this.physics.get(sessionId)?.isJumping ?? false,
      }));

    const enemyIds = [...this.enemies.keys()];
    const stepResults = enemyIds.map((enemyId) =>
      stepEnemyAI(this.enemies.get(enemyId)!, DEFAULT_ENEMY_CONFIG, livingPlayers, now, dt, Math.random),
    );
    const separatedStates = separateEnemies(stepResults.map((r) => r.state), Math.random);

    enemyIds.forEach((enemyId, index) => {
      const state = separatedStates[index];
      const result = stepResults[index];
      this.enemies.set(enemyId, state);

      const enemy = this.state.enemies.get(enemyId);
      if (enemy) {
        enemy.x = state.x;
        enemy.y = state.y;
        enemy.z = state.z;
        enemy.rotY = state.rotY;
        enemy.health = state.health;
        enemy.broken = state.broken;
      }

      for (const event of result.events) {
        if (event.type === "attack") {
          this.damagePlayer(event.targetSessionId, event.damage, now);
          this.broadcast(ServerEvent.KnifeStab, { enemyId });
        } else if (event.type === "broken") {
          this.broadcast(ServerEvent.EnemyBroken, { enemyId, x: event.x, y: event.y, z: event.z });
        } else if (event.type === "respawned") {
          this.broadcast(ServerEvent.EnemyRespawned, { enemyId });
        }
      }
    });
  }

  private isInvincible(sessionId: string, now: number): boolean {
    const invincibleUntil = this.playerInvincibleUntil.get(sessionId);
    return invincibleUntil !== undefined && now < invincibleUntil;
  }

  private handleFire(sessionId: string, payload: FirePayload): void {
    const player = this.state.players.get(sessionId);
    const sniper = this.snipers.get(sessionId);
    if (!player || !sniper || player.isDead) return;
    if (this.isInvincible(sessionId, Date.now())) return;

    const originDx = payload.originX - player.x;
    const originDy = payload.originY - player.y;
    const originDz = payload.originZ - player.z;
    if (originDx * originDx + originDy * originDy + originDz * originDz > FIRE_ORIGIN_TOLERANCE * FIRE_ORIGIN_TOLERANCE) {
      return;
    }

    const dirLength = Math.sqrt(payload.dirX ** 2 + payload.dirY ** 2 + payload.dirZ ** 2);
    if (dirLength < 1e-4) return;
    const dirX = payload.dirX / dirLength;
    const dirY = payload.dirY / dirLength;
    const dirZ = payload.dirZ / dirLength;

    if (!sniper.fire(Date.now())) return;
    player.ammo = sniper.currentAmmo;

    const targets: HitTarget[] = [];
    for (const [otherId, other] of this.state.players.entries()) {
      if (otherId === sessionId || other.isDead) continue;
      targets.push({
        kind: "capsule",
        id: otherId,
        x: other.x,
        z: other.z,
        yBottom: other.y - PLAYER_HIT_HALF_HEIGHT,
        yTop: other.y + PLAYER_HIT_HALF_HEIGHT,
        radius: PLAYER_HIT_RADIUS,
      });
    }
    for (const [enemyId, enemy] of this.state.enemies.entries()) {
      if (enemy.broken) continue;
      targets.push({
        kind: "box",
        id: enemyId,
        x: enemy.x,
        y: enemy.y,
        z: enemy.z,
        rotY: enemy.rotY,
        halfWidth: ENEMY_HIT_HALF_WIDTH,
        halfHeight: ENEMY_HIT_HALF_HEIGHT,
        halfDepth: ENEMY_HIT_HALF_DEPTH,
      });
    }

    const hit = raycastClosestHit(payload.originX, payload.originY, payload.originZ, dirX, dirY, dirZ, MAX_BULLET_RANGE, targets);
    const now = Date.now();

    if (hit) {
      const enemyAI = this.enemies.get(hit.targetId);
      if (enemyAI) {
        const result = applyDamageToEnemy(enemyAI, DEFAULT_ENEMY_CONFIG, sniper.damage, now);
        this.enemies.set(hit.targetId, result.state);

        const enemySchema = this.state.enemies.get(hit.targetId);
        if (enemySchema) {
          enemySchema.health = result.state.health;
          enemySchema.broken = result.state.broken;
        }
        for (const event of result.events) {
          if (event.type === "broken") {
            this.broadcast(ServerEvent.EnemyBroken, { enemyId: hit.targetId, x: event.x, y: event.y, z: event.z });
          }
        }
      } else {
        this.damagePlayer(hit.targetId, sniper.damage, now);
      }
    }

    const travelDistance = hit?.distance ?? MAX_BULLET_RANGE;
    this.broadcast(ServerEvent.BulletFired, {
      originX: payload.originX,
      originY: payload.originY,
      originZ: payload.originZ,
      hitX: payload.originX + dirX * travelDistance,
      hitY: payload.originY + dirY * travelDistance,
      hitZ: payload.originZ + dirZ * travelDistance,
    });
  }

  private damagePlayer(sessionId: string, amount: number, now: number): void {
    const player = this.state.players.get(sessionId);
    if (!player || player.isDead) return;

    if (this.isInvincible(sessionId, now)) return;

    player.health = Math.max(0, player.health - amount);
    if (player.health <= 0) {
      player.isDead = true;
      this.playerRespawnAt.set(sessionId, now + PLAYER_RESPAWN_DELAY_MS);
    }
  }

  private respawnPlayer(sessionId: string, player: PlayerState, now: number): void {
    this.playerRespawnAt.delete(sessionId);
    this.playerInvincibleUntil.set(sessionId, now + RESPAWN_INVINCIBILITY_MS);
    player.health = PLAYER_MAX_HEALTH;
    player.isDead = false;
    player.x = SPAWN_POSITION.x;
    player.y = SPAWN_POSITION.y;
    player.z = SPAWN_POSITION.z;
    this.physics.set(sessionId, createSpawnPhysicsState());
  }
}

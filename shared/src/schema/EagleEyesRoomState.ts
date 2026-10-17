import { schema, t, type SchemaType } from "@colyseus/schema";

export const PlayerState = schema(
  {
    x: t.number(),
    y: t.number(),
    z: t.number(),
    rotY: t.number(),
    health: t.int16().default(100),
    isDead: t.boolean().default(false),
    isProne: t.boolean().default(false),
    isScoped: t.boolean().default(false),
    ammo: t.uint8().default(5),
    lastProcessedSeq: t.uint32().default(0),
    sessionId: t.string(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const EnemyState = schema(
  {
    x: t.number(),
    y: t.number(),
    z: t.number(),
    rotY: t.number(),
    health: t.int16().default(100),
    broken: t.boolean().default(false),
    enemyId: t.string(),
  },
  "EnemyState",
);
export type EnemyState = SchemaType<typeof EnemyState>;

export const EagleEyesRoomState = schema(
  {
    players: t.map(PlayerState),
    enemies: t.map(EnemyState),
  },
  "EagleEyesRoomState",
);
export type EagleEyesRoomState = SchemaType<typeof EagleEyesRoomState>;

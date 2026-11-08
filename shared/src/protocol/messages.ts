export const ClientMessage = {
  Input: "input",
  Jump: "jump",
  Slide: "slide",
  ToggleProne: "toggleProne",
  Teleport: "teleport",
  Fire: "fire",
  Reload: "reload",
  SetSkin: "setSkin",
} as const;

export interface InputPayload {
  moveX: number;
  moveZ: number;
  yaw: number;
  seq: number;
}

export interface SetSkinPayload {
  /** Index into PLAYER_SKINS; the server clamps it, so a bad value just falls back to 0. */
  skin: number;
}

export interface FirePayload {
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

export const ServerEvent = {
  KnifeStab: "knifeStab",
  EnemyBroken: "enemyBroken",
  EnemyRespawned: "enemyRespawned",
  BulletFired: "bulletFired",
  ShurikenThrown: "shurikenThrown",
  ShurikenGone: "shurikenGone",
} as const;

export interface KnifeStabEvent {
  enemyId: string;
}

export interface EnemyBrokenEvent {
  enemyId: string;
  x: number;
  y: number;
  z: number;
}

export interface EnemyRespawnedEvent {
  enemyId: string;
}

export interface ShurikenThrownEvent {
  id: string;
  enemyId: string;
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

/** Sent when a star stops existing, so clients can retire the one they are animating. */
export interface ShurikenGoneEvent {
  id: string;
  x: number;
  y: number;
  z: number;
  /** True if it struck a player, false if it simply ran out of range. */
  hit: boolean;
}

export interface BulletFiredEvent {
  originX: number;
  originY: number;
  originZ: number;
  hitX: number;
  hitY: number;
  hitZ: number;
}

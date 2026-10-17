export const ClientMessage = {
  Input: "input",
  Jump: "jump",
  Slide: "slide",
  ToggleProne: "toggleProne",
  Teleport: "teleport",
  Fire: "fire",
} as const;

export interface InputPayload {
  moveX: number;
  moveZ: number;
  yaw: number;
  seq: number;
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

export interface BulletFiredEvent {
  originX: number;
  originY: number;
  originZ: number;
  hitX: number;
  hitY: number;
  hitZ: number;
}

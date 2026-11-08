import { createDefaultSniper, Sniper } from "./Sniper";
import { createDefaultMinigun, Minigun } from "./Minigun";

/** Index into a player's loadout, as carried in PlayerState.weapon. */
export const WeaponSlot = {
  Sniper: 0,
  Minigun: 1,
} as const;

export type WeaponSlotValue = (typeof WeaponSlot)[keyof typeof WeaponSlot];

export interface Loadout {
  sniper: Sniper;
  minigun: Minigun;
  active: WeaponSlotValue;
}

export function createLoadout(): Loadout {
  return { sniper: createDefaultSniper(), minigun: createDefaultMinigun(), active: WeaponSlot.Sniper };
}

export function activeWeapon(loadout: Loadout): Sniper | Minigun {
  return loadout.active === WeaponSlot.Minigun ? loadout.minigun : loadout.sniper;
}

/** Coerces a slot off the wire into a real one, so a bad value can't wedge a player's weapon. */
export function clampWeaponSlot(value: unknown): WeaponSlotValue {
  return Number(value) === WeaponSlot.Minigun ? WeaponSlot.Minigun : WeaponSlot.Sniper;
}

import { MagazineWeapon, MagazineWeaponStats } from "./MagazineWeapon";

export interface MinigunStats extends MagazineWeaponStats {
  /** Half-angle (radians) of the cone shots scatter into -- the price of the fire rate. */
  spreadRadians: number;
  /** Seconds of continuous fire for the barrels to reach full speed, for the view model. */
  spinUpSeconds: number;
}

export class Minigun extends MagazineWeapon {
  readonly spreadRadians: number;
  readonly spinUpSeconds: number;

  constructor(stats: MinigunStats) {
    super(stats);
    this.spreadRadians = stats.spreadRadians;
    this.spinUpSeconds = stats.spinUpSeconds;
  }
}

/**
 * The trade against the sniper: ~17 rounds a second that each do a tenth of the damage, sprayed
 * into a cone, out of a belt that takes four seconds to replace.
 */
export function createDefaultMinigun(): Minigun {
  return new Minigun({
    name: "Minigun",
    damage: 9,
    fireRateRpm: 1000,
    magazineSize: 150,
    reloadDurationMs: 4000,
    spreadRadians: 0.035,
    spinUpSeconds: 0.45,
  });
}

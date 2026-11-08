import { MagazineWeapon, MagazineWeaponStats } from "./MagazineWeapon";

export interface SniperStats extends MagazineWeaponStats {
  /** Camera FOV (radians) while looking through the scope. Lower = more zoom. */
  scopeFov: number;
  /** How many times slower the camera turns while scoped (e.g. 4 = 4x slower). */
  scopeSensitivityDivisor: number;
}

export class Sniper extends MagazineWeapon {
  readonly scopeFov: number;
  readonly scopeSensitivityDivisor: number;
  private _isScoped = false;

  constructor(stats: SniperStats) {
    super(stats);
    this.scopeFov = stats.scopeFov;
    this.scopeSensitivityDivisor = stats.scopeSensitivityDivisor;
  }

  get isScoped(): boolean {
    return this._isScoped;
  }

  /** Toggles scope view on/off. Returns the new scoped state. */
  toggleScope(): boolean {
    this._isScoped = !this._isScoped;
    return this._isScoped;
  }
}

export function createDefaultSniper(): Sniper {
  return new Sniper({
    name: "Sniper Rifle",
    damage: 100,
    fireRateRpm: 40,
    scopeFov: 0.15,
    scopeSensitivityDivisor: 4,
    magazineSize: 5,
    reloadDurationMs: 2000,
  });
}

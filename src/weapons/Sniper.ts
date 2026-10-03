import { Weapon, WeaponStats } from "./Weapon";

export interface SniperStats extends WeaponStats {
  /** Camera FOV (radians) while looking through the scope. Lower = more zoom. */
  scopeFov: number;
  /** How many times slower the camera turns while scoped (e.g. 4 = 4x slower). */
  scopeSensitivityDivisor: number;
  /** Rounds per magazine. Refills automatically when emptied, so ammo never runs out. */
  magazineSize: number;
}

export class Sniper extends Weapon {
  readonly scopeFov: number;
  readonly scopeSensitivityDivisor: number;
  readonly magazineSize: number;
  private _isScoped = false;
  private _currentAmmo: number;

  constructor(stats: SniperStats) {
    super(stats);
    this.scopeFov = stats.scopeFov;
    this.scopeSensitivityDivisor = stats.scopeSensitivityDivisor;
    this.magazineSize = stats.magazineSize;
    this._currentAmmo = this.magazineSize;
  }

  get isScoped(): boolean {
    return this._isScoped;
  }

  get currentAmmo(): number {
    return this._currentAmmo;
  }

  /** Toggles scope view on/off. Returns the new scoped state. */
  toggleScope(): boolean {
    this._isScoped = !this._isScoped;
    return this._isScoped;
  }

  /** Fires if the rate-of-fire cooldown allows it, auto-refilling the magazine instead of ever running dry. */
  fire(now: number): boolean {
    if (!super.fire(now)) return false;
    if (this._currentAmmo <= 0) {
      this._currentAmmo = this.magazineSize;
    }
    this._currentAmmo -= 1;
    return true;
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
  });
}

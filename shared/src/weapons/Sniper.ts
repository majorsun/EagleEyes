import { Weapon, WeaponStats } from "./Weapon";

export interface SniperStats extends WeaponStats {
  /** Camera FOV (radians) while looking through the scope. Lower = more zoom. */
  scopeFov: number;
  /** How many times slower the camera turns while scoped (e.g. 4 = 4x slower). */
  scopeSensitivityDivisor: number;
  /** Rounds per magazine. */
  magazineSize: number;
  /** How long a reload takes, from trigger to the magazine being full again. */
  reloadDurationMs: number;
}

export class Sniper extends Weapon {
  readonly scopeFov: number;
  readonly scopeSensitivityDivisor: number;
  readonly magazineSize: number;
  readonly reloadDurationMs: number;
  private _isScoped = false;
  private _currentAmmo: number;
  private _reloadEndsAt: number | null = null;

  constructor(stats: SniperStats) {
    super(stats);
    this.scopeFov = stats.scopeFov;
    this.scopeSensitivityDivisor = stats.scopeSensitivityDivisor;
    this.magazineSize = stats.magazineSize;
    this.reloadDurationMs = stats.reloadDurationMs;
    this._currentAmmo = this.magazineSize;
  }

  get isScoped(): boolean {
    return this._isScoped;
  }

  get currentAmmo(): number {
    return this._currentAmmo;
  }

  get isReloading(): boolean {
    return this._reloadEndsAt !== null;
  }

  /** Milliseconds left on the current reload, or 0 if not reloading. */
  reloadRemainingMs(now: number): number {
    return this._reloadEndsAt === null ? 0 : Math.max(0, this._reloadEndsAt - now);
  }

  /** Toggles scope view on/off. Returns the new scoped state. */
  toggleScope(): boolean {
    this._isScoped = !this._isScoped;
    return this._isScoped;
  }

  /**
   * Completes a reload whose timer has elapsed. Called internally by fire()/startReload(), but
   * also worth calling once per tick/frame so ammo and isReloading stay current even when neither
   * of those is called for a while (e.g. for a live reload countdown in the HUD).
   */
  tick(now: number): void {
    if (this._reloadEndsAt !== null && now >= this._reloadEndsAt) {
      this._currentAmmo = this.magazineSize;
      this._reloadEndsAt = null;
    }
  }

  /** Starts a reload if the mag isn't already full and nothing's in progress. Returns true if it started. */
  startReload(now: number): boolean {
    this.tick(now);
    if (this._reloadEndsAt !== null || this._currentAmmo >= this.magazineSize) return false;
    this._reloadEndsAt = now + this.reloadDurationMs;
    return true;
  }

  /** Fires if off cooldown, loaded, and not reloading. An empty mag starts a reload instead of firing. */
  fire(now: number): boolean {
    this.tick(now);
    if (this._reloadEndsAt !== null) return false;
    if (this._currentAmmo <= 0) {
      this.startReload(now);
      return false;
    }
    if (!super.fire(now)) return false;
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
    reloadDurationMs: 2000,
  });
}

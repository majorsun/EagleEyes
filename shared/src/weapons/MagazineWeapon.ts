import { Weapon, WeaponStats } from "./Weapon";

export interface MagazineWeaponStats extends WeaponStats {
  /** Rounds per magazine. */
  magazineSize: number;
  /** How long a reload takes, from trigger to the magazine being full again. */
  reloadDurationMs: number;
}

/**
 * A weapon that holds a magazine and has to reload: ammo accounting, the reload timer, and the
 * rule that firing dry starts a reload rather than doing nothing. Both the sniper and the minigun
 * run on this, so the two can never drift apart on how reloading behaves.
 */
export abstract class MagazineWeapon extends Weapon {
  readonly magazineSize: number;
  readonly reloadDurationMs: number;
  private _currentAmmo: number;
  private _reloadEndsAt: number | null = null;

  constructor(stats: MagazineWeaponStats) {
    super(stats);
    this.magazineSize = stats.magazineSize;
    this.reloadDurationMs = stats.reloadDurationMs;
    this._currentAmmo = this.magazineSize;
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

  /** Fires if off cooldown, loaded, and not reloading. An empty mag starts a reload instead. */
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

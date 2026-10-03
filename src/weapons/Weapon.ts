export interface WeaponStats {
  name: string;
  damage: number;
  fireRateRpm: number;
}

export abstract class Weapon {
  readonly name: string;
  readonly damage: number;
  readonly fireRateRpm: number;
  private lastFireTime = -Infinity;

  constructor(stats: WeaponStats) {
    this.name = stats.name;
    this.damage = stats.damage;
    this.fireRateRpm = stats.fireRateRpm;
  }

  private canFire(now: number): boolean {
    const minIntervalMs = 60000 / this.fireRateRpm;
    return now - this.lastFireTime >= minIntervalMs;
  }

  /** Attempts to fire, respecting the weapon's fire rate. Returns true if it actually fired. */
  fire(now: number): boolean {
    if (!this.canFire(now)) return false;
    this.lastFireTime = now;
    return true;
  }
}

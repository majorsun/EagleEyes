import { Damageable } from "./Damageable";

export class PlayerHealth implements Damageable {
  private health: number;

  constructor(readonly max: number = 100) {
    this.health = max;
  }

  get current(): number {
    return this.health;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
  }

  reset(): void {
    this.health = this.max;
  }
}

import { PLAYER_SPEED, CRAWL_SPEED } from "@eagleeyes/shared";

/** Metres the view rises and falls over a stride at a full run. */
const WALK_BOB_HEIGHT = 0.075;
/** Radians the view rolls side to side over a stride -- the part that sells "footsteps". */
const WALK_BOB_ROLL = 0.018;
/** Strides per metre. Tied to distance, not time, so the shake matches how fast you move. */
const STRIDE_PER_METRE = 0.62;
/** Crawling is slower and closer to the ground: a longer, heavier sway. */
const CRAWL_BOB_HEIGHT = 0.045;
const CRAWL_BOB_ROLL = 0.035;
const CRAWL_STRIDE_PER_METRE = 1.5;

/** Upward kick as you leave the ground, and the dip when you arrive back on it. */
const JUMP_KICK = 0.1;
const LAND_DIP = 0.22;
/** How quickly a landing dip is absorbed, in units per second. */
const LAND_RECOVER_RATE = 3.2;
/** Vertical speed of the drop that counts as a hard landing rather than a step down. */
const HARD_LANDING_SPEED = 6;

export interface CameraMotionSample {
  /** Horizontal speed in m/s. */
  speed: number;
  isJumping: boolean;
  isCrawling: boolean;
  /** Distance covered horizontally since the last frame, in metres. */
  travelled: number;
}

export interface CameraMotionOffsets {
  /** Added to the camera's eye height. */
  height: number;
  /** Camera roll in radians. */
  roll: number;
}

/**
 * Procedural view motion for the local player: the stride bob while walking or crawling, a kick
 * on takeoff and a dip on landing. Everything here is cosmetic and local -- it never touches the
 * physics state the server reconciles against, so shaking the view can't desync anybody.
 */
export class CameraMotion {
  private phase = 0;
  private offset = 0;
  private roll = 0;
  private landDip = 0;
  private wasAirborne = false;
  private stepListener: (() => void) | null = null;
  private lastStepPhase = 0;

  /** Called once per footfall, for footstep audio. */
  onStep(listener: () => void): void {
    this.stepListener = listener;
  }

  /** Call when the player leaves the ground, to kick the view upward. */
  jumped(): void {
    this.landDip -= JUMP_KICK;
  }

  update(deltaSeconds: number, sample: CameraMotionSample): CameraMotionOffsets {
    const { speed, isJumping, isCrawling, travelled } = sample;

    // Landing: the dip scales with how fast you were falling, so a hop off a dune is gentler
    // than a drop off a hill.
    if (this.wasAirborne && !isJumping) {
      this.landDip += LAND_DIP * Math.min(1, speed / HARD_LANDING_SPEED + 0.6);
    }
    this.wasAirborne = isJumping;
    this.landDip += (0 - this.landDip) * Math.min(1, deltaSeconds * LAND_RECOVER_RATE);

    const topSpeed = isCrawling ? CRAWL_SPEED : PLAYER_SPEED;
    const intensity = isJumping ? 0 : Math.min(1, speed / topSpeed);
    if (!isJumping) {
      this.phase += travelled * (isCrawling ? CRAWL_STRIDE_PER_METRE : STRIDE_PER_METRE) * Math.PI * 2;
    }

    const bobHeight = isCrawling ? CRAWL_BOB_HEIGHT : WALK_BOB_HEIGHT;
    const bobRoll = isCrawling ? CRAWL_BOB_ROLL : WALK_BOB_ROLL;
    // Two vertical dips per stride (one per foot), one roll cycle -- the shape real head bob has.
    const targetOffset = -Math.abs(Math.sin(this.phase)) * bobHeight * intensity;
    const targetRoll = Math.sin(this.phase * 0.5) * bobRoll * intensity;

    // Ease toward the target rather than snapping, so stopping doesn't jerk the view straight.
    const ease = Math.min(1, deltaSeconds * 14);
    this.offset += (targetOffset - this.offset) * ease;
    this.roll += (targetRoll - this.roll) * ease;

    this.emitSteps(intensity);

    return { height: this.offset - this.landDip, roll: this.roll };
  }

  /** Fires a step each time the stride passes a footfall (the bottom of each dip). */
  private emitSteps(intensity: number): void {
    if (!this.stepListener || intensity < 0.15) {
      this.lastStepPhase = this.phase;
      return;
    }
    const half = Math.PI;
    if (Math.floor(this.phase / half) !== Math.floor(this.lastStepPhase / half)) {
      this.stepListener();
    }
    this.lastStepPhase = this.phase;
  }
}

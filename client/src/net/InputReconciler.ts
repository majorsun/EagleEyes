import { PlayerInput, PlayerPhysicsState, TerrainData, stepMovement } from "@eagleeyes/shared";

interface PendingInput {
  seq: number;
  input: PlayerInput;
  dt: number;
}

/** Client-side prediction + server reconciliation for the local player's physics state. */
export class InputReconciler {
  private seq = 0;
  private readonly pending: PendingInput[] = [];
  state: PlayerPhysicsState;

  constructor(
    initial: PlayerPhysicsState,
    private readonly terrain: TerrainData,
  ) {
    this.state = initial;
  }

  /** Discards in-flight predictions and replaces the physics state outright (e.g. on respawn). */
  reset(state: PlayerPhysicsState): void {
    this.state = state;
    this.pending.length = 0;
  }

  /** Predicts this frame's movement locally and records it for later reconciliation. Returns the seq to send. */
  predict(input: PlayerInput, dt: number): number {
    const seq = ++this.seq;
    this.state = stepMovement(this.state, input, this.terrain, dt);
    this.pending.push({ seq, input, dt });
    return seq;
  }

  /**
   * Re-bases prediction on the latest authoritative position, replaying inputs the server hasn't
   * acknowledged yet. Skipped mid-jump/mid-slide: the server's x/y/z there always lags local
   * prediction by a round trip, so hard-correcting would visibly snap the player backward mid-arc.
   * Those short, self-contained arcs resync naturally once they end and grounded correction resumes.
   */
  reconcile(serverPosition: { x: number; y: number; z: number }, lastProcessedSeq: number): void {
    while (this.pending.length > 0 && this.pending[0].seq <= lastProcessedSeq) {
      this.pending.shift();
    }

    if (this.state.isJumping || this.state.isSliding) return;

    let state: PlayerPhysicsState = { ...this.state, ...serverPosition };
    for (const { input, dt } of this.pending) {
      state = stepMovement(state, input, this.terrain, dt);
    }
    this.state = state;
  }
}

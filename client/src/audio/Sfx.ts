/**
 * Every sound in the game, synthesised with Web Audio rather than shipped as files: no assets to
 * download, nothing to license, and each shot can be given its own slight pitch variation so a
 * burst of minigun fire doesn't turn into one flat repeated sample.
 *
 * The context starts suspended under browser autoplay rules, so unlock() is wired to the same
 * click that grabs pointer lock.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** One second of white noise, reused as the source for every percussive//breathy sound. */
  private getNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  /** A filtered burst of noise: thumps, bangs, impacts, footsteps. */
  private noise(options: {
    duration: number;
    gain: number;
    type: BiquadFilterType;
    frequency: number;
    frequencyEnd?: number;
    q?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const source = ctx.createBufferSource();
    source.buffer = this.getNoise(ctx);
    source.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filter = ctx.createBiquadFilter();
    filter.type = options.type;
    filter.frequency.setValueAtTime(options.frequency, this.now);
    if (options.frequencyEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.frequencyEnd), this.now + options.duration);
    }
    filter.Q.value = options.q ?? 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(options.gain, this.now);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.now + options.duration);

    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(this.now + options.duration);
  }

  /** A pitched blip: beeps, clicks, metallic rings. */
  private tone(options: {
    duration: number;
    gain: number;
    frequency: number;
    frequencyEnd?: number;
    type?: OscillatorType;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    osc.type = options.type ?? "sine";
    osc.frequency.setValueAtTime(options.frequency, this.now);
    if (options.frequencyEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.frequencyEnd), this.now + options.duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(options.gain, this.now);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.now + options.duration);

    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(this.now + options.duration);
  }

  // --- The actual game sounds -------------------------------------------------------------------

  footstep(crawling = false): void {
    this.noise({
      duration: crawling ? 0.22 : 0.09,
      gain: crawling ? 0.08 : 0.14,
      type: "lowpass",
      frequency: crawling ? 700 : 1500,
      frequencyEnd: crawling ? 200 : 300,
    });
  }

  jump(): void {
    this.noise({ duration: 0.18, gain: 0.1, type: "bandpass", frequency: 500, frequencyEnd: 1400, q: 0.8 });
  }

  land(hard: boolean): void {
    this.noise({ duration: hard ? 0.3 : 0.16, gain: hard ? 0.3 : 0.16, type: "lowpass", frequency: 900, frequencyEnd: 90 });
    if (hard) this.tone({ duration: 0.2, gain: 0.12, frequency: 90, frequencyEnd: 45, type: "sine" });
  }

  sniperShot(): void {
    this.noise({ duration: 0.4, gain: 0.5, type: "lowpass", frequency: 6000, frequencyEnd: 140 });
    this.tone({ duration: 0.3, gain: 0.3, frequency: 160, frequencyEnd: 50, type: "square" });
  }

  minigunShot(): void {
    // Shorter, drier and quieter than the sniper: seventeen of these a second have to stack up
    // into a roar without clipping into mush.
    this.noise({ duration: 0.09, gain: 0.22, type: "bandpass", frequency: 1800, frequencyEnd: 600, q: 1.2 });
    this.tone({ duration: 0.07, gain: 0.12, frequency: 220 + Math.random() * 60, frequencyEnd: 70, type: "square" });
  }

  minigunSpin(): void {
    this.tone({ duration: 0.5, gain: 0.08, frequency: 90, frequencyEnd: 260, type: "sawtooth" });
  }

  reload(): void {
    this.noise({ duration: 0.07, gain: 0.18, type: "bandpass", frequency: 2600, q: 3 });
    window.setTimeout(() => this.noise({ duration: 0.09, gain: 0.16, type: "bandpass", frequency: 1500, q: 3 }), 160);
    window.setTimeout(() => this.tone({ duration: 0.08, gain: 0.14, frequency: 700, frequencyEnd: 420, type: "square" }), 420);
  }

  weaponSwitch(): void {
    this.tone({ duration: 0.08, gain: 0.13, frequency: 520, frequencyEnd: 880, type: "square" });
  }

  shurikenThrow(): void {
    this.noise({ duration: 0.26, gain: 0.12, type: "bandpass", frequency: 900, frequencyEnd: 2600, q: 2 });
  }

  shurikenHit(): void {
    this.tone({ duration: 0.22, gain: 0.2, frequency: 2300, frequencyEnd: 900, type: "triangle" });
    this.noise({ duration: 0.1, gain: 0.12, type: "highpass", frequency: 2600 });
  }

  swordSwing(): void {
    this.noise({ duration: 0.2, gain: 0.16, type: "bandpass", frequency: 600, frequencyEnd: 2200, q: 1.6 });
  }

  /** Taking damage. */
  hurt(): void {
    this.noise({ duration: 0.18, gain: 0.22, type: "lowpass", frequency: 1200, frequencyEnd: 200 });
    this.tone({ duration: 0.25, gain: 0.1, frequency: 180, frequencyEnd: 90, type: "triangle" });
  }

  /** Landing a hit on an enemy. */
  hitMarker(): void {
    this.tone({ duration: 0.07, gain: 0.16, frequency: 1500, frequencyEnd: 2100, type: "square" });
  }

  enemyBreak(): void {
    this.noise({ duration: 0.5, gain: 0.3, type: "lowpass", frequency: 2600, frequencyEnd: 120 });
    this.tone({ duration: 0.35, gain: 0.12, frequency: 260, frequencyEnd: 70, type: "sawtooth" });
  }

  death(): void {
    this.tone({ duration: 1.1, gain: 0.25, frequency: 320, frequencyEnd: 55, type: "sawtooth" });
    this.noise({ duration: 0.8, gain: 0.2, type: "lowpass", frequency: 1400, frequencyEnd: 80 });
  }

  respawn(): void {
    this.tone({ duration: 0.3, gain: 0.16, frequency: 320, frequencyEnd: 760, type: "triangle" });
  }
}

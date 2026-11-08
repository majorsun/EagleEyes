import { mulberry32 } from "./rng";
import { MOAT_CENTER_Z, MOAT_WIDTH } from "./constants";

export interface LedgePoint {
  x: number;
  y: number;
  z: number;
}

export interface HillInfo {
  centerX: number;
  centerZ: number;
  /** Vertical center of the hill's dome (it's sunk partway into the ground). */
  centerY: number;
  radius: number;
  height: number;
  /** Ledges climbing this hill's slope, for visualization. */
  ledges: LedgePoint[];
}

export interface DuneInfo {
  x: number;
  z: number;
  width: number;
  height: number;
  /** Flat ledge at the dune's peak, for visualization. */
  ledge: LedgePoint;
}

/**
 * A flat-topped rock shelf. Kept low on purpose: the sides are vertical, so anything taller than
 * a jump would teleport players up its face instead of being climbed.
 */
export interface MesaInfo {
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Flat standing spot on top, for prone snapping. */
  ledge: LedgePoint;
}

export interface TerrainData {
  hills: HillInfo[];
  dunes: DuneInfo[];
  mesas: MesaInfo[];
  /** Every ledge (dune + hill) combined, used to snap prone players to the nearest one. */
  ledges: LedgePoint[];
}

/**
 * Collision-relevant subset of the original scattered desert terrain (hills + dunes and their
 * ledges). Rocks/cacti are purely decorative and stay client-local, generated independently.
 */
export function generateTerrain(seed: number, centerX: number, centerZ: number): TerrainData {
  const rng = mulberry32(seed);
  const ledges: LedgePoint[] = [];
  const dunes: DuneInfo[] = [];
  const mesas: MesaInfo[] = [];
  const hills: HillInfo[] = [];

  const randomAround = (minRadius: number, maxRadius: number): { x: number; z: number } => {
    const angle = rng() * Math.PI * 2;
    const radius = minRadius + rng() * (maxRadius - minRadius);
    return { x: centerX + Math.cos(angle) * radius, z: centerZ + Math.sin(angle) * radius };
  };

  // A wider spread of dune sizes than the original seven near-identical mounds: some are low
  // humps you shoot over, some are tall enough to break line of sight entirely.
  for (let i = 0; i < 12; i++) {
    const pos = randomAround(8, 48);
    const width = 3 + rng() * 11;
    const height = 0.8 + rng() * 2.6;

    // Flat ledge at the peak so the curved dune top has somewhere to stand without sliding off.
    const ledge: LedgePoint = { x: pos.x, y: height * 0.2 + 0.05, z: pos.z };
    dunes.push({ x: pos.x, z: pos.z, width, height, ledge });
    ledges.push(ledge);
  }

  const ledgeSteps = [0, 0.3, 0.5, 0.65, 0.8, 0.95];
  for (let i = 0; i < 4; i++) {
    const pos = randomAround(40, 75);
    const radius = 20 + rng() * 15;
    const hillHeight = 10 + rng() * 8;
    const hillCenterY = -hillHeight * 0.3;

    // Lots of ledges up the hillside at increasing height/radius, like a staircase of outposts.
    const hillLedges: LedgePoint[] = [];
    for (const step of ledgeSteps) {
      const stepRadius = step * radius;
      const angle = rng() * Math.PI * 2;
      const heightFraction = Math.sqrt(Math.max(0, 1 - (stepRadius / radius) ** 2));
      const surfaceY = hillCenterY + hillHeight * heightFraction;
      const ledge: LedgePoint = {
        x: pos.x + Math.cos(angle) * stepRadius,
        y: surfaceY + 0.1,
        z: pos.z + Math.sin(angle) * stepRadius,
      };
      hillLedges.push(ledge);
      ledges.push(ledge);
    }

    hills.push({ centerX: pos.x, centerZ: pos.z, centerY: hillCenterY, radius, height: hillHeight, ledges: hillLedges });
  }

  // Rock shelves: hop-up cover through the middle distance, each with a firing position on top.
  // Placed after the hills and kept clear of them: a hill's surface wins in groundSurfaceHeightAt,
  // so a shelf buried in a hillside would be scenery you cannot actually stand on. Shelves also
  // keep off the moat, where the water floor overrides the height field the same way.
  for (let i = 0; i < 6; i++) {
    const radius = 2.5 + rng() * 4.5;
    const height = 1.2 + rng() * 1;

    for (let attempt = 0; attempt < 10; attempt++) {
      const pos = randomAround(12, 42);
      const clearOfHills = hills.every((hill) => {
        const dx = pos.x - hill.centerX;
        const dz = pos.z - hill.centerZ;
        return Math.sqrt(dx * dx + dz * dz) > hill.radius + radius + 1;
      });
      const clearOfMoat = Math.abs(pos.z - MOAT_CENTER_Z) > MOAT_WIDTH / 2 + radius + 1;
      if (!clearOfHills || !clearOfMoat) continue;

      const ledge: LedgePoint = { x: pos.x, y: height + 0.05, z: pos.z };
      mesas.push({ x: pos.x, z: pos.z, radius, height, ledge });
      ledges.push(ledge);
      break;
    }
  }

  return { hills, dunes, mesas, ledges };
}

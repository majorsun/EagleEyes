import { mulberry32 } from "./rng";

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

export interface TerrainData {
  hills: HillInfo[];
  dunes: DuneInfo[];
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
  const hills: HillInfo[] = [];

  const randomAround = (minRadius: number, maxRadius: number): { x: number; z: number } => {
    const angle = rng() * Math.PI * 2;
    const radius = minRadius + rng() * (maxRadius - minRadius);
    return { x: centerX + Math.cos(angle) * radius, z: centerZ + Math.sin(angle) * radius };
  };

  for (let i = 0; i < 7; i++) {
    const pos = randomAround(8, 35);
    const width = 4 + rng() * 6;
    const height = 1 + rng() * 1.8;

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

  return { hills, dunes, ledges };
}

import { MOAT_CENTER_Z } from "../movement/constants";

/** Past the moat, where the outpost platform and all the hills/dunes are -- enemies can't reach or attack here. */
export function isInPvpZone(z: number): boolean {
  return z > MOAT_CENTER_Z;
}

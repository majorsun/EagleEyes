/**
 * Player cosmetic skins. Colors are plain RGB triplets in 0..1 (no Babylon types) so this one
 * list is the single source of truth for both sides: the client paints the operator model from
 * it, and the server validates an incoming selection against its length.
 *
 * The keys map onto the material names in client/public/models/operator.glb.
 */
export interface PlayerSkin {
  readonly id: string;
  readonly label: string;
  /** Fatigues and sleeves. Doubles as the swatch color in the cosmetics menu. */
  readonly uniform: readonly [number, number, number];
  /** Secondary cloth: pockets, cuffs, lower legs. */
  readonly secondary: readonly [number, number, number];
  /** Helmet shell. */
  readonly helmet: readonly [number, number, number];
  /** Balaclava, and anything else that would otherwise render as a bare face. */
  readonly mask: readonly [number, number, number];
  /** Plate carrier, pouches, gloves, boots. */
  readonly gear: readonly [number, number, number];
}

export const PLAYER_SKINS: readonly PlayerSkin[] = [
  {
    id: "night",
    label: "Night Operator",
    uniform: [0.13, 0.15, 0.19],
    secondary: [0.08, 0.09, 0.12],
    helmet: [0.1, 0.11, 0.13],
    mask: [0.09, 0.09, 0.11],
    gear: [0.04, 0.04, 0.05],
  },
  {
    id: "desert",
    label: "Desert",
    uniform: [0.54, 0.45, 0.3],
    secondary: [0.42, 0.34, 0.22],
    helmet: [0.46, 0.39, 0.26],
    mask: [0.22, 0.19, 0.15],
    gear: [0.2, 0.17, 0.12],
  },
  {
    id: "woodland",
    label: "Woodland",
    uniform: [0.21, 0.27, 0.16],
    secondary: [0.14, 0.18, 0.1],
    helmet: [0.17, 0.22, 0.13],
    mask: [0.1, 0.12, 0.08],
    gear: [0.09, 0.1, 0.07],
  },
  {
    id: "urban",
    label: "Urban Grey",
    uniform: [0.35, 0.36, 0.38],
    secondary: [0.25, 0.26, 0.28],
    helmet: [0.29, 0.3, 0.32],
    mask: [0.14, 0.14, 0.15],
    gear: [0.11, 0.11, 0.12],
  },
  {
    id: "arctic",
    label: "Arctic",
    uniform: [0.78, 0.8, 0.84],
    secondary: [0.62, 0.65, 0.7],
    helmet: [0.72, 0.75, 0.79],
    mask: [0.24, 0.26, 0.3],
    gear: [0.2, 0.22, 0.26],
  },
  {
    id: "crimson",
    label: "Crimson",
    uniform: [0.42, 0.11, 0.12],
    secondary: [0.29, 0.07, 0.08],
    helmet: [0.22, 0.07, 0.08],
    mask: [0.12, 0.06, 0.06],
    gear: [0.09, 0.05, 0.05],
  },
];

export const DEFAULT_PLAYER_SKIN = 0;

/** Coerces anything a client sends into a real index, so a bad value can't blank out a player. */
export function clampPlayerSkin(value: unknown): number {
  const index = Math.floor(Number(value));
  if (!Number.isFinite(index) || index < 0 || index >= PLAYER_SKINS.length) return DEFAULT_PLAYER_SKIN;
  return index;
}

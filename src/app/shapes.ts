// Cover shapes: a DS box is not shaped like a Switch case or a PS1 jewel case.
// Kept in sync with SHAPES in src-tauri/src/presets.rs.

import { consoleById, store } from './state.js';
import type { Console } from './types.js';

/** Width divided by height of each shape. */
export const SHAPES = {
  dvd: 0.71, // PS2, Wii, Xbox 360 cases
  bluray: 0.8, // PS3, PS4, Wii U cases
  tall: 0.62, // Switch cases, PSP
  small: 0.9, // DS and 3DS boxes
  square: 1, // PS1 and Dreamcast jewel cases, Game Boy
  wide: 1.4, // N64, SNES and NES boxes
  poster: 0.67, // PC games
} as const;

export type ShapeId = keyof typeof SHAPES;
export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

const isShape = (id: string | null | undefined): id is ShapeId => !!id && id in SHAPES;

/** The shape of a console's covers: the one chosen by hand, else the usual one for its type. */
export function shapeOf(console: Pick<Console, 'preset' | 'coverShape'> | undefined): ShapeId {
  if (isShape(console?.coverShape)) return console!.coverShape as ShapeId;
  const preset = store.presets.find((p) => p.id === console?.preset);
  return isShape(preset?.shape) ? (preset!.shape as ShapeId) : 'dvd';
}

export const ratioOfConsole = (consoleId: string): number => SHAPES[shapeOf(consoleById(consoleId))];

/**
 * Size of a coverflow cover for a given shape. Wide covers are drawn a little lower and tall
 * ones a little higher, so every shape takes about the same room on screen.
 */
export function coverflowStyle(ratio: number): string {
  const scale = Math.min(1.1, Math.max(0.62, Math.sqrt(SHAPES.dvd / ratio)));
  return `--cover-h:calc(var(--flow-h) * ${scale.toFixed(3)});--cover-w:calc(var(--cover-h) * ${ratio})`;
}

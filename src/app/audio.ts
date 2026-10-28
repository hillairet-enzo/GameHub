// UI sound effects. Cloning the element lets sounds overlap when scrolling quickly.

export type Sound = 'move' | 'select' | 'back';

const FILES: Record<Sound, { src: string; gain: number }> = {
  move: { src: '/sounds/move.mp3', gain: 0.5 },
  select: { src: '/sounds/select.mp3', gain: 0.85 },
  back: { src: '/sounds/back.mp3', gain: 0.85 },
};

const cache: Partial<Record<Sound, HTMLAudioElement>> = {};
let enabled = true;
let volume = 0.6;

export function configureAudio(sound: boolean, level: number): void {
  enabled = sound;
  volume = Math.min(1, Math.max(0, level));
}

export function sfx(name: Sound): void {
  if (!enabled || volume === 0 || typeof Audio === 'undefined') return;
  try {
    const base = (cache[name] ??= new Audio(FILES[name].src));
    const clone = base.cloneNode() as HTMLAudioElement;
    clone.volume = Math.min(1, volume * FILES[name].gain);
    void clone.play().catch(() => undefined);
  } catch {
    /* audio is optional */
  }
}

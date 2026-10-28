// Generated artwork used by the browser demo mode (no real game art is bundled).

export function isMockName(name: string): boolean {
  return name.startsWith('mock:');
}

/** `mock:<hue>:<variant>` -> abstract cover as an SVG data URL. */
export function mockArt(name: string): string {
  const [, hueRaw = '200', variantRaw = '0'] = name.split(':');
  const hue = Number(hueRaw) || 200;
  const variant = Number(variantRaw) || 0;
  const a = `hsl(${hue} 72% 42%)`;
  const b = `hsl(${(hue + 48) % 360} 80% 16%)`;
  const c = `hsl(${(hue + 160) % 360} 90% 70%)`;
  const shapes = [
    `<circle cx="210" cy="140" r="96" fill="${c}" opacity=".22"/><circle cx="210" cy="140" r="52" fill="${c}" opacity=".35"/>`,
    `<path d="M-20 330 L320 150 L320 230 L-20 410Z" fill="${c}" opacity=".28"/><path d="M-20 260 L320 80 L320 110 L-20 290Z" fill="#fff" opacity=".14"/>`,
    `<rect x="60" y="70" width="180" height="180" rx="22" transform="rotate(14 150 160)" fill="${c}" opacity=".25"/><rect x="95" y="105" width="110" height="110" rx="14" transform="rotate(14 150 160)" fill="#fff" opacity=".14"/>`,
    `<path d="M150 40 L260 250 L40 250Z" fill="${c}" opacity=".28"/><circle cx="150" cy="200" r="40" fill="#fff" opacity=".12"/>`,
  ][variant % 4];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 430">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="300" height="430" fill="url(#g)"/>${shapes}` +
    `<rect y="300" width="300" height="130" fill="#000" opacity=".25"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

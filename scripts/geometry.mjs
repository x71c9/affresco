// Path builders for the logo: gothic arches, the "A" and crop marks (128 x 128 grid).

const f = (n) => Number(n.toFixed(2));

// Pointed (gothic) arch from xl to xr, springing at y, arc radius r.
export function apex(xl, xr, y, r) {
  const m = (xl + xr) / 2;
  return [m, y - Math.sqrt(r * r - (xl + r - m) ** 2)];
}
export function arch(xl, xr, y, r, bottom) {
  const [mx, my] = apex(xl, xr, y, r);
  return `M${xl} ${bottom} V${y} A${r} ${r} 0 0 1 ${f(mx)} ${f(my)} A${r} ${r} 0 0 1 ${xr} ${y} V${bottom} Z`;
}
// Outline open at the bottom (two legs), stroke thickness t.
export function archOutline(xl, xr, y, r, bottom, t) {
  return `${arch(xl, xr, y, r, bottom)} ${arch(xl + t, xr - t, y, r - t, bottom)}`;
}
export const rect = (x, y, w, h) => `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
// Screenshot crop marks around the box x0..x1, y0..y1 (as filled paths).
export function brackets(x0, y0, x1, y1, len, t) {
  return [
    `M${x0} ${y0} H${x0 + len} V${y0 + t} H${x0 + t} V${y0 + len} H${x0} Z`,
    `M${x1} ${y0} H${x1 - len} V${y0 + t} H${x1 - t} V${y0 + len} H${x1} Z`,
    `M${x0} ${y1} H${x0 + len} V${y1 - t} H${x0 + t} V${y1 - len} H${x0} Z`,
    `M${x1} ${y1} H${x1 - len} V${y1 - t} H${x1 - t} V${y1 - len} H${x1} Z`,
  ].join(' ');
}
// The "A": gothic outline with a crossbar.
export function gothicA(xl, xr, y, r, bottom, t, barY, barH) {
  return `${archOutline(xl, xr, y, r, bottom, t)} ${rect(xl + t, barY, xr - xl - 2 * t, barH)}`;
}
// Solid gothic arch with the A counters cut out (closed top, open doorway).
export function gothicSolidA(xl, xr, y, r, bottom, t, barY, barH) {
  const top = arch(xl + t, xr - t, y, r - t, barY);
  const door = rect(xl + t, barY + barH, xr - xl - 2 * t, bottom - barY - barH);
  return `${arch(xl, xr, y, r, bottom)} ${top} ${door}`;
}
export const rounded = (x, y, w, h, rr) =>
  `M${x + rr} ${y} H${x + w - rr} A${rr} ${rr} 0 0 1 ${x + w} ${y + rr} V${y + h - rr} A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h} H${x + rr} A${rr} ${rr} 0 0 1 ${x} ${y + h - rr} V${y + rr} A${rr} ${rr} 0 0 1 ${x + rr} ${y} Z`;
export const roundTop = (xl, xr, top, bottom) => {
  const r = (xr - xl) / 2;
  return `M${xl} ${bottom} V${top + r} A${r} ${r} 0 0 1 ${xr} ${top + r} V${bottom} Z`;
};

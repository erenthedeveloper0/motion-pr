// Regenerates every vector asset in /brand from motionpr-logo.mjs.
// Usage: node brand/source/build-svgs.mjs   (Node 18+, no dependencies)
// PNG, ICO and JPEG exports are rendered from these SVGs with headless Chromium.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { markGeometry, lockupGeometry, WORDMARK, LOCKUP, COLORS, GRADIENT_STOPS, translatePath } from './motionpr-logo.mjs';
const OUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const r3 = (n) => +(+n).toFixed(3);
const grad = (id, x1, y1, x2, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}">${GRADIENT_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const svg = (w, h, body, label = 'MotionPR') => `<svg xmlns="http://www.w3.org/2000/svg" width="${r3(w)}" height="${r3(h)}" viewBox="0 0 ${r3(w)} ${r3(h)}" fill="none" role="img" aria-label="${label}">\n<title>${label}</title>\n${body}\n</svg>\n`;
const write = (p, s) => { fs.mkdirSync(`${OUT}/${p.split('/')[0]}`, { recursive: true }); fs.writeFileSync(`${OUT}/${p}`, s); console.log(p.padEnd(46), (s.length / 1024).toFixed(1) + ' KB'); };

// ---------- Mark ----------
const M = 512, mk = markGeometry({ size: M });
write('logo/motionpr-mark.svg', svg(M, M, `<defs>${grad('mpr-g', 0, M, M, 0)}</defs>\n<path fill="url(#mpr-g)" d="${mk.path}"/>`));
write('logo/motionpr-mark-white.svg', svg(M, M, `<path fill="${COLORS.paper}" d="${mk.path}"/>`));
write('logo/motionpr-mark-black.svg', svg(M, M, `<path fill="${COLORS.ink}" d="${mk.path}"/>`));
write('logo/motionpr-mark-currentcolor.svg', svg(M, M, `<path fill="currentColor" d="${mk.path}"/>`));

// ---------- Lockup ----------
const L = lockupGeometry();
const mBox = { x: 0, y: -WORDMARK.top - WORDMARK.xHeight / 2 - LOCKUP.markSize / 2, s: LOCKUP.markSize };
const lgrad = grad('mpr-g', mBox.x, mBox.y + mBox.s, mBox.x + mBox.s, mBox.y);
const lock = (markFill, wordFill, defs = '') => svg(L.width, L.height, `${defs ? `<defs>${defs}</defs>\n` : ''}<path fill="${markFill}" d="${L.mark.path}"/>\n<path fill="${wordFill}" d="${L.wordmark}"/>`);
write('logo/motionpr-logo-on-dark.svg', lock('url(#mpr-g)', COLORS.paper, lgrad));
write('logo/motionpr-logo-on-light.svg', lock('url(#mpr-g)', COLORS.ink, lgrad));
write('logo/motionpr-logo-white.svg', lock(COLORS.paper, COLORS.paper));
write('logo/motionpr-logo-black.svg', lock(COLORS.ink, COLORS.ink));
write('logo/motionpr-logo-currentcolor.svg', lock('currentColor', 'currentColor'));

// ---------- Wordmark ----------
const WW = WORDMARK.width, WH = WORDMARK.bottom - WORDMARK.top;
const wpath = translatePath(WORDMARK.path, 0, -WORDMARK.top);
write('logo/motionpr-wordmark-white.svg', svg(WW, WH, `<path fill="${COLORS.paper}" d="${wpath}"/>`));
write('logo/motionpr-wordmark-black.svg', svg(WW, WH, `<path fill="${COLORS.ink}" d="${wpath}"/>`));
write('logo/motionpr-wordmark-currentcolor.svg', svg(WW, WH, `<path fill="currentColor" d="${wpath}"/>`));

// ---------- Squircle (superellipse n=5) ----------
const squircle = (x, y, s, n = 5, steps = 240) => {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
    pts.push([x + s / 2 + (s / 2) * Math.sign(c) * Math.abs(c) ** (2 / n), y + s / 2 + (s / 2) * Math.sign(sn) * Math.abs(sn) ** (2 / n)]);
  }
  return 'M' + pts.map(([a, b]) => `${r3(a).toFixed(2)} ${r3(b).toFixed(2)}`).join('L') + 'Z';
};

// ---------- App icons (1024) ----------
const S = 1024, inner = 560, off = (S - inner) / 2;
const im = markGeometry({ x: off, y: off, size: inner });
const tile = squircle(0, 0, S);
const tileInset = squircle(1.5, 1.5, S - 3);
const grain = (id, op) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${op} 0"/></filter>`;
write('icon/motionpr-app-icon.svg', svg(S, S, `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1A22"/><stop offset="1" stop-color="#08080B"/></linearGradient>
<radialGradient id="sheen" cx=".5" cy="0" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></linearGradient>
${grad('mpr-g', off, off + inner, off + inner, off)}
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
${grain('grain', 0.045)}
<clipPath id="clip"><path d="${tile}"/></clipPath>
</defs>
<g clip-path="url(#clip)">
<path fill="url(#bg)" d="${tile}"/>
<path fill="url(#sheen)" d="${tile}"/>
<path fill="url(#mpr-g)" opacity=".55" filter="url(#glow)" d="${im.path}"/>
<path fill="url(#mpr-g)" d="${im.path}"/>
<rect width="${S}" height="${S}" filter="url(#grain)"/>
</g>
<path stroke="url(#rim)" stroke-width="3" d="${tileInset}"/>`));
write('icon/motionpr-app-icon-light.svg', svg(S, S, `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAF9FD"/><stop offset="1" stop-color="#E7E4F0"/></linearGradient>
</defs>
<path fill="url(#bg)" d="${tile}"/>
<path fill="${COLORS.ink}" d="${im.path}"/>`));
write('icon/motionpr-app-icon-gradient.svg', svg(S, S, `<defs>
${grad('mpr-g', 0, S, S, 0)}
<radialGradient id="shade" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
${grain('grain', 0.06)}
<clipPath id="clip"><path d="${tile}"/></clipPath>
</defs>
<g clip-path="url(#clip)">
<path fill="url(#mpr-g)" d="${tile}"/>
<path fill="url(#shade)" d="${tile}"/>
<rect width="${S}" height="${S}" filter="url(#grain)"/>
<path fill="#FFFFFF" d="${im.path}"/>
</g>`));

// ---------- Favicon ----------
const fm = markGeometry({ x: 3, y: 3, size: 58 });
write('icon/favicon.svg', svg(64, 64, `<defs>${grad('mpr-g', 3, 61, 61, 3)}</defs>\n<path fill="url(#mpr-g)" d="${fm.path}"/>`));
// Full-bleed square for apple-touch-icon / maskable (no transparency, OS applies its own mask)
const bm = markGeometry({ x: S * 0.25, y: S * 0.25, size: S * 0.5 });
write('icon/motionpr-icon-full-bleed.svg', svg(S, S, `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1A22"/><stop offset="1" stop-color="#08080B"/></linearGradient>
${grad('mpr-g', S * 0.25, S * 0.75, S * 0.75, S * 0.25)}
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="42"/></filter>
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/>
<path fill="url(#mpr-g)" opacity=".5" filter="url(#glow)" d="${bm.path}"/>
<path fill="url(#mpr-g)" d="${bm.path}"/>`));

// ---------- Motion (CSS-animated SVG, honours prefers-reduced-motion) ----------
const anim = (css) => {
  const g = markGeometry({ size: M });
  const k = Math.SQRT1_2, half = (g.distance / 2) * k; // each circle's travel from centre, per axis
  const A = g.before, B = g.after, R = r3(g.r);
  return svg(M, M, `<style>
.a,.b{transform-box:view-box}
${css(r3(half))}
@media (prefers-reduced-motion:reduce){.a,.b{animation:none!important}}
</style>
<defs>
${grad('mpr-g', 0, M, M, 0)}
<mask id="not-b" maskUnits="userSpaceOnUse" x="0" y="0" width="${M}" height="${M}"><rect width="${M}" height="${M}" fill="#fff"/><circle class="b" cx="${r3(B.cx)}" cy="${r3(B.cy)}" r="${R}" fill="#000"/></mask>
<mask id="not-a" maskUnits="userSpaceOnUse" x="0" y="0" width="${M}" height="${M}"><rect width="${M}" height="${M}" fill="#fff"/><circle class="a" cx="${r3(A.cx)}" cy="${r3(A.cy)}" r="${R}" fill="#000"/></mask>
</defs>
<g mask="url(#not-b)"><circle class="a" cx="${r3(A.cx)}" cy="${r3(A.cy)}" r="${R}" fill="url(#mpr-g)"/></g>
<g mask="url(#not-a)"><circle class="b" cx="${r3(B.cx)}" cy="${r3(B.cy)}" r="${R}" fill="url(#mpr-g)"/></g>`);
};
write('motion/motionpr-mark-intro.svg', anim((h) => `.a{animation:mpr-a 1.6s cubic-bezier(.16,1,.3,1) .35s both}
.b{animation:mpr-b 1.6s cubic-bezier(.16,1,.3,1) .35s both}
@keyframes mpr-a{from{transform:translate(${h}px,${-h}px)}to{transform:translate(0,0)}}
@keyframes mpr-b{from{transform:translate(${-h}px,${h}px)}to{transform:translate(0,0)}}`));
const inward = (h) => r3(h * (1 - 0.3)); // loop breathes between 30% and 100% of the offset
write('motion/motionpr-mark-loop.svg', anim((h) => `.a{animation:mpr-a 1.8s cubic-bezier(.65,0,.35,1) infinite alternate}
.b{animation:mpr-b 1.8s cubic-bezier(.65,0,.35,1) infinite alternate}
@keyframes mpr-a{from{transform:translate(0,0)}to{transform:translate(${inward(h)}px,${-inward(h)}px)}}
@keyframes mpr-b{from{transform:translate(0,0)}to{transform:translate(${-inward(h)}px,${inward(h)}px)}}`));

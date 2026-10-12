// Procedural pixel art: road, roadside decor, vehicles, lights. No image files.
import { CFG, laneWidth, roadLeft, roadRight } from './config';
import type { Farda, Modelo, SkinViatura } from './data/skins';

type G = CanvasRenderingContext2D;

// ---------- colour & noise helpers ----------
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Deterministic 0..1 noise so roadside decor stays put as the road scrolls. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

function makeTile(size: number, base: string, specks: [string, number][], seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const t = c.getContext('2d')!;
  t.fillStyle = base; t.fillRect(0, 0, size, size);
  let i = 0;
  for (const [color, count] of specks) {
    t.fillStyle = color;
    for (let k = 0; k < count; k++, i++) t.fillRect(Math.floor(hash(seed + i) * size), Math.floor(hash(seed + i + 999) * size), 1 + (hash(i) > 0.8 ? 1 : 0), 1);
  }
  return c;
}

let asphalt: HTMLCanvasElement | null = null;
let grass: HTMLCanvasElement | null = null;
let gravel: HTMLCanvasElement | null = null;

function tiles() {
  asphalt ??= makeTile(64, '#3b3c42', [['#45464d', 160], ['#323338', 160], ['#55565e', 30]], 1);
  grass ??= makeTile(64, '#2f6b2f', [['#367a35', 220], ['#285e29', 220], ['#43893f', 40]], 2);
  gravel ??= makeTile(64, '#55524a', [['#625e55', 160], ['#4a4740', 160]], 3);
}

/** Fill a vertical strip with a tile, scrolled by the travelled distance. */
function scrollFill(g: G, tile: HTMLCanvasElement, x: number, w: number, dist: number) {
  const off = dist % tile.height;
  for (let y = -tile.height + off; y < CFG.H; y += tile.height)
    for (let xx = x; xx < x + w; xx += tile.width)
      g.drawImage(tile, 0, 0, Math.min(tile.width, x + w - xx), tile.height, xx, y, Math.min(tile.width, x + w - xx), tile.height);
}

// ---------- road & roadside ----------
export function drawRoad(g: G, dist: number, playerY: number) {
  tiles();
  scrollFill(g, grass!, 0, roadLeft, dist);
  scrollFill(g, grass!, roadRight, CFG.W - roadRight, dist);
  scrollFill(g, asphalt!, roadLeft, roadRight - roadLeft - CFG.shoulder, dist);
  scrollFill(g, gravel!, roadRight - CFG.shoulder, CFG.shoulder, dist);

  // rumble strips on the shoulder edge
  g.fillStyle = '#6b675e';
  for (let y = -20 + (dist % 20); y < CFG.H; y += 20) g.fillRect(roadRight - CFG.shoulder + 4, y, 6, 8);

  // edge lines and lane dashes
  g.fillStyle = '#e9e9e2';
  g.fillRect(roadLeft + 2, 0, 3, CFG.H);
  g.fillRect(roadRight - CFG.shoulder - 3, 0, 3, CFG.H);
  g.fillRect(roadRight - 4, 0, 2, CFG.H);
  const dash = dist % 60;
  for (let i = 1; i < CFG.lanes; i++) {
    const x = roadLeft + laneWidth * i - 1;
    for (let y = -60 + dash; y < CFG.H; y += 60) g.fillRect(x, y, 3, 30);
  }
  // asphalt seam shadows next to the edges
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(roadLeft, 0, 2, CFG.H);
  g.fillRect(roadRight, 0, 3, CFG.H);

  drawDecor(g, dist, playerY);
}

function drawDecor(g: G, dist: number, playerY: number) {
  const seg = 44;
  // world y of something drawn at screen y:  wy = dist + playerY - screenY
  const wyMin = dist + playerY - CFG.H - 60, wyMax = dist + playerY + 60;
  for (let k = Math.floor(wyMin / seg); k <= Math.ceil(wyMax / seg); k++) {
    const sy = dist + playerY - k * seg;
    for (const side of [0, 1]) {
      const r = hash(k * 2 + side);
      if (r > 0.55) continue;
      const left = side === 0;
      const xMin = left ? 6 : roadRight + 8, xMax = left ? roadLeft - 10 : CFG.W - 6;
      const x = xMin + hash(k * 7 + side) * (xMax - xMin);
      if (r < 0.22) tree(g, x, sy, 9 + hash(k * 3 + side) * 5);
      else if (r < 0.42) bush(g, x, sy);
      else rock(g, x, sy);
    }
  }
  // kilometre markers
  const kmFirst = Math.floor(wyMin / CFG.pxPerKm), kmLast = Math.ceil(wyMax / CFG.pxPerKm);
  for (let m = Math.max(1, kmFirst); m <= kmLast; m++) {
    const sy = dist + playerY - m * CFG.pxPerKm;
    if (sy < -30 || sy > CFG.H + 30) continue;
    const x = roadRight + 6;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2, sy + 2, 20, 24);
    g.fillStyle = '#f2f2ea'; g.fillRect(x, sy, 20, 24);
    g.fillStyle = '#1e3a8a'; g.fillRect(x, sy, 20, 6);
    g.fillStyle = '#111'; g.font = 'bold 9px monospace'; g.textAlign = 'center';
    g.fillText(String(m), x + 10, sy + 19);
    g.textAlign = 'start';
  }
}

function tree(g: G, x: number, y: number, r: number) {
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 4, y + 5, r, r * 0.8, 0, 0, 7); g.fill();
  g.fillStyle = '#1f4d1f'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = '#2b6a2a'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, 7); g.fill();
  g.fillStyle = '#3d8a37'; g.beginPath(); g.arc(x - r * 0.4, y - r * 0.4, r * 0.35, 0, 7); g.fill();
}
function bush(g: G, x: number, y: number) {
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 2, y + 3, 7, 4, 0, 0, 7); g.fill();
  g.fillStyle = '#2d5e24'; g.beginPath(); g.arc(x - 3, y, 4, 0, 7); g.arc(x + 3, y, 5, 0, 7); g.fill();
  g.fillStyle = '#4b8b3a'; g.fillRect(x - 3, y - 3, 2, 2);
}
function rock(g: G, x: number, y: number) {
  g.fillStyle = '#6f6f6a'; rr(g, x - 4, y - 3, 8, 6, 2);
  g.fillStyle = '#8c8c86'; g.fillRect(x - 3, y - 3, 4, 2);
}

// ---------- vehicles ----------
export interface VehicleView {
  kind: 'carro' | 'moto' | 'caminhao' | 'caminhonete';
  x: number; y: number; w: number; h: number;
  color: string;
  braking: boolean;
  blinkRight: boolean;
  tint: boolean;
  plate: 'normal' | 'dark' | 'none';
  phone: boolean;
  cargoPeople: boolean;
  sand: boolean;
  /** moto riders: true = helmet */
  riders: boolean[];
  wheelie: boolean;
  oneHand: boolean;
  highlight: boolean;
}

export function drawVehicle(g: G, v: VehicleView, t: number) {
  if (v.kind === 'moto') return drawMoto(g, v);
  const x = Math.round(v.x - v.w / 2), y = Math.round(v.y - v.h / 2), w = v.w, h = v.h;

  g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, x + 3, y + 4, w, h, 5);
  // wheels
  g.fillStyle = '#121212';
  const axles = v.kind === 'caminhao' ? [6, h - 30, h - 16] : [7, h - 15];
  for (const a of axles) { g.fillRect(x - 2, y + a, 3, 9); g.fillRect(x + w - 1, y + a, 3, 9); }

  if (v.kind === 'caminhao') {
    // trailer
    g.fillStyle = shade(v.color, -10); rr(g, x, y + 24, w, h - 24, 2);
    g.fillStyle = v.sand ? '#c8a86a' : shade(v.color, 12);
    g.fillRect(x + 3, y + 27, w - 6, h - 31);
    if (v.sand) { g.fillStyle = '#b39150'; for (let i = 0; i < 6; i++) g.fillRect(x + 5 + (i * 7) % (w - 10), y + 32 + i * 8, 4, 2); }
    else { g.fillStyle = shade(v.color, -25); for (let yy = y + 32; yy < y + h - 6; yy += 8) g.fillRect(x + 3, yy, w - 6, 1); }
    // cab
    g.fillStyle = '#d9d9d4'; rr(g, x + 1, y, w - 2, 22, 4);
    g.fillStyle = '#bdbdb7'; g.fillRect(x + 1, y + 16, w - 2, 6);
    glass(g, x + 4, y + 4, w - 8, 6, v.tint);
  } else {
    g.fillStyle = v.color; rr(g, x, y, w, h, 5);
    g.fillStyle = shade(v.color, -30); g.fillRect(x, y + 6, 2, h - 12); g.fillRect(x + w - 2, y + 6, 2, h - 12);
    g.fillStyle = shade(v.color, 22); g.fillRect(x + 4, y + 2, w - 8, 6);
    glass(g, x + 3, y + 9, w - 6, 8, v.tint);
    if (v.kind === 'carro') {
      g.fillStyle = shade(v.color, 14); g.fillRect(x + 4, y + 18, w - 8, h - 31);
      glass(g, x + 4, y + h - 13, w - 8, 5, v.tint);
    } else {
      // pickup: short roof then open bed
      g.fillStyle = shade(v.color, 14); g.fillRect(x + 4, y + 18, w - 8, 6);
      g.fillStyle = '#2a2a2a'; g.fillRect(x + 3, y + 26, w - 6, h - 30);
      g.fillStyle = shade(v.color, -15); g.fillRect(x + 2, y + 26, 1, h - 30); g.fillRect(x + w - 3, y + 26, 1, h - 30);
      if (v.cargoPeople) {
        const heads = ['#e0b089', '#8d5a3b', '#c58c5c'];
        heads.forEach((c, i) => { g.fillStyle = '#334'; g.fillRect(x + 5 + i * 6, y + 34 + (i % 2) * 8, 5, 6); g.fillStyle = c; g.beginPath(); g.arc(x + 7 + i * 6, y + 33 + (i % 2) * 8, 3, 0, 7); g.fill(); });
      }
    }
    if (v.phone) { g.fillStyle = '#7ff'; g.fillRect(x + 5, y + 11, 3, 4); g.fillStyle = 'rgba(120,255,255,0.35)'; g.fillRect(x + 3, y + 9, 7, 8); }
  }
  // lights
  g.fillStyle = '#fff3b0'; g.fillRect(x + 2, y + 1, 4, 2); g.fillRect(x + w - 6, y + 1, 4, 2);
  g.fillStyle = v.braking ? '#ff4040' : '#a01818';
  g.fillRect(x + 1, y + h - 3, 5, 2); g.fillRect(x + w - 6, y + h - 3, 5, 2);
  if (v.blinkRight && Math.floor(t * 3) % 2) { g.fillStyle = '#ffb020'; g.fillRect(x + w - 3, y + 1, 3, 3); g.fillRect(x + w - 3, y + h - 4, 3, 3); }
  if (v.plate !== 'none') { g.fillStyle = v.plate === 'dark' ? '#3b2a1a' : '#f2f2f2'; g.fillRect(v.x - 5, y + h - 2, 10, 3); }
  if (v.highlight) { g.strokeStyle = '#facc15'; g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeRect(x - 4, y - 4, w + 8, h + 8); g.setLineDash([]); }
}

function glass(g: G, x: number, y: number, w: number, h: number, tint: boolean) {
  if (tint) { g.fillStyle = '#060606'; g.fillRect(x, y, w, h); return; }
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, '#a9d3ea'); gr.addColorStop(1, '#4d7a98');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 1, y + 1, Math.max(2, w / 4), 1);
}

function drawMoto(g: G, v: VehicleView) {
  const x = Math.round(v.x), y = Math.round(v.y - v.h / 2);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 3, y + v.h / 2 + 3, 6, v.h / 2, 0, 0, 7); g.fill();
  g.fillStyle = '#111';
  if (!v.wheelie) g.fillRect(x - 2, y, 4, 7);
  g.fillRect(x - 2, y + v.h - 7, 4, 7);
  g.fillStyle = v.color; rr(g, x - 4, y + 6, 8, v.h - 12, 3);
  g.fillStyle = '#444'; g.fillRect(x - 6, y + 7, 12, 2); // handlebar
  // rider(s)
  v.riders.forEach((helmet, i) => {
    const ry = y + 13 + i * 8;
    g.fillStyle = i === 0 ? '#263b5e' : '#5e2633'; rr(g, x - 6, ry - 1, 12, 7, 3);
    if (v.oneHand && i === 0) { g.fillStyle = '#e0b089'; g.fillRect(x + 6, ry, 3, 2); g.fillStyle = '#ddd'; g.fillRect(x + 8, ry + 2, 4, 5); }
    g.fillStyle = helmet ? (i === 0 ? '#f1f1f1' : '#e6c229') : '#c99568';
    g.beginPath(); g.arc(x, ry, helmet ? 4.5 : 3.6, 0, 7); g.fill();
    if (helmet) { g.fillStyle = '#223'; g.fillRect(x - 3, ry - 4, 6, 2); }
    else { g.fillStyle = '#2b1a10'; g.fillRect(x - 3, ry - 3, 6, 2); }
  });
  if (v.plate !== 'none') { g.fillStyle = v.plate === 'dark' ? '#3b2a1a' : '#f2f2f2'; g.fillRect(x - 3, y + v.h - 2, 6, 2); }
  if (v.highlight) { g.strokeStyle = '#facc15'; g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeRect(x - 10, y - 4, 20, v.h + 8); g.setLineDash([]); }
}

/** Patrol-car footprint per model (also used for collisions). */
export const PATROL_DIMS: Record<Modelo, [number, number]> = { sedan: [26, 46], suv: [28, 50], pickup: [28, 52] };

export function drawPatrol(g: G, x: number, y: number, sirenOn: boolean, t: number, night: boolean, skin: SkinViatura) {
  const [w, h] = PATROL_DIMS[skin.modelo];
  const px = Math.round(x - w / 2), py = Math.round(y - h / 2);
  const blink = Math.floor(t * 7) % 2 === 0;
  if (sirenOn) {
    const glow = (cx: number, color: string) => {
      const gr = g.createRadialGradient(cx, py + 21, 1, cx, py + 21, night ? 70 : 40);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(cx - 80, py - 60, 160, 160);
    };
    glow(px + 8, blink ? 'rgba(255,40,40,0.45)' : 'rgba(40,90,255,0.15)');
    glow(px + w - 8, blink ? 'rgba(40,90,255,0.15)' : 'rgba(40,90,255,0.45)');
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, px + 3, py + 4, w, h, 5);
  g.fillStyle = '#121212';
  for (const a of [7, h - 15]) { g.fillRect(px - 2, py + a, 3, 9); g.fillRect(px + w - 1, py + a, 3, 9); }

  // body + finish
  g.save();
  g.beginPath(); g.roundRect(px, py, w, h, skin.modelo === 'sedan' ? 5 : 3); g.clip();
  if (skin.padrao === 'ouro') {
    const gr = g.createLinearGradient(px, py, px + w, py + h);
    gr.addColorStop(0, '#f6d365'); gr.addColorStop(0.5, skin.base); gr.addColorStop(1, '#8a6508');
    g.fillStyle = gr;
  } else g.fillStyle = skin.base;
  g.fillRect(px, py, w, h);
  if (skin.padrao === 'camo') {
    const blots = ['#2f3a1e', '#6b7a45', '#3d4a26'];
    for (let i = 0; i < 14; i++) {
      g.fillStyle = blots[i % 3];
      g.beginPath(); g.ellipse(px + hash(i * 3.1) * w, py + hash(i * 7.7) * h, 3 + hash(i) * 4, 2 + hash(i * 2) * 3, hash(i * 5) * 3, 0, 7); g.fill();
    }
  }
  if (skin.padrao === 'ouro') { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(px + 4, py, 3, h); }
  g.restore();
  g.fillStyle = shade(skin.base, -30); g.fillRect(px, py + 6, 2, h - 12); g.fillRect(px + w - 2, py + 6, 2, h - 12);

  // livery: hood stripe, side stripes
  if (skin.padrao === 'neon') { g.shadowColor = skin.faixa; g.shadowBlur = night ? 12 : 6; }
  g.fillStyle = skin.faixa; g.fillRect(px + 2, py + 4, w - 4, 3);
  g.fillRect(px + 1, py + 26, 2, h - 34); g.fillRect(px + w - 3, py + 26, 2, h - 34);
  g.shadowBlur = 0;
  g.fillStyle = skin.detalhe; g.fillRect(px + 2, py + 7, w - 4, 1);
  glass(g, px + 3, py + 9, w - 6, 7, false);

  // roof with PRF lettering
  const roofH = skin.modelo === 'pickup' ? 12 : h - 30;
  g.fillStyle = skin.padrao === 'liso' ? shade(skin.base, 10) : skin.base;
  g.fillRect(px + 4, py + 17, w - 8, roofH);
  g.fillStyle = skin.faixa; g.font = 'bold 7px monospace'; g.textAlign = 'center';
  if (skin.modelo !== 'pickup') g.fillText('PRF', x, py + 33);
  g.textAlign = 'start';
  if (skin.modelo === 'pickup') {
    // open bed with an equipment box
    g.fillStyle = '#2a2a2a'; g.fillRect(px + 3, py + 31, w - 6, h - 35);
    g.fillStyle = skin.faixa; g.fillRect(px + 5, py + 33, w - 10, 7);
    g.fillStyle = skin.detalhe; g.font = 'bold 6px monospace'; g.textAlign = 'center'; g.fillText('PRF', x, py + 39); g.textAlign = 'start';
  } else {
    glass(g, px + 4, py + h - 12, w - 8, 5, false);
  }
  // light bar
  g.fillStyle = '#222'; g.fillRect(px + 3, py + 18, w - 6, 5);
  g.fillStyle = sirenOn ? (blink ? '#ff3030' : '#5a1010') : '#5a1010'; g.fillRect(px + 4, py + 19, (w - 10) / 2, 3);
  g.fillStyle = sirenOn ? (blink ? '#102a6a' : '#3070ff') : '#102a6a'; g.fillRect(px + w / 2 + 1, py + 19, (w - 10) / 2, 3);
  g.fillStyle = '#fff3b0'; g.fillRect(px + 2, py + 1, 4, 2); g.fillRect(px + w - 6, py + 1, 4, 2);
  g.fillStyle = '#a01818'; g.fillRect(px + 1, py + h - 3, 5, 2); g.fillRect(px + w - 6, py + h - 3, 5, 2);
}

// ---------- people ----------
export interface WalkerLook { farda: Farda; pele?: string }

/** Top-down person. `facing` in radians, 0 = up the screen. `phase` drives the walk cycle. */
export function drawWalker(g: G, x: number, y: number, facing: number, phase: number, look: WalkerLook) {
  const f = look.farda;
  const pele = look.pele ?? '#c99568';
  const swing = Math.sin(phase) * 3;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 2, y + 3, 8, 5, 0, 0, 7); g.fill();
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.rotate(facing);
  // legs
  g.fillStyle = f.calca; g.fillRect(-4, 1 + swing, 3, 6); g.fillRect(1, 1 - swing, 3, 6);
  g.fillStyle = '#111'; g.fillRect(-4, 6 + swing, 3, 2); g.fillRect(1, 6 - swing, 3, 2);
  // arms
  g.fillStyle = f.camisa; g.fillRect(-9, -3 - swing, 3, 7); g.fillRect(6, -3 + swing, 3, 7);
  g.fillStyle = pele; g.fillRect(-9, 4 - swing, 3, 2); g.fillRect(6, 4 + swing, 3, 2);
  // torso
  g.fillStyle = f.camisa; rr(g, -7, -5, 14, 10, 4);
  if (f.camo) {
    g.fillStyle = '#2f3a1e'; g.fillRect(-5, -3, 3, 2); g.fillRect(2, 0, 3, 2);
    g.fillStyle = '#6b7a45'; g.fillRect(-1, -4, 2, 2); g.fillRect(-4, 1, 2, 2);
  }
  g.fillStyle = f.detalhe; g.fillRect(-6, -4, 2, 2); g.fillRect(4, -4, 2, 2);
  // head + headwear
  const hx = 0, hy = -1;
  g.fillStyle = pele; g.beginPath(); g.arc(hx, hy, 4, 0, 7); g.fill();
  g.fillStyle = f.chapeuCor;
  switch (f.chapeu) {
    case 'bone':
      g.beginPath(); g.arc(hx, hy + 0.5, 4.3, 0, 7); g.fill();
      g.fillRect(hx - 3, hy - 7, 6, 3);
      break;
    case 'quepe':
      g.beginPath(); g.arc(hx, hy, 5, 0, 7); g.fill();
      g.fillStyle = '#111'; g.fillRect(hx - 4, hy - 6, 8, 2);
      g.fillStyle = f.detalhe; g.fillRect(hx - 1, hy - 2, 2, 2);
      break;
    case 'capacete':
      g.beginPath(); g.arc(hx, hy, 5.5, 0, 7); g.fill();
      g.fillStyle = '#1f2937'; g.fillRect(hx - 4, hy - 6, 8, 2);
      break;
    case 'capuz':
      g.beginPath(); g.arc(hx, hy + 1, 5.5, 0, 7); g.fill();
      g.fillStyle = pele; g.beginPath(); g.arc(hx, hy - 2, 2.5, Math.PI, 0); g.fill();
      break;
    case 'abas':
      g.beginPath(); g.arc(hx, hy, 7, 0, 7); g.fill();
      g.fillStyle = shade(f.chapeuCor, -25); g.beginPath(); g.arc(hx, hy, 3.8, 0, 7); g.fill();
      break;
  }
  g.restore();
}

export function drawCapybara(g: G, x: number, y: number, dir: number, t: number) {
  const bob = Math.floor(t * 6) % 2;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 2, y + 6, 10, 4, 0, 0, 7); g.fill();
  g.fillStyle = '#7a4e2a'; rr(g, x - 10, y - 6 + bob, 18, 12, 5);
  g.fillStyle = '#8f5f35'; rr(g, x - 7, y - 5 + bob, 10, 5, 3);
  g.fillStyle = '#6a4222'; rr(g, x + dir * 8 - 4, y - 5 + bob, 9, 9, 3);
  g.fillStyle = '#111'; g.fillRect(x + dir * 10 - 1, y - 3 + bob, 2, 2);
  g.fillStyle = '#4b2e17'; g.fillRect(x - 7, y + 5, 3, 3); g.fillRect(x + 4, y + 5, 3, 3);
}

// ---------- lighting ----------
/** Headlight cone pointing up the screen. Call with globalCompositeOperation = 'lighter'. */
export function headlight(g: G, x: number, y: number, strength: number, long = false) {
  const len = long ? 210 : 130, spread = long ? 40 : 28;
  const gr = g.createLinearGradient(0, y, 0, y - len);
  gr.addColorStop(0, `rgba(255,240,180,${0.42 * strength})`);
  gr.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x - spread, y - len); g.lineTo(x + spread, y - len); g.lineTo(x + 7, y); g.fill();
}

export function tailGlow(g: G, x: number, y: number, strength: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, 14);
  gr.addColorStop(0, `rgba(255,40,40,${0.5 * strength})`); gr.addColorStop(1, 'rgba(255,40,40,0)');
  g.fillStyle = gr; g.fillRect(x - 14, y - 14, 28, 28);
}

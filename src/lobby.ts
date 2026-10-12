// The PRF base: a small walkable map with the locker room (uniforms), the
// garage desk (liveries), Zé Roberto, the ranking board and the parking lot
// where the player boards a patrol car to start a shift.
import { CFG } from './config';
import { drawPatrol, drawWalker, PATROL_DIMS, shade } from './art';
import { VIATURAS, fardaById, type Farda, type SkinViatura } from './data/skins';
import type { Save } from './save';

type G = CanvasRenderingContext2D;
interface Rect { x: number; y: number; w: number; h: number }

export type LobbyAct = 'vestiario' | 'garagem' | 'mentor' | 'ranking' | `embarcar:${string}`;
export interface Interact { act: LobbyAct; x: number; y: number; label: string }

export const LOBBY_START = { x: 240, y: 286 };
const ROOM_BOTTOM = 214;
/** Top wall; tall enough that the HUD bar doesn't cover the sign. */
const WALL = 54;
const DOOR = { x0: 205, x1: 275 };
const PARK_Y = 470;
const STALLS = [72, 156, 240, 324, 408];

const COUNTER_V: Rect = { x: 28, y: 118, w: 130, h: 22 };
const COUNTER_G: Rect = { x: 322, y: 118, w: 130, h: 22 };
const DESK: Rect = { x: 205, y: 104, w: 70, h: 16 };
const BOARD: Rect = { x: 16, y: 240, w: 112, h: 72 };
const FLAG: Rect = { x: 432, y: 262, w: 10, h: 10 };

const ZE: Farda = {
  id: 'ze', nome: 'Roberto', desc: '', preco: 0,
  camisa: '#475569', calca: '#334155', chapeu: 'abas', chapeuCor: '#e7e5e4', detalhe: '#facc15',
};

/** Owned patrol cars, parked one per stall. */
function parked(save: Save): SkinViatura[] {
  return VIATURAS.filter(v => save.owned.includes(`v:${v.id}`)).slice(0, STALLS.length);
}

export function obstacles(save: Save): Rect[] {
  const walls: Rect[] = [
    { x: 0, y: 0, w: CFG.W, h: WALL },
    { x: 0, y: 0, w: 10, h: ROOM_BOTTOM + 8 },
    { x: CFG.W - 10, y: 0, w: 10, h: ROOM_BOTTOM + 8 },
    { x: 0, y: ROOM_BOTTOM, w: DOOR.x0, h: 10 },
    { x: DOOR.x1, y: ROOM_BOTTOM, w: CFG.W - DOOR.x1, h: 10 },
  ];
  const cars = parked(save).map((v, i) => {
    const [w, h] = PATROL_DIMS[v.modelo];
    return { x: STALLS[i] - w / 2, y: PARK_Y - h / 2, w, h };
  });
  return [...walls, COUNTER_V, COUNTER_G, DESK, BOARD, FLAG, ...cars];
}

export function interactables(save: Save): Interact[] {
  const list: Interact[] = [
    { act: 'vestiario', x: COUNTER_V.x + COUNTER_V.w / 2, y: COUNTER_V.y + 36, label: 'F · VESTIÁRIO (fardas)' },
    { act: 'garagem', x: COUNTER_G.x + COUNTER_G.w / 2, y: COUNTER_G.y + 36, label: 'F · GARAGEM (viaturas)' },
    { act: 'mentor', x: DESK.x + DESK.w / 2, y: DESK.y + 34, label: 'F · ROBERTO (estudar)' },
    { act: 'ranking', x: BOARD.x + BOARD.w / 2, y: BOARD.y + BOARD.h + 14, label: 'F · RANKING' },
  ];
  parked(save).forEach((v, i) => {
    const [w] = PATROL_DIMS[v.modelo];
    list.push({ act: `embarcar:${v.id}`, x: STALLS[i] - w / 2 - 12, y: PARK_Y, label: `F · EMBARCAR: ${v.nome}` });
  });
  return list;
}

export function nearest(list: Interact[], p: { x: number; y: number }, radius = 26): Interact | null {
  let best: Interact | null = null, bd = radius;
  for (const it of list) { const d = Math.hypot(it.x - p.x, it.y - p.y); if (d < bd) { best = it; bd = d; } }
  return best;
}

/** Move a radius-6 walker, sliding along obstacles. */
export function moveWalker(p: { x: number; y: number }, dx: number, dy: number, rects: Rect[]) {
  const hit = (x: number, y: number) =>
    x < 8 || x > CFG.W - 8 || y < 40 || y > CFG.H - 12 ||
    rects.some(r => x + 6 > r.x && x - 6 < r.x + r.w && y + 6 > r.y && y - 6 < r.y + r.h);
  if (!hit(p.x + dx, p.y)) p.x += dx;
  if (!hit(p.x, p.y + dy)) p.y += dy;
}

// ---------- drawing ----------
let floorTile: HTMLCanvasElement | null = null;
let yardTile: HTMLCanvasElement | null = null;
function tile(base: string, a: string, b: string, grid: boolean) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const t = c.getContext('2d')!;
  t.fillStyle = base; t.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 60; i++) { t.fillStyle = i % 2 ? a : b; t.fillRect((i * 37) % 32, (i * 53) % 32, 1, 1); }
  if (grid) { t.fillStyle = 'rgba(0,0,0,0.12)'; t.fillRect(0, 31, 32, 1); t.fillRect(31, 0, 1, 32); }
  return c;
}

export function drawLobby(g: G, t: number, save: Save, top3: string[], near: Interact | null) {
  floorTile ??= tile('#cfc6b4', '#d8d0bf', '#c3b9a5', true);
  yardTile ??= tile('#7c7a74', '#86847d', '#706e68', false);

  for (let y = ROOM_BOTTOM; y < CFG.H; y += 32) for (let x = 0; x < CFG.W; x += 32) g.drawImage(yardTile, x, y);
  for (let y = WALL; y < ROOM_BOTTOM; y += 32) for (let x = 0; x < CFG.W; x += 32) g.drawImage(floorTile, x, y);

  // walls + sign
  g.fillStyle = '#334155'; g.fillRect(0, 0, CFG.W, WALL);
  g.fillStyle = '#1e3a8a'; g.fillRect(120, 28, 240, 22);
  g.strokeStyle = '#facc15'; g.lineWidth = 2; g.strokeRect(120, 28, 240, 22);
  g.fillStyle = '#facc15'; g.font = 'bold 11px monospace'; g.textAlign = 'center';
  g.fillText('BASE OPERACIONAL · BR-116', CFG.W / 2, 43);
  g.fillStyle = '#475569';
  g.fillRect(0, 0, 10, ROOM_BOTTOM + 8); g.fillRect(CFG.W - 10, 0, 10, ROOM_BOTTOM + 8);
  g.fillRect(0, ROOM_BOTTOM, DOOR.x0, 10); g.fillRect(DOOR.x1, ROOM_BOTTOM, CFG.W - DOOR.x1, 10);
  g.fillStyle = '#64748b'; g.fillRect(DOOR.x0 - 4, ROOM_BOTTOM - 2, 4, 14); g.fillRect(DOOR.x1, ROOM_BOTTOM - 2, 4, 14);

  // locker room: lockers on the wall, mannequin with the equipped uniform, counter
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i % 2 ? '#64748b' : '#5b6779'; g.fillRect(16 + i * 28, WALL + 2, 26, 30);
    g.fillStyle = '#94a3b8'; g.fillRect(36 + i * 28, WALL + 14, 2, 6);
  }
  drawWalker(g, 93, COUNTER_V.y - 12, Math.PI, 0, { farda: fardaById(save.farda) });
  counter(g, COUNTER_V, 'VESTIÁRIO');

  // garage desk: key rack + a framed livery
  g.fillStyle = '#5b4636'; g.fillRect(338, WALL + 4, 96, 26);
  for (let i = 0; i < 6; i++) { g.fillStyle = '#facc15'; g.fillRect(346 + i * 14, WALL + 12, 3, 6); g.fillStyle = '#e5e7eb'; g.fillRect(345 + i * 14, WALL + 18, 5, 3); }
  counter(g, COUNTER_G, 'GARAGEM');

  // mentor desk
  g.fillStyle = '#7c5a3c'; g.fillRect(DESK.x, DESK.y, DESK.w, DESK.h);
  g.fillStyle = '#e5e7eb'; g.fillRect(DESK.x + 8, DESK.y + 4, 14, 9); g.fillRect(DESK.x + 26, DESK.y + 3, 10, 10);
  drawWalker(g, DESK.x + DESK.w / 2, DESK.y - 12, Math.PI, 0, { farda: ZE, pele: '#d6a77a' });
  label(g, 'FLASHCARDS', DESK.x + DESK.w / 2, DESK.y - 26, '#e5e7eb');

  // ranking board
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(BOARD.x + 3, BOARD.y + 3, BOARD.w, BOARD.h);
  g.fillStyle = '#0f172a'; g.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
  g.strokeStyle = '#facc15'; g.strokeRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
  g.fillStyle = '#facc15'; g.font = 'bold 9px monospace'; g.fillText('🏆 RANKING', BOARD.x + BOARD.w / 2, BOARD.y + 14);
  g.font = '9px monospace'; g.fillStyle = '#e5e7eb';
  (top3.length ? top3 : ['— vazio —']).slice(0, 3).forEach((n, i) => g.fillText(`${i + 1}. ${n}`.slice(0, 17), BOARD.x + BOARD.w / 2, BOARD.y + 32 + i * 14));

  // flag
  g.fillStyle = '#d1d5db'; g.fillRect(FLAG.x + 3, FLAG.y - 40, 2, 48);
  const wave = Math.sin(t * 4) * 2;
  g.fillStyle = '#16a34a'; g.beginPath(); g.moveTo(FLAG.x + 5, FLAG.y - 40); g.lineTo(FLAG.x + 33, FLAG.y - 34 + wave); g.lineTo(FLAG.x + 5, FLAG.y - 22); g.fill();
  g.fillStyle = '#facc15'; g.beginPath(); g.moveTo(FLAG.x + 9, FLAG.y - 31); g.lineTo(FLAG.x + 19, FLAG.y - 35 + wave / 2); g.lineTo(FLAG.x + 29, FLAG.y - 31 + wave); g.lineTo(FLAG.x + 19, FLAG.y - 27 + wave / 2); g.fill();
  g.fillStyle = '#1e3a8a'; g.beginPath(); g.arc(FLAG.x + 19, FLAG.y - 31 + wave / 2, 2.5, 0, 7); g.fill();
  g.fillStyle = '#6b7280'; g.fillRect(FLAG.x, FLAG.y, FLAG.w, FLAG.h);

  // parking lot
  g.fillStyle = '#e5e7eb';
  g.font = 'bold 10px monospace'; g.fillText('ESTACIONAMENTO DAS VIATURAS', CFG.W / 2, PARK_Y - 52);
  for (let i = 0; i <= STALLS.length; i++) g.fillRect(30 + i * 84, PARK_Y - 34, 2, 68);
  g.fillRect(30, PARK_Y + 34, 84 * STALLS.length + 2, 2);
  parked(save).forEach((v, i) => {
    drawPatrol(g, STALLS[i], PARK_Y, false, t, false, v);
    if (v.id === save.viatura) label(g, '★ EQUIPADA', STALLS[i], PARK_Y + 46, '#facc15');
  });
  for (let i = parked(save).length; i < STALLS.length; i++) label(g, 'vaga livre', STALLS[i], PARK_Y + 4, '#9ca3af');

  // exit to the highway
  g.fillStyle = '#3b3c42'; g.fillRect(0, CFG.H - 40, CFG.W, 40);
  g.fillStyle = '#e9e9e2'; for (let x = 10; x < CFG.W; x += 40) g.fillRect(x, CFG.H - 21, 20, 2);
  label(g, '↓ SAÍDA PARA A BR-116 ↓', CFG.W / 2, CFG.H - 28, '#facc15');

  // highlight the thing in reach
  if (near) {
    const pulse = 0.5 + Math.sin(t * 6) * 0.5;
    g.strokeStyle = `rgba(250,204,21,${0.4 + pulse * 0.5})`; g.lineWidth = 2;
    g.beginPath(); g.arc(near.x, near.y, 12 + pulse * 3, 0, 7); g.stroke();
  }
  g.textAlign = 'start';
}

function counter(g: G, r: Rect, text: string) {
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(r.x + 3, r.y + 4, r.w, r.h);
  g.fillStyle = '#7c5a3c'; g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = shade('#7c5a3c', 25); g.fillRect(r.x, r.y, r.w, 5);
  label(g, text, r.x + r.w / 2, r.y + 17, '#fde68a');
}

function label(g: G, text: string, x: number, y: number, color: string) {
  g.font = 'bold 9px monospace'; g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(text, x + 1, y + 1);
  g.fillStyle = color; g.fillText(text, x, y);
}

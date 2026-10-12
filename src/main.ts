import { CFG, laneCenter, roadLeft, roadRight, shoulderCenter } from './config';
import {
  SITUACOES, CLASSES, CLASSE_INFO, MEDIDAS, PISTAS_NOTURNAS,
  type Situacao, type Veiculo, type Pista,
} from './data/situacoes';
import { CRIMES, LOCAIS, TIPOS_CRIME, type Crime } from './data/crimes';
import { createBackend, type Run } from './backend';
import { sfx } from './audio';
import { drawRoad, drawVehicle, drawPatrol, drawCapybara, drawWalker, headlight, tailGlow, PATROL_DIMS, type VehicleView } from './art';
import { VIATURAS, FARDAS, viaturaById, fardaById } from './data/skins';
import { loadSave, onPersist, persist, type Save } from './save';
import { LOBBY_START, drawLobby, interactables, moveWalker, nearest, obstacles, type Interact } from './lobby';
import { inject } from '@vercel/analytics';

// Cookieless page-view counts; a no-op outside Vercel deployments.
inject();

// ---------- types & state ----------
type Mode = 'menu' | 'lobby' | 'shop' | 'patrol' | 'pulling' | 'chase' | 'foot' | 'inspect' | 'report' | 'posto' | 'flash';
/** 'leave': released after an inspection, merging back into traffic. */
type CarState = 'drive' | 'pull' | 'stopped' | 'flee' | 'leave';

interface Car {
  x: number; y: number; w: number; h: number;
  speed: number; baseSpeed: number; prevSpeed: number; lane: number;
  color: string; veiculo: Veiculo; sit: Situacao | null;
  state: CarState; phase: number; weaveT: number; targetX: number;
  fled: boolean; crime: Crime | null;
}

interface ReportItem { artigo: string; classe: string; ok: boolean }

type ParticleKind = 'smoke' | 'sand' | 'trash' | 'note' | 'dust';
interface Particle { kind: ParticleKind; x: number; y: number; vx: number; vy: number; r: number; life: number; max: number }
interface Popup { text: string; x: number; y: number; t: number; color: string }

const canvas = document.getElementById('game') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const overlay = document.getElementById('overlay')!;
const backend = createBackend();

const SIZES: Record<Veiculo, [number, number]> = {
  carro: [26, 44], moto: [14, 30], caminhonete: [28, 52], caminhao: [32, 84],
};
const COLORS = ['#c0392b', '#2471a3', '#7d3c98', '#138d75', '#ca6f1e', '#839192', '#d4ac0d', '#e5e8e8', '#1c2833', '#922b21'];
const PISTA_LABEL: Record<Pista, string> = {
  sem_capacete: 'sem capacete?', zigue_zague: 'zigue-zague', farol_apagado: 'farol apagado',
  pelicula: 'vidro escuro', placa: 'placa ilegível', fumaca: 'fumaça preta', celular: 'no celular',
  sem_cinto: 'sem cinto', carroceria: 'gente na caçamba', acostamento: 'no acostamento', nenhum: '',
  empinando: 'empinando a moto', farol_moto: 'moto sem farol', mao_guidom: 'mão fora do guidom',
  radar: 'radar: acima da velocidade', som: 'som altíssimo', lixo: 'jogou lixo na pista',
  derrame: 'derramando carga', luz_alta: 'farol alto ofuscando', sem_placa: 'sem placa',
};

let pool: Situacao[] = [...SITUACOES];
let bag: Situacao[] = [];
let crimeBag: Crime[] = [];

let mode: Mode = 'menu';
let cars: Car[] = [];
let target: Car | null = null;
let player = { x: laneCenter(1), y: 520, speed: 0, invuln: 0 };
const freshStats = () => ({ score: 0, lives: CFG.lives, dist: 0, seconds: 0, fuel: 100, correct: 0, wrong: 0, routine: 0, prisoes: 0 });
let stats = freshStats();
let report: ReportItem[] = [];
let spawnT = 1;
let chaseT = 0;
let sirenT = 0;
let shakeT = 0;
let msg = { text: '', t: 0 };
let radio = { phase: 'idle' as 'idle' | 'asking' | 'active', t: 0, next: rand(...CFG.radioEvery) };
let capy: { x: number; y: number; dir: number } | null = null;
let fx: Particle[] = [];
let popups: Popup[] = [];
let nextPostoKm = CFG.postoEveryKm;
let postoAsk = 0;
let hasK9 = false;
let clock = 0;
const save = loadSave();
// Debounced: shop clicks and shift ends can come in bursts.
let pushT = 0;
onPersist(s => { clearTimeout(pushT); pushT = window.setTimeout(() => void backend.pushSave(s), 800); });
/** Adopts `cloud` as the local save (after sync or a device transfer). */
function adopt(cloud: Save) {
  Object.assign(save, cloud);
  persist(save, false);
}
/** Newer of local and cloud wins; the other side is overwritten. */
async function syncSave() {
  const cloud = await backend.loadSave();
  if (cloud && cloud.updatedAt >= save.updatedAt) adopt(cloud);
  else if (backend.online) await backend.pushSave(save);
}
/** The agent on foot: in the base, or out of the patrol car on the highway. */
let walker = { x: LOBBY_START.x, y: LOBBY_START.y, facing: 0, phase: 0, invuln: 0 };
let walking = false;
let stopHinted = false;
let lobbyTop3: string[] = [];
let lobbyNear: Interact | null = null;
const patrolSkin = () => viaturaById(save.viatura);
const patrolDims = () => PATROL_DIMS[patrolSkin().modelo];
/** Test hook only: force the next stop's outcome (crime: id, null = none; undefined = random). */
const forced: { flee?: boolean; crime?: string | null } = {};

const keys = new Set<string>();

// ---------- helpers ----------
function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function say(text: string, t = 2.5) { msg = { text, t }; }
function pop(text: string, color = '#facc15', x = player.x, y = player.y - 40) { popups.push({ text, x, y, t: 1.4, color }); }
function dist(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }
function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}
const dayPhase = () => (stats.seconds / CFG.dayCycle + 0.15) % 1;
function isNight() { return dayPhase() >= 0.5; }
function darkness() {
  const p = dayPhase();
  const up = Math.min(1, Math.max(0, (p - 0.45) / 0.1));
  const down = p > 0.95 ? Math.max(0, 1 - (p - 0.95) / 0.05) : 1;
  return 0.62 * Math.min(up, down);
}
const km = () => stats.dist / CFG.pxPerKm;
/** 0 at the start of a shift, 1 at CFG.maxDifficultyKm: more irregulars, more flights, denser traffic. */
const difficulty = () => Math.min(1, km() / CFG.maxDifficultyKm);
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const inBase = () => mode === 'lobby' || mode === 'shop' || (mode === 'flash' && flash.from === 'lobby');
const inShift = () => mode !== 'menu' && mode !== 'report' && !inBase() && !(mode === 'flash' && flash.from === 'menu');

/** Draw without repetition; refill only when the whole bank is used (as the original claims). */
function drawSituacao(): Situacao | null {
  for (let tries = 0; tries < pool.length + 1; tries++) {
    if (bag.length === 0) bag = shuffle(pool);
    const s = bag.pop()!;
    if (PISTAS_NOTURNAS.includes(s.pista) && !isNight()) { bag.unshift(s); continue; }
    return s;
  }
  return null;
}
function drawCrime(): Crime {
  if (crimeBag.length === 0) crimeBag = shuffle(CRIMES);
  return crimeBag.pop()!;
}

// ---------- spawning ----------
function spawnCar() {
  const sit = Math.random() < CFG.irregularChance + 0.15 * difficulty() ? drawSituacao() : null;
  const veiculo: Veiculo = sit?.veiculo ?? pick<Veiculo>(['carro', 'carro', 'carro', 'moto', 'caminhonete', 'caminhao']);
  const [w, h] = SIZES[veiculo];
  const lane = Math.floor(Math.random() * CFG.lanes);
  // speeders overtake the patrol car from behind so the radar can catch them
  const fromTop = player.speed > 230 && sit?.pista !== 'radar';
  const y = fromTop ? -h : CFG.H + h;
  const speed = fromTop ? rand(150, Math.min(300, player.speed - 40))
    : player.speed + (sit?.pista === 'radar' ? rand(140, 200) : rand(80, 170));
  const x = sit?.pista === 'acostamento' ? shoulderCenter : laneCenter(lane);
  if (cars.some(c => Math.abs(c.x - x) < 20 && Math.abs(c.y - y) < 160)) return;
  cars.push({
    x, y, w, h, speed, baseSpeed: speed, prevSpeed: speed, lane, veiculo, sit,
    color: veiculo === 'caminhao' ? pick(['#7f8c8d', '#2c3e50', '#a0522d', '#1f618d']) : pick(COLORS),
    state: 'drive', phase: Math.random() * 6, weaveT: 0, targetX: x, fled: false, crime: null,
  });
}

function emit(kind: ParticleKind, x: number, y: number) {
  const base = { kind, x, y, vx: rand(-10, 10), vy: 0, r: 2, life: 1, max: 1 };
  if (kind === 'smoke') Object.assign(base, { r: 4, vy: 120, life: 1.1, max: 1.1 });
  if (kind === 'note') Object.assign(base, { vy: -40, vx: rand(-25, 25), life: 1.2, max: 1.2 });
  if (kind === 'sand' || kind === 'trash') Object.assign(base, { vx: rand(-20, 20), life: 4, max: 4, r: kind === 'trash' ? 3 : 2 });
  if (kind === 'dust') Object.assign(base, { r: 3, vy: 60, life: 0.6, max: 0.6 });
  fx.push(base);
}

// ---------- update ----------
function update(dt: number) {
  clock += dt;
  if (msg.t > 0) msg.t -= dt;
  for (const p of popups) { p.t -= dt; p.y -= 30 * dt; }
  popups = popups.filter(p => p.t > 0);
  shakeT = Math.max(0, shakeT - dt);
  if (mode === 'menu') { stats.dist += 160 * dt; return; } // attract mode: road scrolls behind the menu
  if (mode === 'lobby') return updateLobby(dt);
  if (mode === 'inspect' || mode === 'report' || mode === 'posto' || mode === 'flash' || mode === 'shop') return;

  stats.seconds += dt;
  sirenT = Math.max(0, sirenT - dt);
  player.invuln = Math.max(0, player.invuln - dt);

  // player: driving, or parked while the agent walks
  if (mode === 'foot') {
    player.speed = 0;
    updateWalkerOnRoad(dt);
  } else {
    const maxSpeed = mode === 'chase' ? CFG.playerMaxSpeed + 60 : CFG.playerMaxSpeed;
    if (keys.has('up')) player.speed += CFG.playerAccel * dt;
    else if (keys.has('down')) player.speed -= CFG.brake * dt;
    else if (mode === 'pulling' && target) {
      // cruise assist: ease in ~90 px behind the vehicle being pulled over
      const want = target.speed + (player.y - target.y - 90) * 1.5;
      player.speed += Math.max(-CFG.brake * dt, Math.min(CFG.playerAccel * dt, want - player.speed));
    } else player.speed -= 20 * dt;
    player.speed = Math.max(0, Math.min(maxSpeed, player.speed));
    const lat = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    player.x = Math.max(roadLeft + 12, Math.min(roadRight - 12, player.x + lat * CFG.lateralSpeed * dt));
    if (player.x > roadRight - CFG.shoulder && player.speed > 80 && Math.random() < dt * 20) emit('dust', player.x + rand(-8, 8), player.y + 22);
  }
  if ((mode as Mode) === 'report') return; // run over while on foot (endShift changed the mode)

  const dy = player.speed * dt;
  stats.dist += dy;
  stats.fuel -= (dy / CFG.pxPerKm) * CFG.fuelPerKm;
  if (stats.fuel <= 0) { stats.fuel = 0; say('PANE SECA — fim do turno', 3); return endShift(); }

  // PRF post every few km: a short window to pull in with F
  postoAsk = Math.max(0, postoAsk - dt);
  if (km() >= nextPostoKm) {
    nextPostoKm += CFG.postoEveryKm;
    if (mode === 'patrol') { postoAsk = CFG.postoPromptSecs; say('POSTO PRF à frente — aperte F para entrar', CFG.postoPromptSecs); }
  }

  // traffic
  spawnT -= dt;
  if (spawnT <= 0) { spawnCar(); spawnT = rand(...CFG.spawnEvery) * (1 - 0.3 * difficulty()); }

  for (const c of cars) {
    c.prevSpeed = c.speed;
    c.phase += dt * 3;
    if (c.state === 'drive') {
      const ahead = cars.find(o => o !== c && o.state === 'drive' && Math.abs(o.x - c.x) < 22 && c.y - o.y > 0 && c.y - o.y < 100);
      c.speed = ahead ? Math.min(c.baseSpeed, ahead.speed) : c.baseSpeed;
      // traffic coming from behind doesn't rear-end the patrol car
      const gap = c.y - player.y;
      if (gap > 0 && gap < 110 && Math.abs(player.x - c.x) < (c.w + 26) / 2 + 4) c.speed = Math.min(c.speed, player.speed);
    } else if (c.state === 'pull') {
      c.x += Math.sign(shoulderCenter - c.x) * Math.min(Math.abs(shoulderCenter - c.x), 70 * dt);
      c.speed = Math.max(0, c.speed - 140 * dt);
      if (c.speed === 0 && Math.abs(c.x - shoulderCenter) < 2) c.state = 'stopped';
    } else if (c.state === 'stopped') {
      c.speed = 0;
    } else if (c.state === 'flee') {
      c.speed = Math.min(CFG.fleeSpeed, c.speed + 200 * dt);
      c.weaveT -= dt;
      if (c.weaveT <= 0) { c.targetX = laneCenter(Math.floor(Math.random() * CFG.lanes)); c.weaveT = rand(0.8, 1.6); }
      c.x += Math.sign(c.targetX - c.x) * Math.min(Math.abs(c.targetX - c.x), 150 * dt);
    } else if (c.state === 'leave') {
      c.speed = Math.min(c.baseSpeed, c.speed + 110 * dt);
      const lane = laneCenter(CFG.lanes - 1);
      if (c.speed > 60) c.x += Math.sign(lane - c.x) * Math.min(Math.abs(lane - c.x), 40 * dt);
    }
    c.y += (player.speed - c.speed) * dt;
    const p = c.sit?.pista;
    if (p === 'fumaca' && Math.random() < dt * 14) emit('smoke', c.x + rand(-4, 4), c.y + c.h / 2);
    if (p === 'derrame' && Math.random() < dt * 18) emit('sand', c.x + rand(-10, 10), c.y + c.h / 2);
    if (p === 'lixo' && Math.random() < dt * 1.5) emit('trash', c.x + c.w / 2, c.y);
    if (p === 'som' && Math.random() < dt * 4) emit('note', c.x + rand(-8, 8), c.y - 10);
    if (c.x > roadRight - CFG.shoulder && c.speed > 80 && Math.random() < dt * 14) emit('dust', c.x + rand(-6, 6), c.y + c.h / 2);
  }
  for (const p of fx) {
    p.life -= dt;
    p.x += p.vx * dt;
    // sand, trash and dust lie on the road; smoke and notes drift relative to it
    p.y += (p.kind === 'sand' || p.kind === 'trash' ? player.speed : player.speed - 120 + p.vy) * dt;
    if (p.kind === 'sand' || p.kind === 'trash') p.vx *= 0.9;
    if (p.kind === 'smoke' || p.kind === 'dust') p.r += 10 * dt;
  }
  fx = fx.filter(p => p.life > 0 && p.y < CFG.H + 20 && p.y > -40);

  // collisions (the vehicle being stopped/chased never counts as a crash; a parked car isn't driven into)
  const [pw, ph] = patrolDims();
  const pBox = { x: player.x, y: player.y, w: pw, h: ph };
  for (const c of cars) {
    if (c === target || mode === 'foot' || c.state === 'leave') continue;
    if (player.invuln <= 0 && overlaps(pBox, c)) {
      stats.lives--; stats.score += CFG.points.collision;
      player.invuln = CFG.invuln; player.speed *= 0.3; c.y -= 20; shakeT = 0.35;
      sfx.hit(); say('Colisão!'); pop(`${CFG.points.collision}`, '#ef4444');
      if (stats.lives <= 0) { say('Viatura inutilizada — fim do turno', 3); return endShift(); }
    }
  }

  updateStop(dt);
  updateRadio(dt);

  cars = cars.filter(c => c === target || (c.y > -220 && c.y < CFG.H + 220));
}

function updateStop(dt: number) {
  if (!target) return;
  if (mode === 'chase') {
    chaseT += dt;
    if (dist(player, target) < 55) {
      target.state = 'pull'; mode = 'pulling';
      target.speed = Math.min(target.speed, player.speed);
      player.speed = target.speed;
      say('Interceptado! Encoste atrás dele.'); sfx.siren(); pop('INTERCEPTADO!', '#22c55e');
    } else if (target.y < -260 || chaseT > CFG.chaseSecs) {
      cars = cars.filter(c => c !== target); target = null; mode = 'patrol';
      say('O veículo fugiu.', 3); sfx.wrong();
    }
  } else if (mode === 'pulling') {
    // Reached: stopped close by, whether behind it (normal) or alongside it (caught after a chase).
    const reached = dist(player, target) < 130 || Math.abs(player.y - target.y - 90) < 40;
    const passed = target.y > CFG.H + 80 || (target.state === 'stopped' && player.speed < 40 && !reached && target.y > player.y);
    if (passed) {
      cars = cars.filter(c => c !== target); target = null; mode = 'patrol';
      say('Você passou do veículo abordado.');
    } else if (target.state === 'stopped' && reached && player.speed < 40 && !stopHinted) {
      stopHinted = true;
      say(target.fled ? 'Desembarque (F) e faça a busca no porta-malas' : 'Desembarque (F) e vá até a janela do motorista', 4);
    }
  }
}

function updateRadio(dt: number) {
  if (radio.phase === 'idle') {
    radio.next -= dt;
    if (radio.next <= 0 && mode === 'patrol') { radio.phase = 'asking'; radio.t = CFG.radioAnswerSecs; sfx.radio(); }
  } else if (radio.phase === 'asking') {
    radio.t -= dt;
    if (radio.t <= 0) closeRadio();
  } else if (radio.phase === 'active' && capy) {
    radio.t -= dt;
    capy.y += player.speed * dt;
    capy.x += capy.dir * 12 * dt;
    const capyBox = { x: capy.x, y: capy.y, w: 16, h: 12 };
    const byCar = !walking && overlaps({ x: player.x, y: player.y, w: patrolDims()[0], h: patrolDims()[1] }, capyBox);
    const byFoot = walking && overlaps({ x: walker.x, y: walker.y, w: 12, h: 12 }, capyBox);
    if (byCar || byFoot) {
      if (byFoot || player.speed < 220) { stats.score += CFG.points.occurrence; say('Capivara afugentada, fluxo seguro!'); pop(`+${CFG.points.occurrence}`, '#22c55e'); sfx.correct(); }
      else { stats.score += CFG.points.occurrenceFail; say('Você atropelou a capivara!'); pop(`${CFG.points.occurrenceFail}`, '#ef4444'); sfx.wrong(); }
      closeRadio();
    } else if (radio.t <= 0 || capy.y > CFG.H + 20) {
      stats.score += CFG.points.occurrenceFail; say('Um civil atropelou a capivara.', 3); pop(`${CFG.points.occurrenceFail}`, '#ef4444'); sfx.wrong();
      closeRadio();
    }
  }
}

function acceptRadio() {
  radio.phase = 'active'; radio.t = CFG.capybaraSecs;
  capy = { x: laneCenter(Math.floor(Math.random() * CFG.lanes)), y: -400, dir: Math.random() < 0.5 ? -1 : 1 };
  say('Capivara à frente! Passe devagar (< 55 km/h) por ela.', 3);
}
function closeRadio() { radio = { phase: 'idle', t: 0, next: rand(...CFG.radioEvery) }; capy = null; }

function orderStop() {
  if (mode !== 'patrol') return;
  let best: Car | null = null;
  let bestD = CFG.stopRadius;
  for (const c of cars) {
    if (c.state !== 'drive' || c.y > player.y + 30) continue;
    const d = dist(player, c);
    if (d <= bestD) { best = c; bestD = d; }
  }
  sirenT = 2;
  if (!best) { say('Nenhum veículo ao alcance.'); return; }
  target = best;
  stopHinted = false;
  sfx.siren();
  const fuga = Math.min(0.9, (best.sit?.fuga ?? 0.05) * (1 + difficulty()));
  if (forced.flee ?? Math.random() < fuga) {
    best.state = 'flee'; best.weaveT = 0; best.fled = true; mode = 'chase'; chaseT = 0;
    best.crime = forced.crime !== undefined
      ? CRIMES.find(c => c.id === forced.crime) ?? null
      : Math.random() < CFG.crimeChanceWhenFled ? drawCrime() : null;
    say('FUGA! Encoste nele para interceptar.', 3);
  } else {
    best.state = 'pull'; mode = 'pulling';
    say('Veículo encostando. Pare atrás dele.');
  }
  forced.flee = undefined; forced.crime = undefined;
}

// ---------- on foot: get out, walk, approach, get back in ----------
function walkInput(dt: number, speed: number, rects: { x: number; y: number; w: number; h: number }[]) {
  const dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  const dy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    moveWalker(walker, (dx / n) * speed * dt, (dy / n) * speed * dt, rects);
    walker.facing = Math.atan2(dx, -dy);
    walker.phase += dt * 12;
  } else walker.phase = 0;
}

const rectOf = (c: { x: number; y: number; w: number; h: number }) => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });

function updateWalkerOnRoad(dt: number) {
  walker.invuln = Math.max(0, walker.invuln - dt);
  const [pw, ph] = patrolDims();
  const solid = [rectOf({ x: player.x, y: player.y, w: pw, h: ph }), ...cars.filter(c => c.state === 'stopped').map(rectOf)];
  walkInput(dt, CFG.walkSpeed, solid);
  // moving traffic doesn't stop for someone walking in the lane
  if (walker.invuln > 0) return;
  for (const c of cars) {
    if (c.state === 'stopped' || c.state === 'leave' || c.speed < 20) continue;
    if (overlaps({ x: walker.x, y: walker.y, w: 12, h: 12 }, c)) {
      stats.lives--; walker.invuln = CFG.invuln; shakeT = 0.4;
      sfx.hit(); pop('ATROPELADO!', '#ef4444', walker.x, walker.y - 20);
      if (stats.lives <= 0) { say('Você foi atropelado na BR — fim do turno', 3); endShift(); return; }
      say('Atropelado! Fique fora das faixas de rolamento.', 3);
      // thrown onto the shoulder
      walker.x = roadRight - CFG.shoulder / 2;
      break;
    }
  }
}

/** Where the agent stands to act on the stopped vehicle: driver window, or the trunk after a chase. */
function approachSpot(): { x: number; y: number; label: string } | null {
  if (!target || target.state !== 'stopped') return null;
  return target.fled
    ? { x: target.x, y: target.y + target.h / 2 + 11, label: 'F · BUSCA VEICULAR' }
    : { x: target.x - target.w / 2 - 9, y: target.y - target.h / 2 + 14, label: 'F · ABORDAR O CONDUTOR' };
}
const carDoor = () => ({ x: player.x - patrolDims()[0] / 2 - 10, y: player.y - 4 });

function exitCar() {
  walking = true;
  mode = 'foot';
  const door = carDoor();
  walker = { x: door.x, y: door.y, facing: 0, phase: 0, invuln: 0.5 };
  say(target?.state === 'stopped'
    ? (target.fled ? 'Vá até o porta-malas e aperte F' : 'Vá até a janela do motorista e aperte F')
    : 'Você desceu da viatura. Cuidado com o tráfego!', 3);
}

function enterCar() {
  walking = false;
  mode = target && target.state !== 'leave' ? 'pulling' : 'patrol';
  say('Embarcou. Boa patrulha!');
}

/** The F key: context action for whatever is at hand. */
function interact() {
  if (mode === 'lobby') return lobbyInteract();
  if (mode === 'patrol' && postoAsk > 0 && radio.phase !== 'active') return openPosto();
  if (mode === 'patrol' || mode === 'pulling') {
    if (player.speed > 15) return say('Pare a viatura (↓) para desembarcar');
    return exitCar();
  }
  if (mode === 'foot') {
    const spot = approachSpot();
    if (spot && dist(walker, spot) < 24) return openInspect(target!);
    if (dist(walker, carDoor()) < 28) return enterCar();
    say(spot ? 'Vá até o ponto marcado no veículo' : 'Volte à porta da viatura e aperte F');
  }
}

// ---------- the PRF base (lobby) ----------
async function openLobby() {
  mode = 'lobby';
  hideOverlay();
  cars = []; target = null; fx = []; capy = null; walking = false;
  walker = { x: LOBBY_START.x, y: LOBBY_START.y, facing: Math.PI, phase: 0, invuln: 0 };
  const rows = await backend.leaderboard(3);
  lobbyTop3 = rows.map(r => `${r.nick} ${r.score}`);
}

function updateLobby(dt: number) {
  walkInput(dt, CFG.walkSpeed * 1.3, obstacles(save));
  lobbyNear = nearest(interactables(save), walker);
}

function lobbyInteract() {
  const act = lobbyNear?.act;
  if (!act) return say('Ande até um balcão, o Flashcards, o ranking ou uma viatura');
  if (act === 'vestiario') openShop('f');
  else if (act === 'garagem') openShop('v');
  else if (act === 'mentor') openFlashcards('lobby');
  else if (act === 'ranking') void openRanking();
  else if (act.startsWith('embarcar:')) {
    save.viatura = act.slice('embarcar:'.length);
    persist(save);
    startShift();
  }
}

const previews = new Map<string, string>();
function preview(kind: 'v' | 'f', id: string): string {
  const key = kind + id;
  const cached = previews.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  const t = c.getContext('2d')!;
  if (kind === 'v') { c.width = 40; c.height = 62; drawPatrol(t, 20, 31, false, 0, false, viaturaById(id)); }
  else { c.width = 30; c.height = 30; drawWalker(t, 14, 16, Math.PI, 0, { farda: fardaById(id) }); }
  const url = c.toDataURL();
  previews.set(key, url);
  return url;
}

function openShop(kind: 'v' | 'f', note = '') {
  mode = 'shop';
  const items = kind === 'v' ? VIATURAS : FARDAS;
  const equipped = kind === 'v' ? save.viatura : save.farda;
  const rows = items.map(it => {
    const owned = save.owned.includes(`${kind}:${it.id}`);
    const action = it.id === equipped
      ? '<span class="tag">✔ EM USO</span>'
      : owned
        ? `<button data-act="shop-equip" data-kind="${kind}" data-id="${it.id}">USAR</button>`
        : `<button data-act="shop-buy" data-kind="${kind}" data-id="${it.id}" ${save.saldo < it.preco ? 'disabled' : ''}>${it.preco} pts</button>`;
    return `<div class="item ${it.id === equipped ? 'em-uso' : ''}">
      <img src="${preview(kind, it.id)}" alt="" class="prev-${kind}" />
      <div class="info"><b>${esc(it.nome)}</b><small>${esc(it.desc)}</small></div>
      ${action}</div>`;
  }).join('');
  showOverlay(`<h2>${kind === 'v' ? '🚓 GARAGEM' : '👕 VESTIÁRIO'} <small>saldo: ${save.saldo} pts</small></h2>
    ${note ? `<p class="ok">${esc(note)}</p>` : ''}
    <p class="art">${kind === 'v' ? 'Viaturas compradas ficam no estacionamento da base. Embarque em qualquer uma.' : 'A farda aparece quando você anda pela base e desce da viatura.'}</p>
    <div class="vitrine">${rows}</div>
    <button data-act="shop-close" class="primario">VOLTAR À BASE <kbd>Esc</kbd></button>`, 'shop');
}

function shopAction(act: string, kind: 'v' | 'f', id: string) {
  const item = kind === 'v' ? VIATURAS.find(v => v.id === id) : FARDAS.find(f => f.id === id);
  if (!item) return;
  if (act === 'shop-buy') {
    if (save.owned.includes(`${kind}:${id}`) || save.saldo < item.preco) return;
    save.saldo -= item.preco;
    save.owned.push(`${kind}:${id}`);
    sfx.correct();
  }
  if (kind === 'v') save.viatura = id; else save.farda = id;
  persist(save);
  openShop(kind, act === 'shop-buy' ? `${item.nome} comprada e equipada!` : `${item.nome} equipada.`);
}

async function openRanking() {
  mode = 'shop';
  showOverlay(`<h2>🏆 RANKING</h2><div id="lb">carregando…</div>
    <button data-act="shop-close" class="primario">VOLTAR À BASE <kbd>Esc</kbd></button>`);
  const lb = document.getElementById('lb');
  if (lb) lb.innerHTML = await leaderboardHtml();
}

function closeShop() {
  hideOverlay();
  mode = 'lobby';
}

// ---------- overlays ----------
function showOverlay(html: string, cls = '') { overlay.innerHTML = html; overlay.className = cls; overlay.hidden = false; overlay.scrollTop = 0; }
function hideOverlay() { overlay.hidden = true; overlay.innerHTML = ''; }

let askStep = 0;
let onAnswer: ((opt: number, step: number) => void) | null = null;
let onAct: Record<string, () => void> = {};

/** Multiple-choice screen; number keys 1–9 pick an option. */
function askQuestion(heading: string, cena: string, title: string, options: readonly string[], correct: number, done: (ok: boolean) => void) {
  const step = ++askStep;
  showOverlay(`<h2>${heading}</h2>
    <div class="cena">${cena}</div>
    <p class="pergunta">${title}</p>
    <div class="opcoes">${options.map((o, i) => `<button data-opt="${i}" data-step="${step}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`).join('')}</div>`);
  onAnswer = (opt, s) => {
    if (s !== step) return;
    onAnswer = null;
    done(opt === correct);
  };
}

function finishInspect() {
  // the released vehicle merges back into traffic; the agent is still on foot
  if (target) { target.state = 'leave'; target.speed = 0; target.baseSpeed = 230; }
  target = null;
  hideOverlay();
  if (walking) { mode = 'foot'; say('Volte à viatura e aperte F para embarcar', 3); }
  else mode = 'patrol';
}

function openInspect(car: Car) {
  mode = 'inspect';
  if (car.fled) busca(car, () => inspectSituacao(car.sit, true));
  else inspectSituacao(car.sit, false);
}

function inspectSituacao(sit: Situacao | null, afterSearch: boolean) {
  if (!sit) {
    stats.score += CFG.points.routine; stats.routine++;
    showOverlay(`<h2>${afterSearch ? 'DOCUMENTAÇÃO' : 'ABORDAGEM DE ROTINA'}</h2>
      <div class="cena">Documentos em ordem, equipamentos ok. ${afterSearch ? 'Fora a fuga, nada de irregular na documentação.' : 'Condutor liberado.'}</div>
      <p class="ok">+${CFG.points.routine} pontos</p>
      <button data-act="ok" class="primario">SEGUIR PATRULHA <kbd>Enter</kbd></button>`);
    return;
  }
  let gained = 0;
  let allOk = true;
  let bonusLine = '';
  const cena = `"${esc(sit.cena)}"`;
  const graded = (ok: boolean) => {
    const delta = ok ? CFG.points.correct : CFG.points.wrong;
    gained += delta; stats.score += delta;
    if (ok) { stats.correct++; sfx.correct(); } else { stats.wrong++; allOk = false; sfx.wrong(); }
  };
  const feedback = () => {
    report.push({ artigo: sit.artigo, classe: sit.classe, ok: allOk });
    showOverlay(`<h2>${allOk ? '<span class="ok">✔ ENQUADRAMENTO CORRETO</span>' : '<span class="bad">✖ REVEJA O ENQUADRAMENTO</span>'}</h2>
      <div class="cena">${cena}</div>
      <div class="ficha">
        <div><span>Artigo</span><b>${esc(sit.artigo)}</b></div>
        <div><span>Classificação</span><b>${esc(sit.classe)}</b></div>
        <div><span>Medida</span><b>${esc(MEDIDAS[sit.medida])}</b></div>
      </div>
      <p class="art">${esc(sit.explicacao)}</p>
      ${bonusLine}
      <p class="pontos ${gained >= 0 ? 'ok' : 'bad'}">${gained >= 0 ? '+' : ''}${gained} pontos</p>
      <button data-act="ok" class="primario">SEGUIR PATRULHA <kbd>Enter</kbd></button>`, allOk ? 'acerto' : 'erro');
  };
  // The partner's surprise question: CNH points (Art. 259) or base fine (Art. 258). No penalty.
  const bonus = () => {
    const info = CLASSE_INFO[sit.classe];
    const askPoints = Math.random() < 0.5;
    const options = askPoints ? CLASSES.map(c => `${CLASSE_INFO[c].pontos} pontos`) : CLASSES.map(c => CLASSE_INFO[c].multa);
    const title = askPoints
      ? `🎯 Bônus do parceiro: infração ${sit.classe.toLowerCase()} — quantos pontos na CNH?`
      : `🎯 Bônus do parceiro: infração ${sit.classe.toLowerCase()} — valor base da multa (sem fator multiplicador)?`;
    askQuestion('PERGUNTA BÔNUS', cena, title, options, CLASSES.indexOf(sit.classe), ok => {
      const answer = askPoints ? `${info.pontos} pontos (Art. 259)` : `${info.multa} (Art. 258)`;
      if (ok) { gained += CFG.points.bonus; stats.score += CFG.points.bonus; sfx.correct(); }
      bonusLine = `<p class="${ok ? 'ok' : 'art'}">🎯 Bônus: ${ok ? `acertou! +${CFG.points.bonus}` : 'errou'} — ${esc(sit.classe)} = ${esc(answer)}</p>`;
      feedback();
    });
  };
  askQuestion('ABORDAGEM EM ANDAMENTO', cena, '1) Qual é a classificação da infração?', CLASSES, CLASSES.indexOf(sit.classe), ok => {
    graded(ok);
    askQuestion('ABORDAGEM EM ANDAMENTO', cena, '2) Qual é a medida administrativa?', MEDIDAS, sit.medida, ok2 => {
      graded(ok2);
      if (Math.random() < CFG.bonusChance) bonus(); else feedback();
    });
  });
}

// ---------- vehicle search after a chase ----------
function busca(car: Car, next: () => void) {
  const crime = car.crime;
  let tries = CFG.buscaTries;
  let k9Used = false;
  const notes: string[] = [];
  const searched = new Set<string>();
  const local = (id: string) => LOCAIS.find(l => l.id === id)!;

  const render = () => {
    const step = ++askStep;
    showOverlay(`<h2>🔎 BUSCA VEICULAR</h2>
      <div class="cena">Quem foge tem motivo. Condutor contido e algemado por segurança; revista o veículo.
        Escolha onde procurar — <b>${tries}</b> ${tries === 1 ? 'tentativa restante' : 'tentativas restantes'}.</div>
      ${notes.map(n => `<p class="nota">${n}</p>`).join('')}
      <div class="opcoes">${LOCAIS.map((l, i) => `<button data-opt="${i}" data-step="${step}" ${searched.has(l.id) || tries === 0 ? 'disabled' : ''}><kbd>${i + 1}</kbd> ${l.icone} ${l.nome}</button>`).join('')}</div>
      ${hasK9 && !k9Used ? '<button data-act="k9" class="k9">🐕 SOLTAR O K-9 <kbd>K</kbd></button>' : ''}
      ${!hasK9 ? '<p class="art">Dica: no posto PRF você pode levar um cão farejador.</p>' : ''}
      <button data-act="busca-fim">ENCERRAR BUSCA <kbd>Enter</kbd></button>`, 'busca');
    onAnswer = (opt, s) => { if (s !== step) return; onAnswer = null; search(LOCAIS[opt].id); };
  };

  const search = (id: string) => {
    tries--; searched.add(id);
    const l = local(id);
    if (crime && crime.local === id) return found();
    notes.push(`${l.icone} ${l.nome}: nada encontrado.`);
    sfx.wrong();
    if (tries === 0) end(); else render();
  };

  const k9 = () => {
    if (k9Used) return;
    k9Used = true;
    const accurate = Math.random() < CFG.k9Accuracy;
    if (crime) {
      const where = accurate ? crime.local : pick(LOCAIS.filter(l => l.id !== crime.local)).id;
      notes.push(`🐕 O K-9 latiu e marcou: <b>${local(where).nome}</b>.`);
    } else if (accurate) notes.push('🐕 O K-9 farejou tudo e ficou calmo.');
    else notes.push(`🐕 O K-9 marcou: <b>${pick(LOCAIS).nome}</b>.`);
    sfx.radio();
    render();
  };

  const found = () => {
    stats.score += CFG.points.busca;
    sfx.siren();
    const c = crime!;
    askQuestion('🚨 FLAGRANTE!', `${esc(c.achado)}`, 'Qual crime está configurado?', TIPOS_CRIME, TIPOS_CRIME.indexOf(c.tipo), ok => {
      const delta = ok ? CFG.points.correct + CFG.points.prisao : CFG.points.wrong;
      stats.score += delta;
      if (ok) { stats.correct++; stats.prisoes++; sfx.correct(); } else { stats.wrong++; sfx.wrong(); }
      report.push({ artigo: c.artigo, classe: 'Crime', ok });
      showOverlay(`<h2>${ok ? '<span class="ok">✔ PRISÃO EM FLAGRANTE</span>' : '<span class="bad">✖ TIPIFICAÇÃO ERRADA</span>'}</h2>
        <div class="cena">${esc(c.achado)}</div>
        <div class="ficha">
          <div><span>Crime</span><b>${esc(c.tipo)}</b></div>
          <div><span>Base legal</span><b>${esc(c.artigo)}</b></div>
        </div>
        <p class="art">${esc(c.explicacao)}</p>
        <p class="pontos ${ok ? 'ok' : 'bad'}">${ok ? `+${CFG.points.busca} busca · +${CFG.points.correct} tipificação · +${CFG.points.prisao} prisão` : `+${CFG.points.busca} busca · ${CFG.points.wrong} tipificação`}</p>
        <button data-act="busca-next" class="primario">PROSSEGUIR PARA A DOCUMENTAÇÃO <kbd>Enter</kbd></button>`, ok ? 'acerto' : 'erro');
    });
  };

  const end = () => {
    if (crime && !searched.has(crime.local)) {
      report.push({ artigo: crime.artigo, classe: 'Crime', ok: false });
      showOverlay(`<h2><span class="bad">PASSOU DESPERCEBIDO</span></h2>
        <div class="cena">A perícia encontrou depois: ${esc(crime.achado)}</div>
        <div class="ficha">
          <div><span>Crime</span><b>${esc(crime.tipo)}</b></div>
          <div><span>Base legal</span><b>${esc(crime.artigo)}</b></div>
        </div>
        <p class="art">${esc(crime.explicacao)}</p>
        <button data-act="busca-next" class="primario">PROSSEGUIR PARA A DOCUMENTAÇÃO <kbd>Enter</kbd></button>`, 'erro');
    } else {
      showOverlay(`<h2>NADA ILÍCITO</h2>
        <div class="cena">${notes.map(n => n).join('<br>')}<br>Veículo limpo: a fuga não escondia nenhum crime.</div>
        <button data-act="busca-next" class="primario">PROSSEGUIR PARA A DOCUMENTAÇÃO <kbd>Enter</kbd></button>`);
    }
  };

  onAct = { k9, 'busca-fim': () => { onAnswer = null; end(); }, 'busca-next': () => { onAct = {}; next(); } };
  render();
}

// ---------- PRF post: refuel, recover lives, K-9, study ----------
function openPosto(note = '') {
  mode = 'posto';
  postoAsk = 0;
  const fuelCost = Math.ceil((100 - stats.fuel) * CFG.costs.fuelPerPercent);
  const canFuel = stats.fuel < 99 && stats.score >= fuelCost;
  const canLife = stats.lives < CFG.lives && stats.score >= CFG.costs.life;
  const canK9 = !hasK9 && stats.score >= CFG.costs.k9;
  showOverlay(`<h2>⛽ POSTO PRF</h2>
    <p>Pontos são sua moeda. Saldo: <b>${stats.score}</b> pts · ⛽ ${Math.ceil(stats.fuel)}% · ${'♥'.repeat(stats.lives)}${hasK9 ? ' · 🐕' : ''}</p>
    ${note ? `<p class="ok">${esc(note)}</p>` : ''}
    <div class="loja">
      <button data-act="fuel" ${canFuel ? '' : 'disabled'}>⛽ ABASTECER<small>tanque cheio · ${fuelCost} pts</small></button>
      <button data-act="life" ${canLife ? '' : 'disabled'}>✚ HOSPITAL<small>+1 vida · ${CFG.costs.life} pts</small></button>
      <button data-act="buy-k9" ${canK9 ? '' : 'disabled'}>🐕 CÃO FAREJADOR<small>${hasK9 ? 'já está com você' : `neste turno · ${CFG.costs.k9} pts`}</small></button>
      <button data-act="flash-posto">📚 FLASHCARDS<small>flashcards</small></button>
    </div>
    <button data-act="leave" class="primario">VOLTAR À PATRULHA <kbd>Enter</kbd></button>`);
}

function postoBuy(what: 'fuel' | 'life' | 'k9') {
  if (what === 'fuel') {
    const cost = Math.ceil((100 - stats.fuel) * CFG.costs.fuelPerPercent);
    if (stats.score < cost) return;
    stats.score -= cost; stats.fuel = 100;
    openPosto(`Tanque cheio (−${cost} pts)`);
  } else if (what === 'life') {
    if (stats.score < CFG.costs.life || stats.lives >= CFG.lives) return;
    stats.score -= CFG.costs.life; stats.lives++;
    openPosto(`Vida recuperada (−${CFG.costs.life} pts)`);
  } else {
    if (hasK9 || stats.score < CFG.costs.k9) return;
    stats.score -= CFG.costs.k9; hasK9 = true;
    openPosto(`O K-9 embarcou na viatura (−${CFG.costs.k9} pts)`);
  }
  sfx.correct();
}

function leavePosto() {
  hideOverlay();
  mode = 'patrol';
  player.speed = Math.min(player.speed, 120);
  say('De volta à BR. Boa patrulha!');
}

// ---------- Zé Roberto's flashcards ----------
let flash = { deck: [] as Situacao[], i: 0, revealed: false, from: 'menu' as 'menu' | 'posto' | 'lobby' };

function openFlashcards(from: 'menu' | 'posto' | 'lobby') {
  // Situations met this shift come first, then the rest of the bank.
  const seen = new Set(report.map(r => r.artigo));
  const deck = shuffle(pool).sort((a, b) => Number(seen.has(b.artigo)) - Number(seen.has(a.artigo)));
  flash = { deck, i: 0, revealed: false, from };
  mode = 'flash';
  renderFlash();
}

function renderFlash() {
  const s = flash.deck[flash.i];
  const back = flash.revealed
    ? `<div class="ficha">
         <div><span>Artigo</span><b>${esc(s.artigo)}</b></div>
         <div><span>Classificação</span><b>${esc(s.classe)}</b></div>
         <div><span>Medida</span><b>${esc(MEDIDAS[s.medida])}</b></div>
         <div><span>CNH / multa base</span><b>${CLASSE_INFO[s.classe].pontos} pts · ${CLASSE_INFO[s.classe].multa}</b></div>
       </div>
       <p class="art">${esc(s.explicacao)}</p>
       <button data-act="flash-next" class="primario">PRÓXIMA <kbd>Espaço</kbd></button>`
    : `<p class="art">Responda de cabeça: artigo, classificação e medida administrativa.</p>
       <button data-act="flash-reveal" class="primario">REVELAR O VERSO <kbd>Espaço</kbd></button>`;
  showOverlay(`<h2>📚 FLASHCARDS <small>carta ${flash.i + 1}/${flash.deck.length}</small></h2>
    <div class="cena carta">"${esc(s.cena)}"</div>
    ${back}
    <button data-act="flash-exit">${{ posto: 'VOLTAR AO POSTO', lobby: 'VOLTAR À BASE', menu: 'VOLTAR AO MENU' }[flash.from]} <kbd>Esc</kbd></button>`, 'flash');
}

function flashAdvance() {
  if (!flash.revealed) flash.revealed = true;
  else { flash.i = (flash.i + 1) % flash.deck.length; flash.revealed = false; }
  renderFlash();
}

function flashExit() {
  if (flash.from === 'posto') openPosto();
  else if (flash.from === 'lobby') closeShop();
  else void openMenu();
}

overlay.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.opt && onAnswer) return onAnswer(Number(b.dataset.opt), Number(b.dataset.step));
  const act = b.dataset.act ?? '';
  if (onAct[act]) return onAct[act]();
  if (act === 'shop-buy' || act === 'shop-equip') return shopAction(act, b.dataset.kind as 'v' | 'f', b.dataset.id ?? '');
  if (act === 'shop-close') return closeShop();
  if (act === 'lobby') return void openLobby();
  if (act === 'ok') finishInspect();
  else if (act === 'play') startShift();
  else if (act === 'submit') void submitRun();
  else if (act === 'menu') void openMenu();
  else if (act === 'cloud') openCloud();
  else if (act === 'cloud-code') void cloudCode();
  else if (act === 'cloud-claim') void cloudClaim();
  else if (act === 'fuel' || act === 'life') postoBuy(act);
  else if (act === 'buy-k9') postoBuy('k9');
  else if (act === 'leave') leavePosto();
  else if (act === 'flash-menu') openFlashcards('menu');
  else if (act === 'flash-posto') openFlashcards('posto');
  else if (act === 'flash-reveal' || act === 'flash-next') flashAdvance();
  else if (act === 'flash-exit') flashExit();
});

// ---------- shift lifecycle ----------
async function leaderboardHtml() {
  const rows = await backend.leaderboard(10);
  if (!rows.length) return '<p class="art">Ranking vazio — seja o primeiro.</p>';
  return `<table class="ranking">${rows.map((r, i) =>
    `<tr><td>${['🥇', '🥈', '🥉'][i] ?? i + 1}</td><td>${esc(r.nick)}</td><td>${r.score} pts</td><td>${r.km.toFixed(1)} km</td></tr>`).join('')}</table>`;
}

async function openMenu() {
  mode = 'menu';
  cars = []; target = null; fx = []; capy = null;
  showOverlay(`<div class="logo"><span class="escudo">🛡️</span><h1>PATRULHA<br>MINI</h1><p>Aprenda o CTB patrulhando a BR</p></div>
    <p>Observe o tráfego, dê a ordem de parada a quem estiver irregular e enquadre pelo CTB. Quem foge tem motivo: intercepte e faça a busca veicular.</p>
    <p class="art">${pool.length} infrações · ${CRIMES.length} crimes · saldo ${save.saldo} pts · ${backend.online ? 'online · progresso salvo na nuvem' : 'modo offline (ranking local)'}</p>
    <button data-act="lobby" class="primario grande">▶ JOGAR <kbd>Enter</kbd></button>
    <button data-act="flash-menu">📚 ESTUDAR COM FLASHCARDS</button>
    ${backend.online ? '<button data-act="cloud">☁️ PROGRESSO EM OUTRO APARELHO</button>' : ''}
    <h2>🏆 RANKING</h2><div id="lb">carregando…</div>`, 'menu');
  const lb = document.getElementById('lb');
  if (lb) lb.innerHTML = await leaderboardHtml();
}

function startShift() {
  hideOverlay();
  cars = []; target = null; report = []; fx = []; popups = []; capy = null;
  player = { x: laneCenter(1), y: 520, speed: 0, invuln: 0 };
  stats = freshStats();
  closeRadio();
  spawnT = 0.5;
  nextPostoKm = CFG.postoEveryKm; postoAsk = 0;
  hasK9 = false;
  onAct = {};
  walking = false; stopHinted = false;
  mode = 'patrol';
  say('Turno iniciado. Boa patrulha, agente!');
}

function endShift() {
  mode = 'report';
  closeRadio();
  walking = false;
  const ganho = Math.max(0, stats.score);
  save.saldo += ganho;
  persist(save);
  const nick = (() => { try { return localStorage.getItem('patrulhamini_nick') ?? ''; } catch { return ''; } })();
  const arts = report.map(r => `<tr><td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✔' : '✖'}</td><td>${esc(r.artigo)}</td><td>${esc(r.classe)}</td></tr>`).join('');
  showOverlay(`<h2>📋 RELATÓRIO DE FIM DE TURNO</h2>
    <div class="ficha">
      <div><span>Pontos</span><b>${stats.score}</b></div>
      <div><span>Distância</span><b>${km().toFixed(2)} km</b></div>
      <div><span>Tempo</span><b>${Math.round(stats.seconds)} s</b></div>
      <div><span>Acertos / erros</span><b>${stats.correct} / ${stats.wrong}</b></div>
      <div><span>Prisões</span><b>${stats.prisoes}</b></div>
      <div><span>Rotina</span><b>${stats.routine}</b></div>
    </div>
    <p class="ok">+${ganho} pts no seu saldo (total ${save.saldo}) — gaste na garagem e no vestiário da base.</p>
    <h2>ARTIGOS PARA REVISAR</h2>
    ${arts ? `<table>${arts}</table>` : '<p class="art">Nenhum enquadramento neste turno.</p>'}
    <label class="nick">Seu nome no ranking <input id="nick" maxlength="20" value="${esc(nick)}" /></label>
    <button data-act="submit">ENVIAR AO RANKING</button>
    <button data-act="lobby" class="primario">VOLTAR À BASE <kbd>Enter</kbd></button>
    <button data-act="menu">MENU</button>
    <div id="lb"></div>`);
}

async function submitRun() {
  const input = document.getElementById('nick') as HTMLInputElement | null;
  const nick = (input?.value.trim() || 'agente').slice(0, 20);
  try { localStorage.setItem('patrulhamini_nick', nick); } catch { /* ignore */ }
  const run: Run = { nick, score: stats.score, km: km(), seconds: Math.round(stats.seconds), correct: stats.correct, wrong: stats.wrong };
  const btn = overlay.querySelector('[data-act="submit"]') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'ENVIADO ✔'; }
  await backend.submitRun(run);
  const lb = document.getElementById('lb');
  if (lb) lb.innerHTML = '<h2>🏆 RANKING</h2>' + await leaderboardHtml();
}

// ---------- cloud save transfer ----------
function openCloud(note = '', ok = true) {
  mode = 'menu';
  showOverlay(`<h2>☁️ PROGRESSO NA NUVEM</h2>
    <p class="art">Seu saldo, viaturas e fardas ficam salvos na nuvem automaticamente neste navegador.
    Para continuar em outro aparelho (ou se limpar os dados do navegador), gere um código aqui e digite-o no outro aparelho.</p>
    ${note ? `<p class="${ok ? 'ok' : 'bad'}">${note}</p>` : ''}
    <div id="cloud-code"></div>
    <button data-act="cloud-code">GERAR CÓDIGO DE RECUPERAÇÃO</button>
    <label class="nick">Tenho um código <input id="claim" maxlength="16" placeholder="XXXX-XXXX-XXXX" autocomplete="off" /></label>
    <button data-act="cloud-claim">RECUPERAR NESTE APARELHO</button>
    <button data-act="menu" class="primario">VOLTAR</button>`, 'menu');
}

async function cloudCode() {
  const box = document.getElementById('cloud-code');
  if (box) box.innerHTML = '<p class="art">gerando…</p>';
  await backend.pushSave(save);
  const code = await backend.recoveryCode();
  if (!box) return;
  box.innerHTML = code
    ? `<p class="ok">Seu código: <b class="codigo">${esc(code)}</b><br>Anote-o. Um código novo invalida o anterior.</p>`
    : '<p class="bad">Não foi possível gerar o código agora. Tente de novo.</p>';
}

async function cloudClaim() {
  const code = (document.getElementById('claim') as HTMLInputElement | null)?.value.trim() ?? '';
  if (!code) return openCloud('Digite o código.', false);
  if (!await backend.claimSave(code)) return openCloud('Código não encontrado.', false);
  const cloud = await backend.loadSave();
  if (cloud) adopt(cloud);
  openCloud(`Progresso recuperado! Saldo: ${save.saldo} pts.`);
}

// ---------- input ----------
const KEYMAP: Record<string, string> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const clickAct = (sel: string) => (overlay.querySelector(sel) as HTMLButtonElement | null)?.click();
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = KEYMAP[e.code];
  if (k) { keys.add(k); e.preventDefault(); }
  if (e.code === 'Space') { e.preventDefault(); if (mode === 'flash') flashAdvance(); else orderStop(); }
  if (e.code === 'Escape') {
    if (mode === 'flash') flashExit();
    else if (mode === 'posto') leavePosto();
    else if (mode === 'shop') closeShop();
    else if (mode === 'lobby') void openMenu();
  }
  if (e.code === 'KeyF') interact();
  if (e.code === 'KeyK') clickAct('[data-act="k9"]');
  if (e.code === 'KeyY' && radio.phase === 'asking') acceptRadio();
  if (e.code === 'KeyN' && radio.phase === 'asking') closeRadio();
  if (e.code === 'KeyE' && (mode === 'patrol' || mode === 'pulling' || mode === 'chase' || mode === 'foot')) endShift();
  if (!overlay.hidden) {
    if (e.code === 'Enter') clickAct('[data-act="ok"], [data-act="play"], [data-act="lobby"], [data-act="leave"], [data-act="shop-close"], [data-act="busca-next"], [data-act="busca-fim"]');
    const n = Number(e.key);
    if (n >= 1 && n <= 9) clickAct(`[data-opt="${n - 1}"]`);
  }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
addEventListener('blur', () => keys.clear());

// Touch: hold buttons map onto the same key set; tap buttons fire actions.
const touch = document.getElementById('touch')!;
if (matchMedia('(pointer: coarse)').matches) touch.hidden = false;
touch.addEventListener('pointerdown', e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  e.preventDefault();
  if (b.dataset.hold) { keys.add(b.dataset.hold); b.setPointerCapture(e.pointerId); }
  const tap = b.dataset.tap;
  if (tap === 'stop') orderStop();
  else if (tap === 'yes' && radio.phase === 'asking') acceptRadio();
  else if (tap === 'no' && radio.phase === 'asking') closeRadio();
  else if (tap === 'posto') interact();
  else if (tap === 'end' && (mode === 'patrol' || mode === 'pulling' || mode === 'chase' || mode === 'foot')) endShift();
});
const release = (e: PointerEvent) => {
  const hold = (e.target as HTMLElement).closest('button')?.dataset.hold;
  if (hold) keys.delete(hold);
};
touch.addEventListener('pointerup', release);
touch.addEventListener('pointercancel', release);

// ---------- render ----------
function viewOf(c: Car): VehicleView {
  const p = c.sit?.pista;
  const id = c.sit?.id;
  const zig = p === 'zigue_zague' && c.state === 'drive' ? Math.sin(c.phase) * 14 : 0;
  let riders = [true];
  if (p === 'sem_capacete') riders = id === 'garupa_sem_capacete' ? [true, false] : [false];
  if (id === 'crianca_moto') riders = [true, true];
  return {
    kind: c.veiculo, x: c.x + zig, y: c.y, w: c.w, h: c.h, color: c.color,
    braking: c.speed < c.prevSpeed - 0.5 || c.state === 'pull' || c.state === 'stopped',
    blinkRight: c.state === 'pull',
    tint: p === 'pelicula', plate: p === 'placa' ? 'dark' : p === 'sem_placa' ? 'none' : 'normal',
    phone: p === 'celular', cargoPeople: p === 'carroceria', sand: p === 'derrame',
    riders, wheelie: p === 'empinando', oneHand: p === 'mao_guidom',
    highlight: c === target && (c.state === 'pull' || c.state === 'stopped'),
  };
}

function drawParticles(kinds: ParticleKind[]) {
  for (const p of fx) {
    if (!kinds.includes(p.kind)) continue;
    const a = Math.max(0, p.life / p.max);
    if (p.kind === 'smoke') { g.fillStyle = `rgba(35,35,35,${a * 0.55})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    else if (p.kind === 'dust') { g.fillStyle = `rgba(160,140,100,${a * 0.5})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    else if (p.kind === 'sand') { g.fillStyle = `rgba(200,168,106,${Math.min(1, a * 2)})`; g.fillRect(p.x, p.y, 3, 2); }
    else if (p.kind === 'trash') { g.fillStyle = Math.floor(p.x) % 2 ? '#d0d0d0' : '#c0392b'; g.fillRect(p.x, p.y, 4, 3); }
    else if (p.kind === 'note') { g.fillStyle = `rgba(250,204,21,${a})`; g.font = 'bold 12px monospace'; g.fillText('♪', p.x, p.y); }
  }
}

function pill(text: string, x: number, y: number, color = '#facc15') {
  g.font = 'bold 10px monospace';
  const w = g.measureText(text).width + 12;
  g.fillStyle = 'rgba(8,12,24,0.85)';
  g.beginPath(); g.roundRect(x - w / 2, y - 11, w, 15, 7); g.fill();
  g.strokeStyle = color; g.lineWidth = 1; g.stroke();
  g.fillStyle = color; g.textAlign = 'center'; g.fillText(text, x, y); g.textAlign = 'start';
}

function drawMsg() {
  if (msg.t <= 0) return;
  g.font = 'bold 12px monospace';
  const w = Math.min(CFG.W - 30, g.measureText(msg.text).width + 28);
  g.fillStyle = 'rgba(8,12,24,0.88)';
  g.beginPath(); g.roundRect((CFG.W - w) / 2, 66, w, 26, 6); g.fill();
  g.fillStyle = '#facc15'; g.fillRect((CFG.W - w) / 2, 66, 4, 26);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(msg.text, CFG.W / 2, 83); g.textAlign = 'start';
}

function renderLobby() {
  drawLobby(g, clock, save, lobbyTop3, lobbyNear);
  drawWalker(g, walker.x, walker.y, walker.facing, walker.phase, { farda: fardaById(save.farda) });
  if (lobbyNear && mode === 'lobby') pill(lobbyNear.label, lobbyNear.x, lobbyNear.y - 22);
  drawMsg();
  hud.innerHTML = `<span>SALDO <b>${save.saldo}</b></span><span>WASD andar · F interagir · Esc menu</span>`;
}

function render() {
  if (inBase()) return renderLobby();
  g.save();
  if (shakeT > 0) g.translate(rand(-4, 4) * shakeT * 3, rand(-4, 4) * shakeT * 3);
  drawRoad(g, stats.dist, player.y);
  drawParticles(['sand', 'trash']);
  if (capy) drawCapybara(g, capy.x, capy.y, capy.dir, clock);
  for (const c of cars) drawVehicle(g, viewOf(c), clock);
  const sirenOn = sirenT > 0 || mode === 'chase' || mode === 'pulling' || !!(target && (mode === 'inspect' || mode === 'foot'));
  if (!(player.invuln > 0 && Math.floor(player.invuln * 10) % 2)) drawPatrol(g, player.x, player.y, sirenOn, clock, isNight(), patrolSkin());
  if (walking) {
    const pulse = 0.5 + Math.sin(clock * 6) * 0.5;
    const ring = (p: { x: number; y: number }) => {
      g.strokeStyle = `rgba(250,204,21,${0.35 + pulse * 0.5})`; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, 9 + pulse * 3, 0, 7); g.stroke();
    };
    const spot = approachSpot();
    if (spot && mode === 'foot') ring(spot);
    if (mode === 'foot') ring(carDoor());
    if (!(walker.invuln > 0 && Math.floor(walker.invuln * 10) % 2))
      drawWalker(g, walker.x, walker.y, walker.facing, walker.phase, { farda: fardaById(save.farda) });
  }
  drawParticles(['smoke', 'dust', 'note']);

  const dark = darkness();
  if (dark > 0) {
    g.fillStyle = `rgba(4,7,26,${dark})`; g.fillRect(-10, -10, CFG.W + 20, CFG.H + 20);
    g.globalCompositeOperation = 'lighter';
    const s = dark / 0.62;
    for (const c of cars) {
      const p = c.sit?.pista;
      const noLights = p === 'farol_apagado' || p === 'farol_moto';
      if (!noLights) headlight(g, c.x, c.y - c.h / 2, s * (c.veiculo === 'moto' ? 0.6 : 1), p === 'luz_alta');
      if (c.veiculo !== 'moto') { tailGlow(g, c.x - c.w / 2 + 3, c.y + c.h / 2 - 2, s); tailGlow(g, c.x + c.w / 2 - 3, c.y + c.h / 2 - 2, s); }
    }
    const ph = patrolDims()[1] / 2;
    headlight(g, player.x - 6, player.y - ph, s); headlight(g, player.x + 6, player.y - ph, s);
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();

  // observation hints for nearby irregular vehicles
  for (const c of cars) {
    const p = c.sit?.pista;
    if (!p || p === 'nenhum' || c.state !== 'drive' || dist(player, c) > 170) continue;
    if (PISTAS_NOTURNAS.includes(p) && !isNight()) continue;
    pill(PISTA_LABEL[p], c.x, c.y - c.h / 2 - 8);
  }

  // on foot: what F does from here
  if (mode === 'foot') {
    const spot = approachSpot();
    if (spot && dist(walker, spot) < 24) pill(spot.label, walker.x, walker.y - 18);
    else if (dist(walker, carDoor()) < 28) pill('F · EMBARCAR', walker.x, walker.y - 18);
  }

  // chase HUD: arrow to an off-screen fugitive and a timer bar
  if (mode === 'chase' && target) {
    if (target.y < 10) {
      const x = Math.max(20, Math.min(CFG.W - 20, target.x));
      g.fillStyle = '#ef4444';
      g.beginPath(); g.moveTo(x, 34); g.lineTo(x - 9, 50); g.lineTo(x + 9, 50); g.fill();
      pill(`${Math.round((player.y - target.y) / 10)} m`, x, 64, '#ef4444');
    }
    const left = 1 - chaseT / CFG.chaseSecs;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(20, CFG.H - 18, CFG.W - 40, 8);
    g.fillStyle = left > 0.3 ? '#facc15' : '#ef4444'; g.fillRect(20, CFG.H - 18, (CFG.W - 40) * left, 8);
  }

  for (const p of popups) {
    g.globalAlpha = Math.min(1, p.t);
    g.font = 'bold 15px monospace'; g.textAlign = 'center';
    g.fillStyle = '#000'; g.fillText(p.text, p.x + 1, p.y + 1);
    g.fillStyle = p.color; g.fillText(p.text, p.x, p.y);
    g.textAlign = 'start'; g.globalAlpha = 1;
  }

  if (inShift()) drawMsg();
  if (postoAsk > 0 && mode === 'patrol') {
    const sx = roadRight + 4, sy = 110, sw = CFG.W - roadRight - 8;
    g.fillStyle = '#5b4a2a'; g.fillRect(sx + sw / 2 - 2, sy + 46, 4, 18);
    g.fillStyle = '#1e3a8a'; g.beginPath(); g.roundRect(sx, sy, sw, 46, 4); g.fill();
    g.strokeStyle = '#facc15'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#facc15'; g.font = 'bold 10px monospace'; g.textAlign = 'center';
    g.fillText('POSTO', sx + sw / 2, sy + 17);
    g.fillText(`F ${Math.ceil(postoAsk)}s`, sx + sw / 2, sy + 35); g.textAlign = 'start';
  }
  if (radio.phase === 'asking') {
    const bx = 40, by = 240, bw = CFG.W - 80, bh = 84;
    g.fillStyle = 'rgba(8,12,24,0.94)'; g.beginPath(); g.roundRect(bx, by, bw, bh, 8); g.fill();
    g.strokeStyle = '#facc15'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#facc15'; g.font = 'bold 13px monospace'; g.fillText('📻 OCORRÊNCIA PELO RÁDIO', CFG.W / 2, by + 24);
    g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText('Capivara atravessando a pista', CFG.W / 2, by + 45);
    g.fillStyle = '#8fa3c7'; g.fillText(`Aceitar? Y / N  (${Math.ceil(radio.t)}s)`, CFG.W / 2, by + 66);
    g.textAlign = 'start';
  }

  hud.innerHTML = !inShift() ? '' :
    `<span>PONTOS <b>${stats.score}</b></span><span class="vidas">${'♥'.repeat(Math.max(0, stats.lives))}${'♡'.repeat(Math.max(0, CFG.lives - stats.lives))}</span>
     <span>KM <b>${km().toFixed(2)}</b></span>
     <span>⛽ <b class="${stats.fuel < 20 ? 'alerta' : ''}">${Math.ceil(stats.fuel)}%</b></span>
     <span>NÍVEL <b>${1 + Math.floor(difficulty() * 4)}</b></span>
     <span>${hasK9 ? '🐕 ' : ''}${isNight() ? '🌙' : '☀️'} ${walking ? '<b>A PÉ</b>' : `${Math.round(player.speed / 4)} km/h`}</span>`;
}

// ---------- loop ----------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// Dev-only hook for testing; stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pm = {
    state: () => ({ mode, walking, walker: { x: Math.round(walker.x), y: Math.round(walker.y) }, near: lobbyNear?.act ?? null,
      save: structuredClone(save), approach: approachSpot(), door: carDoor(), msg: msg.text, capy: capy && { ...capy }, stats: { ...stats }, cars: cars.length, radio: radio.phase, target: target?.state ?? null, tx: target?.x ?? null, crime: target?.crime?.id ?? null, night: isNight(), px: player.x, speed: player.speed, hasK9, fx: fx.length }),
    radioNow: () => { radio.next = 0; },
    walkTo: (x: number, y: number) => { walker.x = x; walker.y = y; if (mode === 'lobby') lobbyNear = nearest(interactables(save), walker); },
    interact: () => interact(),
    setSaldo: (n: number) => { save.saldo = n; persist(save); },
    /** Advance the simulation n frames at 60 fps (rAF pauses in hidden tabs). */
    step: (n = 60) => { for (let i = 0; i < n; i++) update(1 / 60); render(); },
    night: () => { stats.seconds = CFG.dayCycle * 0.5; },
    setKm: (k: number) => { stats.dist = k * CFG.pxPerKm; },
    addScore: (n: number) => { stats.score += n; },
    patch: (p: Partial<typeof stats>) => { Object.assign(stats, p); },
    posto: () => openPosto(),
    difficulty: () => difficulty(),
    /** Spawn a car ahead of the player and force whether it flees and which crime (id, or null) it hides. */
    spawnAhead: (flee = false, sitId = 'alcool', crime?: string | null) => {
      const sit = pool.find(s => s.id === sitId)!;
      const [w, h] = SIZES[sit.veiculo];
      cars.push({ x: player.x, y: player.y - 100, w, h, speed: player.speed, baseSpeed: player.speed, prevSpeed: player.speed, lane: 1,
        color: '#c0392b', veiculo: sit.veiculo, sit, state: 'drive', phase: 0, weaveT: 0, targetX: player.x, fled: false, crime: null });
      forced.flee = flee;
      forced.crime = crime;
    },
    /** Spawn one car per situation id in a row ahead, to eyeball the art. */
    showcase: (ids: string[]) => {
      ids.forEach((id, i) => {
        const sit = pool.find(s => s.id === id)!;
        const [w, h] = SIZES[sit.veiculo];
        const x = i % 2 ? laneCenter(2) : laneCenter(0);
        cars.push({ x: i === ids.length - 1 && sit.pista === 'acostamento' ? shoulderCenter : x, y: 80 + i * 70, w, h, speed: player.speed, baseSpeed: player.speed, prevSpeed: player.speed, lane: 0,
          color: COLORS[i % COLORS.length], veiculo: sit.veiculo, sit, state: 'drive', phase: 0, weaveT: 0, targetX: x, fled: false, crime: null });
      });
    },
  };
}
void backend.premiumSituacoes().then(extra => {
  if (extra.length) { pool = [...SITUACOES, ...extra]; bag = []; }
});
void openMenu();
void syncSave().then(() => { if (mode === 'menu' && !overlay.querySelector('#claim')) void openMenu(); });
requestAnimationFrame(frame);

// Player progress kept between shifts: points balance and owned/equipped cosmetics.
// Stored in localStorage and, when online, mirrored to the cloud (see backend.ts).
// The balance is client-side, so it's cosmetic-only by design.

export interface Save {
  saldo: number;
  owned: string[];   // ids prefixed by kind: 'v:classica', 'f:operacional'
  viatura: string;
  farda: string;
  /** ms epoch of the last change; the newer of local and cloud wins on sync. */
  updatedAt: number;
}

const KEY = 'patrulhamini_save';
const DEFAULT: Save = { saldo: 0, owned: ['v:classica', 'f:operacional'], viatura: 'classica', farda: 'operacional', updatedAt: 0 };

/** Validates untrusted data (localStorage or cloud row) into a Save. */
export function normalize(s: Partial<Save>): Save {
  return {
    saldo: Number.isFinite(s.saldo) ? Math.max(0, Math.floor(s.saldo!)) : 0,
    owned: Array.from(new Set([...DEFAULT.owned, ...(Array.isArray(s.owned) ? s.owned : [])])),
    viatura: typeof s.viatura === 'string' ? s.viatura : DEFAULT.viatura,
    farda: typeof s.farda === 'string' ? s.farda : DEFAULT.farda,
    updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt! : 0,
  };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return normalize(JSON.parse(raw) as Partial<Save>);
  } catch {
    return structuredClone(DEFAULT);
  }
}

let onChange: ((s: Save) => void) | null = null;
/** Called after every local change (used to push the save to the cloud). */
export function onPersist(fn: (s: Save) => void) { onChange = fn; }

/** Writes locally only; `touch` = this is a new change (bumps updatedAt and notifies). */
export function persist(s: Save, touch = true) {
  if (touch) s.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: progress lives for this session only */ }
  if (touch) onChange?.(s);
}

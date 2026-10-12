// Backend adapter. With VITE_SUPABASE_* set it talks to Supabase; otherwise it
// keeps everything in localStorage so the game runs with zero services.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Situacao } from './data/situacoes';
import { normalize, type Save } from './save';

export interface Run {
  nick: string;
  score: number;
  km: number;
  seconds: number;
  correct: number;
  wrong: number;
}

export interface Backend {
  readonly online: boolean;
  /** Paid situations; empty when the player has no entitlement. */
  premiumSituacoes(): Promise<Situacao[]>;
  submitRun(run: Run): Promise<void>;
  leaderboard(limit?: number): Promise<Run[]>;
  /** The player's cloud save, or null if none (or offline). */
  loadSave(): Promise<Save | null>;
  pushSave(save: Save): Promise<void>;
  /** A new code that moves this save to another device; null on failure. */
  recoveryCode(): Promise<string | null>;
  /** Takes over the save that owns `code`. */
  claimSave(code: string): Promise<boolean>;
}

const LS_KEY = 'patrulhamini_runs';

function readLocal(): Run[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Run[]; } catch { return []; }
}

class OfflineBackend implements Backend {
  readonly online = false;
  async premiumSituacoes() { return []; }
  async submitRun(run: Run) {
    const runs = [...readLocal(), run].sort((a, b) => b.score - a.score).slice(0, 50);
    try { localStorage.setItem(LS_KEY, JSON.stringify(runs)); } catch { /* storage blocked */ }
  }
  async leaderboard(limit = 10) { return readLocal().slice(0, limit); }
  async loadSave() { return null; }
  async pushSave() {}
  async recoveryCode() { return null; }
  async claimSave() { return false; }
}

interface SaveRow { saldo: number; owned: string[]; viatura: string; farda: string; updated_at: string }

class SupabaseBackend implements Backend {
  readonly online = true;
  private session: Promise<boolean> | null = null;
  constructor(private sb: SupabaseClient) {}

  /** Signs in anonymously once; resolves false if auth is unavailable. */
  private ensureSession() {
    this.session ??= (async () => {
      const { data } = await this.sb.auth.getSession();
      if (data.session) return true;
      const { error } = await this.sb.auth.signInAnonymously();
      if (error) { console.warn('anonymous sign-in failed', error); this.session = null; return false; }
      return true;
    })();
    return this.session;
  }

  async premiumSituacoes() {
    if (!await this.ensureSession()) return [];
    const { data, error } = await this.sb.rpc('premium_situacoes');
    if (error) { console.warn('premium fetch failed', error); return []; }
    return (data ?? []) as Situacao[];
  }

  async submitRun(run: Run) {
    if (!await this.ensureSession()) return;
    // A database function so the server can reject impossible scores.
    const { error } = await this.sb.rpc('submit_run', { ...run });
    if (error) console.warn('submit failed', error);
  }

  async leaderboard(limit = 10) {
    const { data, error } = await this.sb
      .from('leaderboard_weekly')
      .select('nick, score, km, seconds, correct, wrong')
      .limit(limit);
    if (error) { console.warn('leaderboard failed', error); return []; }
    return (data ?? []).map(r => ({ ...r, km: Number(r.km) })) as Run[];
  }

  async loadSave() {
    if (!await this.ensureSession()) return null;
    const { data, error } = await this.sb.from('saves')
      .select('saldo, owned, viatura, farda, updated_at').maybeSingle<SaveRow>();
    if (error) { console.warn('save load failed', error); return null; }
    if (!data) return null;
    return normalize({ ...data, updatedAt: Date.parse(data.updated_at) });
  }

  async pushSave(s: Save) {
    if (!await this.ensureSession()) return;
    const { data } = await this.sb.auth.getSession();
    const { error } = await this.sb.from('saves').upsert({
      user_id: data.session!.user.id,
      saldo: s.saldo, owned: s.owned, viatura: s.viatura, farda: s.farda,
      updated_at: new Date(s.updatedAt || Date.now()).toISOString(),
    });
    if (error) console.warn('save push failed', error);
  }

  async recoveryCode() {
    if (!await this.ensureSession()) return null;
    const { data, error } = await this.sb.rpc('create_recovery_code');
    if (error) { console.warn('recovery code failed', error); return null; }
    return data as string;
  }

  async claimSave(code: string) {
    if (!await this.ensureSession()) return false;
    const { data, error } = await this.sb.rpc('claim_save', { code });
    if (error) { console.warn('claim failed', error); return false; }
    return data === true;
  }
}

export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return new SupabaseBackend(createClient(url, key));
  return new OfflineBackend();
}

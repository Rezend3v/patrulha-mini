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
  /** E-mail linked to the current account, or null (anonymous/offline). */
  accountEmail(): Promise<string | null>;
  /** Emails a 6-digit code and/or a link back to this site (depends on the e-mail template).
   *  'link' adds the e-mail to this account; 'login' signs into an existing one.
   *  Resolves to an error message, or null on success. */
  sendCode(mode: 'link' | 'login', email: string): Promise<string | null>;
  verifyCode(mode: 'link' | 'login', email: string, code: string): Promise<string | null>;
  /** Signs out; the next call starts a fresh anonymous account. */
  logout(): Promise<void>;
}

/** Player-facing messages for Supabase auth errors. */
function authMessage(e: { code?: string; message: string }): string {
  switch (e.code) {
    case 'email_exists': return 'Este e-mail já tem uma conta. Use "Entrar com e-mail".';
    case 'otp_disabled': case 'user_not_found': return 'Não há conta com este e-mail. Vincule-o primeiro no aparelho onde você joga.';
    case 'otp_expired': return 'Código inválido ou expirado. Peça um novo.';
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    case 'email_address_invalid': case 'validation_failed': return 'E-mail inválido.';
    default: return 'Não foi possível concluir agora. Tente de novo.';
  }
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
  async accountEmail() { return null; }
  async sendCode() { return 'Disponível apenas no modo online.'; }
  async verifyCode() { return 'Disponível apenas no modo online.'; }
  async logout() {}
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

  async pushSave(s: Save, retry = true): Promise<void> {
    if (!await this.ensureSession()) return;
    const { data } = await this.sb.auth.getSession();
    const { error } = await this.sb.from('saves').upsert({
      user_id: data.session!.user.id,
      saldo: s.saldo, owned: s.owned, viatura: s.viatura, farda: s.farda,
      updated_at: new Date(s.updatedAt || Date.now()).toISOString(),
    });
    // 23503: the cached session's user was deleted server-side; start a fresh one.
    if (error?.code === '23503' && retry) {
      await this.sb.auth.signOut({ scope: 'local' });
      this.session = null;
      return this.pushSave(s, false);
    }
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

  async accountEmail() {
    if (!await this.ensureSession()) return null;
    const { data } = await this.sb.auth.getUser();
    return data.user?.email || null;
  }

  async sendCode(mode: 'link' | 'login', email: string) {
    if (!await this.ensureSession()) return authMessage({ message: 'no session' });
    // If the e-mail carries a link, it reopens the game; supabase-js picks the session up from the URL.
    const emailRedirectTo = location.origin + location.pathname;
    // Linking keeps the anonymous user (and its save); login never creates a new account.
    const { error } = mode === 'link'
      ? await this.sb.auth.updateUser({ email }, { emailRedirectTo })
      : await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } });
    if (error) console.warn('send code failed', error);
    return error ? authMessage(error) : null;
  }

  async verifyCode(mode: 'link' | 'login', email: string, token: string) {
    const { error } = await this.sb.auth.verifyOtp({ email, token, type: mode === 'link' ? 'email_change' : 'email' });
    if (error) console.warn('verify failed', error);
    return error ? authMessage(error) : null;
  }

  async logout() {
    await this.sb.auth.signOut({ scope: 'local' });
    this.session = null;
  }
}

export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return new SupabaseBackend(createClient(url, key));
  return new OfflineBackend();
}

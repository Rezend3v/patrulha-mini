# Patrulha Mini

A small 2D CTB-training patrol game, modelled on the mechanics observed in
patrulhabr.com (no code, art or text copied from it).

## Run

```bash
npm install
npm run dev        # or: npm run build && npm run preview
```

Without `.env` it runs fully offline (ranking in localStorage). With it, the weekly ranking is shared and progress is saved to Supabase.

## Play

**The base (lobby).** JOGAR takes you to the PRF base. Walk with WASD/arrows and press **F**:
- **Vestiário** — buy and wear uniforms (6, from 0 to 600 pts).
- **Garagem** — buy and pick patrol-car liveries (7 across sedan, SUV and pickup; camo, neon and gold finishes).
- **Zé Roberto** — flashcards. **Ranking** board — the leaderboard.
- **Parking lot** — every car you own is parked there; walk to its driver door and press F to board it and start a shift.

Points from each shift (if positive) go into a balance saved in the browser (`src/save.ts`), spent in the base.
Online, the save is mirrored to the `saves` table (newer of local/cloud wins). The menu's **Progresso em outro aparelho**
screen issues a recovery code (stored hashed) that moves the save to another browser.

**On foot.** Stop the car and press **F** to get out; F at the driver door gets back in. To inspect a
pulled-over vehicle, walk to its driver window (or its trunk, after a chase) — a yellow ring marks the spot —
and press F. Moving traffic can run you over (−1 life); stay off the lanes.

- **↑/↓ ←/→ or WASD** drive · **Space** order the nearest vehicle (≤110 px) to stop
- **Y/N** accept/decline radio calls · **F** enter the PRF post · **E** end the shift
- **1–6 / Enter** in quizzes · **Space / Esc** in flashcards
- On touch screens an on-screen pad (◀ ▲ ▼ ▶) and PARAR / Y / N / F / E buttons appear.
- 35% of traffic is irregular. Visible cues (helmet, zig-zag, tint, smoke…) get a label when you are close; some infractions only show up on inspection.
- Stopped vehicles may flee (per-situation `fuga` chance): touch them to intercept (a red arrow points to an off-screen fugitive, and a bar shows the 25 s you have). While a car pulls over, a cruise assist eases you in behind it.
- **Vehicle search** after every interception: 65% of fugitives hide a crime (drugs, contraband, descaminho, receptação, guns, counterfeit money, tampered chassis). Pick where to search (trunk, cabin, engine — 2 tries), then classify the crime: +5 search, +70 correct, +24 arrest; −40 wrong. Missed crimes are shown afterwards so you still learn them. Then the usual CTB inspection.
- **K-9** (bought at the PRF post, 120 pts, lasts the shift): press K during a search; the dog marks the right spot 90% of the time.
- Inspection: classification (+70/−40) then administrative measure (+70/−40), then article and explanation.
- In 35% of stops the partner asks a bonus question (CNH points, Art. 259, or base fine, Art. 258): +30, no penalty.
- Difficulty grows until 30 km: more irregular vehicles, more flights, denser traffic (HUD shows NÍVEL 1–5).
- Every 8 km a PRF post appears for 8 s (press F): refuel, recover a life (150 pts), or study. Points are the currency.
- Zé Roberto's flashcards (menu or post): read the scene, answer in your head, reveal the back.
- Situations don't repeat until the whole bank has been used.

## Testing

In `npm run dev` the page exposes `window.__pm` (stripped from production builds):
`state()`, `step(frames)` (advance the simulation even when the tab is hidden),
`spawnAhead(flee, situationId, crimeId|null)`, `showcase([situationIds])`, `radioNow()`, `night()`,
`setKm(k)`, `patch({...stats})`, `posto()`, `walkTo(x, y)`, `interact()` (the F key), `setSaldo(n)`.

Titles use the "Press Start 2P" Google Font; offline it falls back to the monospace font.

## Layout

| Path | What |
|---|---|
| `src/main.ts` | game loop, state machine, rendering, overlays |
| `src/config.ts` | tuning (values marked `(*)` match the original) |
| `src/data/situacoes.ts` | 39 CTB situations (written from the CTB text) |
| `src/data/crimes.ts` | 8 crimes for the vehicle search |
| `src/art.ts` | procedural pixel art: road tiles, roadside decor, km markers, vehicles, skinned patrol car, walking agent, lights |
| `src/lobby.ts` | the PRF base: layout, obstacles, interaction points, drawing |
| `src/data/skins.ts` | patrol-car liveries and uniforms with prices |
| `src/save.ts` | balance and owned/equipped cosmetics (localStorage, synced by the backend) |
| `src/backend.ts` | offline/Supabase adapter |
| `src/audio.ts` | Web Audio sound effects |
| `supabase/migrations/0001_init.sql` | runs, weekly leaderboard view, premium content, entitlements |
| `supabase/migrations/0002_saves.sql` | cloud saves, recovery codes (`create_recovery_code`, `claim_save`) |
| `supabase/migrations/0003_rpc.sql` | `submit_run` (score sanity checks) and `premium_situacoes` |
| `supabase/migrations/0004_nick_filter.sql` | ranking-name filter (`nick_blocklist` table; blocked names become "agente") |

## Going online (Supabase)

1. Create a project, enable **Anonymous sign-ins** (Auth → Providers).
2. `supabase link --project-ref <ref>` → `supabase db push`
3. Copy `.env.example` to `.env` and fill the URL and anon key (also set both in the Vercel project's environment variables).
4. Insert paid situations into `situacoes_premium.data` (same shape as `Situacao`),
   and a row in `entitlements` for users who paid (later: from a PIX webhook).

## Moderating ranking names

Names are filtered on submit against `nick_blocklist` (accents, leetspeak and separators are normalised).
Add a term in the Supabase SQL editor — `insert into nick_blocklist values ('termo', false);` (use `true`
for short terms that should match only as a whole word). To clean a name that got through:
`update runs set nick = 'agente' where nick = '...';`

## Content disclaimer

Situations were written against Lei 9.503/97 as compiled at
planalto.gov.br. Re-check every article, class and measure before publishing —
the law changes (e.g. Leis 14.071/2020 and 14.599/2023).

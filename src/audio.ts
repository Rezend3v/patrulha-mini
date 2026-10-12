// Tiny Web Audio synth: no audio files, like the original.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.06) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur);
}

export const sfx = {
  siren() { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, i * 0.18, 0.17); },
  correct() { tone(660, 0, 0.1); tone(990, 0.1, 0.18); },
  wrong() { tone(200, 0, 0.25, 'sawtooth'); },
  radio() { tone(1200, 0, 0.05); tone(1200, 0.1, 0.05); tone(1200, 0.2, 0.05); },
  hit() { tone(90, 0, 0.3, 'sawtooth', 0.1); },
};

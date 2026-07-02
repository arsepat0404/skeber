// Lightweight Web Audio SFX — no assets required
let ctx: AudioContext | null = null;

const MUTE_KEY = "sb_sfx_muted";
const VOL_KEY = "sb_sfx_volume";

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (raw == null) return 0.8;
    const n = parseFloat(raw);
    return isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
  } catch { return 0.8; }
}

let muted = readMuted();
let volume = readVolume();

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeSfx(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch {}
  emit();
}
export function isMuted() { return muted; }
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(VOL_KEY, String(volume)); } catch {}
  emit();
}
export function getVolume() { return volume; }

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

interface Tone {
  freq: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  delay?: number;
}

function tone({ freq, dur = 0.15, type = "sine", gain = 0.18, slideTo, delay = 0 }: Tone) {
  if (muted || volume <= 0) return;
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const peak = Math.max(0.0001, gain * volume);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  click: () => tone({ freq: 600, dur: 0.06, type: "square", gain: 0.08 }),
  pop:   () => tone({ freq: 880, dur: 0.12, type: "triangle", slideTo: 1200, gain: 0.15 }),
  submit: () => {
    tone({ freq: 523, dur: 0.1, type: "triangle", gain: 0.18 });
    tone({ freq: 784, dur: 0.14, type: "triangle", gain: 0.18, delay: 0.08 });
    tone({ freq: 1046, dur: 0.18, type: "triangle", gain: 0.2, delay: 0.18 });
  },
  submitWrite: () => {
    tone({ freq: 1500, dur: 0.05, type: "square", gain: 0.12 });
    tone({ freq: 1800, dur: 0.18, type: "triangle", gain: 0.18, delay: 0.06 });
  },
  submitDraw: () => {
    tone({ freq: 300, dur: 0.18, type: "sawtooth", slideTo: 900, gain: 0.18 });
    tone({ freq: 1200, dur: 0.12, type: "triangle", gain: 0.16, delay: 0.16 });
  },
  submitGuess: () => {
    tone({ freq: 700, dur: 0.08, type: "square", gain: 0.16 });
    tone({ freq: 1100, dur: 0.1, type: "square", gain: 0.18, delay: 0.08 });
    tone({ freq: 1500, dur: 0.16, type: "triangle", gain: 0.2, delay: 0.18 });
  },
  phaseWrite: () => {
    tone({ freq: 440, dur: 0.12, type: "sine", gain: 0.2 });
    tone({ freq: 660, dur: 0.16, type: "sine", gain: 0.2, delay: 0.1 });
  },
  phaseDraw: () => {
    tone({ freq: 523, dur: 0.12, type: "triangle", gain: 0.2 });
    tone({ freq: 880, dur: 0.18, type: "triangle", gain: 0.2, delay: 0.1 });
  },
  phaseGuess: () => {
    tone({ freq: 700, dur: 0.1, type: "square", gain: 0.15 });
    tone({ freq: 500, dur: 0.1, type: "square", gain: 0.15, delay: 0.08 });
    tone({ freq: 900, dur: 0.18, type: "square", gain: 0.18, delay: 0.18 });
  },
  tick: () => tone({ freq: 1200, dur: 0.04, type: "square", gain: 0.1 }),
  tickFast: () => {
    tone({ freq: 1400, dur: 0.04, type: "square", gain: 0.13 });
    tone({ freq: 1400, dur: 0.04, type: "square", gain: 0.13, delay: 0.08 });
  },
  alert: () => {
    tone({ freq: 1400, dur: 0.1, type: "sawtooth", gain: 0.22 });
    tone({ freq: 1400, dur: 0.1, type: "sawtooth", gain: 0.22, delay: 0.16 });
  },
  timeout: () => {
    tone({ freq: 220, dur: 0.25, type: "sawtooth", slideTo: 80, gain: 0.25 });
  },
  finish: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, dur: 0.18, type: "triangle", gain: 0.2, delay: i * 0.1 })
    );
  },
};

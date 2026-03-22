// platform/audio/engine.ts — Web Audio API 合成引擎
// 零依賴、零音檔，全部程式生成

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmGain: GainNode | null = null;

function ensureCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);

    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.25;
    bgmGain.connect(masterGain);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function initAudio() { ensureCtx(); }
export function getCtx() { return ensureCtx(); }
export function getSfxOut() { ensureCtx(); return sfxGain!; }
export function getBgmOut() { ensureCtx(); return bgmGain!; }

// ─── 音量控制 ─────────────────────────────────────
export function setMasterVolume(v: number) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}
export function setSfxVolume(v: number) {
  if (sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, v));
}
export function setBgmVolume(v: number) {
  if (bgmGain) bgmGain.gain.value = Math.max(0, Math.min(1, v));
}

// ─── 合成基元 ─────────────────────────────────────

/** 播放一個帶 envelope 的音調 */
export function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'square',
  vol = 0.3,
  delay = 0,
  dest?: AudioNode,
) {
  if (typeof window === 'undefined') return;
  const ac = getCtx();
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(dest ?? getSfxOut());
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** 播放濾波白噪音（爆炸、碰撞等） */
export function noise(
  dur: number,
  filterFreq = 2000,
  vol = 0.2,
  filterType: BiquadFilterType = 'lowpass',
  delay = 0,
  dest?: AudioNode,
) {
  if (typeof window === 'undefined') return;
  const ac = getCtx();
  const t = ac.currentTime + delay;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const flt = ac.createBiquadFilter();
  flt.type = filterType;
  flt.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(dest ?? getSfxOut());
  src.start(t);
}

/** 頻率掃描（雷射、墜落等） */
export function sweep(
  f0: number,
  f1: number,
  dur: number,
  type: OscillatorType = 'sawtooth',
  vol = 0.2,
  delay = 0,
  dest?: AudioNode,
) {
  if (typeof window === 'undefined') return;
  const ac = getCtx();
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(dest ?? getSfxOut());
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// ─── SFX 節流 ─────────────────────────────────────
const _lastPlay: Record<string, number> = {};
export function debounce(key: string, ms: number, fn: () => void) {
  const now = performance.now();
  if (now - (_lastPlay[key] ?? 0) < ms) return;
  _lastPlay[key] = now;
  fn();
}

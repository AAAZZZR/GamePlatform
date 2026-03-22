// platform/audio/bgm.ts — 大廳背景音樂
// 即時生成的 synthwave 風格 BGM，無邊界 seamless loop
// 12 和弦進行 ≈ 64 秒一輪，E→Am 完美終止式消除接縫感

import { getCtx, getBgmOut } from './engine';

let playing = false;
let schedulerId: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextTime = 0;

const BPM = 90;
const STEP = 60 / BPM / 4; // 十六分音符 ≈ 0.167s
const STEPS_PER_CHORD = 32; // 每和弦 2 小節

// ─── 音階頻率表 ────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const N: Record<string, number> = {};
for (let oct = 2; oct <= 6; oct++) {
  for (let i = 0; i < 12; i++) {
    N[`${NOTE_NAMES[i]}${oct}`] = 440 * Math.pow(2, (i - 9 + (oct - 4) * 12) / 12);
  }
}

// ─── 12 和弦進行 (Am 調) ──────────────────────────
// Am→F→C→G→Dm→Am→F→Em→Am→G→Dm→E
// 最後 E major (V) → Am (i) 形成完美終止式，loop 無接縫
interface Chord {
  bass: number;
  pad: number[];
  arp: number[];
}

const CHORDS: Chord[] = [
  { bass: N['A2'],  pad: [N['A3'],  N['C4'],  N['E4']],  arp: [N['A4'],  N['C5'],  N['E5'],  N['C5'],  N['A4'],  N['E4'],  N['C5'],  N['E5']]  },
  { bass: N['F2'],  pad: [N['F3'],  N['A3'],  N['C4']],  arp: [N['F4'],  N['A4'],  N['C5'],  N['A4'],  N['F4'],  N['C4'],  N['A4'],  N['C5']]  },
  { bass: N['C2'],  pad: [N['C3'],  N['E3'],  N['G3']],  arp: [N['C4'],  N['E4'],  N['G4'],  N['E4'],  N['C4'],  N['G3'],  N['E4'],  N['G4']]  },
  { bass: N['G2'],  pad: [N['G3'],  N['B3'],  N['D4']],  arp: [N['G4'],  N['B4'],  N['D5'],  N['B4'],  N['G4'],  N['D4'],  N['B4'],  N['D5']]  },
  { bass: N['D2'],  pad: [N['D3'],  N['F3'],  N['A3']],  arp: [N['D4'],  N['F4'],  N['A4'],  N['F4'],  N['D4'],  N['A3'],  N['F4'],  N['A4']]  },
  { bass: N['A2'],  pad: [N['A3'],  N['C4'],  N['E4']],  arp: [N['E4'],  N['A4'],  N['C5'],  N['E5'],  N['C5'],  N['A4'],  N['E4'],  N['A4']]  },
  { bass: N['F2'],  pad: [N['F3'],  N['A3'],  N['C4']],  arp: [N['C4'],  N['F4'],  N['A4'],  N['C5'],  N['A4'],  N['F4'],  N['C4'],  N['F4']]  },
  { bass: N['E2'],  pad: [N['E3'],  N['G3'],  N['B3']],  arp: [N['E4'],  N['G4'],  N['B4'],  N['G4'],  N['E4'],  N['B3'],  N['G4'],  N['B4']]  },
  { bass: N['A2'],  pad: [N['A3'],  N['C4'],  N['E4']],  arp: [N['A4'],  N['E5'],  N['C5'],  N['A4'],  N['E4'],  N['C5'],  N['A4'],  N['E5']]  },
  { bass: N['G2'],  pad: [N['G3'],  N['B3'],  N['D4']],  arp: [N['D4'],  N['G4'],  N['B4'],  N['D5'],  N['B4'],  N['G4'],  N['D4'],  N['G4']]  },
  { bass: N['D2'],  pad: [N['D3'],  N['F3'],  N['A3']],  arp: [N['A3'],  N['D4'],  N['F4'],  N['A4'],  N['F4'],  N['D4'],  N['A3'],  N['D4']]  },
  { bass: N['E2'],  pad: [N['E3'],  N['G#3'], N['B3']],  arp: [N['E4'],  N['G#4'], N['B4'],  N['G#4'], N['E4'],  N['B3'],  N['G#4'], N['B4']]  },
];

// ─── 樂器合成 ──────────────────────────────────────

function padNote(freq: number, t: number, dur: number, ac: AudioContext, dest: AudioNode) {
  for (const det of [-5, 0, 5]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = det;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + Math.min(0.8, dur * 0.3));
    g.gain.setValueAtTime(0.04, t + dur - 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }
}

function bassNote(freq: number, t: number, dur: number, ac: AudioContext, dest: AudioNode) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.1, t);
  g.gain.setValueAtTime(0.1, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.1);
}

function arpNote(freq: number, t: number, ac: AudioContext, dest: AudioNode, vol = 0.055) {
  const osc = ac.createOscillator();
  const flt = ac.createBiquadFilter();
  const g = ac.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  flt.type = 'lowpass';
  flt.frequency.value = 3000;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 3);
  osc.connect(flt);
  flt.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + STEP * 3 + 0.1);
}

function hihat(t: number, vol: number, ac: AudioContext, dest: AudioNode) {
  const len = Math.floor(ac.sampleRate * 0.03);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const flt = ac.createBiquadFilter();
  flt.type = 'highpass';
  flt.frequency.value = 8000;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(flt);
  flt.connect(g);
  g.connect(dest);
  src.start(t);
}

function kick(t: number, ac: AudioContext, dest: AudioNode) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + 0.2);
}

// ─── 排程器 ────────────────────────────────────────

function scheduleStep(ac: AudioContext, dest: AudioNode) {
  const chordIdx = Math.floor(step / STEPS_PER_CHORD) % CHORDS.length;
  const chord = CHORDS[chordIdx];
  const s = step % STEPS_PER_CHORD;
  const cycle = Math.floor(step / (STEPS_PER_CHORD * CHORDS.length));

  // Pad：每個和弦開頭，慢 attack/release 自然交叉淡入
  if (s === 0) {
    const dur = STEPS_PER_CHORD * STEP;
    for (const f of chord.pad) {
      padNote(f, nextTime, dur, ac, dest);
    }
  }

  // Bass：每拍（8 步），root→五度→root→八度 的行走 pattern
  if (s % 8 === 0) {
    const bassOffsets = [0, 7, 0, 12];
    const offset = bassOffsets[Math.floor(s / 8) % bassOffsets.length];
    const freq = chord.bass * Math.pow(2, offset / 12);
    bassNote(freq, nextTime, STEP * 6, ac, dest);
  }

  // Arp：偶數輪八分音符，奇數輪十六分音符（增加動態感）
  const arpInterval = cycle % 2 === 0 ? 4 : 2;
  if (s % arpInterval === 0) {
    const arpIdx = Math.floor(s / arpInterval) % chord.arp.length;
    const vol = cycle % 2 === 0 ? 0.05 : 0.04;
    arpNote(chord.arp[arpIdx], nextTime, ac, dest, vol);
  }

  // Hi-hat
  const hihatInterval = cycle % 2 === 0 ? 4 : 2;
  if (s % hihatInterval === 0) {
    const accent = s % 16 === 0;
    hihat(nextTime, accent ? 0.04 : 0.015, ac, dest);
  }

  // Kick：拍 1 & 3
  if (s === 0 || s === 16) {
    kick(nextTime, ac, dest);
  }

  nextTime += STEP;
  step++;
}

function scheduler() {
  const ac = getCtx();
  const dest = getBgmOut();
  while (nextTime < ac.currentTime + 0.2) {
    scheduleStep(ac, dest);
  }
}

// ─── 公開 API ──────────────────────────────────────

export function startBgm() {
  if (typeof window === 'undefined' || playing) return;
  playing = true;
  const ac = getCtx();
  const dest = getBgmOut();
  dest.gain.cancelScheduledValues(ac.currentTime);
  dest.gain.setValueAtTime(0, ac.currentTime);
  dest.gain.linearRampToValueAtTime(0.25, ac.currentTime + 2);
  step = 0;
  nextTime = ac.currentTime + 0.1;
  schedulerId = setInterval(scheduler, 50);
  scheduler();
}

export function stopBgm() {
  if (!playing) return;
  playing = false;
  if (schedulerId) { clearInterval(schedulerId); schedulerId = null; }
  try {
    const ac = getCtx();
    const dest = getBgmOut();
    dest.gain.cancelScheduledValues(ac.currentTime);
    dest.gain.setValueAtTime(dest.gain.value, ac.currentTime);
    dest.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
  } catch (_) { /* AudioContext may be closed */ }
}

export function isBgmPlaying() { return playing; }

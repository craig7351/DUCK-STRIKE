// ============================================================================
// music.ts — 程序合成背景音樂（引擎層，零音檔）。輕量步進音序器 + 5 種曲風。
// 與 sound.ts 共用 AudioContext，走獨立 bus（音量與 SFX 分開）。
// ============================================================================
import { getCtx } from './sound'

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)   // MIDI → 頻率

export interface TrackDef {
  name: string
  bpm: number
  lead: OscillatorType
  bassType: OscillatorType
  chords: number[][]          // 每小節的和弦組成音（MIDI，[0]=根音）
  arp: boolean                // 琶音
  pad: boolean                // 持續和弦鋪底
  drums: 'none' | 'soft' | 'four'
  leadGain: number
  bassGain: number
  cutoff: number              // 主音低通截止
}

// 音名參考：A3=57 C4=60 E4=64 / F3=53 G3=55 B3=59 D4=62 / Dm=50,53,57 …
export const MUSIC_TRACKS: TrackDef[] = [
  { name: '緊張', bpm: 146, lead: 'sawtooth', bassType: 'square', arp: true, pad: false, drums: 'four',
    chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [57, 60, 64]], leadGain: 0.09, bassGain: 0.16, cutoff: 2600 },
  { name: '輕快', bpm: 126, lead: 'triangle', bassType: 'triangle', arp: true, pad: false, drums: 'soft',
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], leadGain: 0.12, bassGain: 0.14, cutoff: 3500 },
  { name: '史詩', bpm: 96, lead: 'sawtooth', bassType: 'sawtooth', arp: false, pad: true, drums: 'soft',
    chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], leadGain: 0.10, bassGain: 0.16, cutoff: 1600 },
  { name: '電子', bpm: 128, lead: 'square', bassType: 'sawtooth', arp: true, pad: false, drums: 'four',
    chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]], leadGain: 0.08, bassGain: 0.18, cutoff: 2200 },
  { name: '安靜', bpm: 72, lead: 'sine', bassType: 'sine', arp: false, pad: true, drums: 'none',
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], leadGain: 0.11, bassGain: 0.12, cutoff: 1400 },
]

let ctx: AudioContext | null = null
let bus: GainNode | null = null
let noise: AudioBuffer | null = null
let current: TrackDef | null = null
let intervalId: ReturnType<typeof setInterval> | null = null
let nextTime = 0
let gstep = 0

function noiseBuf(c: AudioContext): AudioBuffer {
  if (noise) return noise
  const n = Math.floor(c.sampleRate * 0.2)
  const b = c.createBuffer(1, n, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  noise = b
  return b
}

function pluck(freq: number, t: number, dur: number, type: OscillatorType, gain: number, cutoff: number) {
  const c = ctx!
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff
  o.connect(f); f.connect(g); g.connect(bus!)
  o.start(t); o.stop(t + dur + 0.02)
}

function pad(freqs: number[], t: number, dur: number, gain: number) {
  const c = ctx!
  for (const fr of freqs) {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.25)
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.7)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200
    o.connect(f); f.connect(g); g.connect(bus!)
    o.start(t); o.stop(t + dur + 0.05)
  }
}

function kick(t: number) {
  const c = ctx!
  const o = c.createOscillator(); o.type = 'sine'
  o.frequency.setValueAtTime(135, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
  o.connect(g); g.connect(bus!); o.start(t); o.stop(t + 0.18)
}

function hat(t: number, vol: number) {
  const c = ctx!
  const n = c.createBufferSource(); n.buffer = noiseBuf(c)
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
  n.connect(f); f.connect(g); g.connect(bus!); n.start(t); n.stop(t + 0.06)
}

// 排程第 globalStep 步（16 分音符）在時間 t 的所有事件
function scheduleStep(globalStep: number, t: number) {
  const tr = current!
  const bar = Math.floor(globalStep / 16) % tr.chords.length
  const s = globalStep % 16
  const chord = tr.chords[bar]
  const stepDur = 60 / tr.bpm / 4

  if (s % 4 === 0) pluck(mtof(chord[0] - 12), t, stepDur * 3.5, tr.bassType, tr.bassGain, 900)   // 貝斯（四分）
  if (tr.arp && s % 2 === 0) {
    const note = chord[(s / 2) % chord.length] + 12
    pluck(mtof(note), t, stepDur * 1.6, tr.lead, tr.leadGain, tr.cutoff)                          // 琶音
  }
  if (tr.pad && s === 0) pad(chord.map((n) => mtof(n)), t, stepDur * 16, tr.leadGain * 0.5)       // 鋪底和弦
  if (tr.drums === 'four') { if (s % 4 === 0) kick(t); if (s % 4 === 2) hat(t, 0.12) }
  else if (tr.drums === 'soft') { if (s === 0 || s === 8) kick(t); if (s % 4 === 2) hat(t, 0.06) }
}

// 前瞻排程：每 25ms 把未來 0.1s 內的步進排上時間軸，確保穩定不卡頓
function loop() {
  const c = ctx!
  if (c.state !== 'running') { nextTime = c.currentTime + 0.06; return }   // 音訊尚未解鎖（等使用者互動）→ 待命
  while (nextTime < c.currentTime + 0.1) {
    scheduleStep(gstep, nextTime)
    nextTime += 60 / current!.bpm / 4
    gstep++
  }
}

function stopScheduler() { if (intervalId !== null) { clearInterval(intervalId); intervalId = null } }

export const Music = {
  current: -1,   // -1 = 關閉

  start(i: number) {
    const c = getCtx()
    ctx = c
    // 瀏覽器自動播放政策：context 未解鎖時，掛一次性監聽在首次互動時 resume
    if (c.state === 'suspended') {
      const resume = () => {
        void c.resume()
        window.removeEventListener('pointerdown', resume)
        window.removeEventListener('keydown', resume)
      }
      window.addEventListener('pointerdown', resume)
      window.addEventListener('keydown', resume)
    }
    if (!bus) { bus = c.createGain(); bus.gain.value = 0.3; bus.connect(c.destination) }
    stopScheduler()
    current = MUSIC_TRACKS[i]
    this.current = i
    gstep = 0
    nextTime = c.currentTime + 0.06
    bus.gain.cancelScheduledValues(c.currentTime)
    bus.gain.setValueAtTime(0.3, c.currentTime)
    intervalId = setInterval(loop, 25)
  },

  stop() {
    this.current = -1
    current = null
    stopScheduler()
    if (ctx && bus) {
      bus.gain.cancelScheduledValues(ctx.currentTime)
      bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08)
    }
  },

  toggle(i: number) { if (this.current === i) this.stop(); else this.start(i) },
}

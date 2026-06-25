// ============================================================================
// sound.ts — Web Audio 程序合成（引擎層，零音檔）。換遊戲只調音色參數。
// ============================================================================

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true

function ac(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    master = ctx.createGain()
    master.gain.value = 0.6
    master.connect(ctx.destination)
  }
  return ctx
}

export function initAudio() {
  const c = ac()
  if (c.state === 'suspended') c.resume()
}

export function setVolume(v: number) {
  if (master) master.gain.value = v
}
export function setSoundEnabled(on: boolean) { enabled = on }

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.3, slideTo?: number) {
  if (!enabled) return
  const c = ac()
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, c.currentTime)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), c.currentTime + dur)
  g.gain.setValueAtTime(vol, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  o.connect(g); g.connect(master!)
  o.start(); o.stop(c.currentTime + dur)
}

function noise(dur: number, vol = 0.3, filterFreq = 1800, type: BiquadFilterType = 'lowpass') {
  if (!enabled) return
  const c = ac()
  const n = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const src = c.createBufferSource(); src.buffer = buf
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq
  const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  src.connect(f); f.connect(g); g.connect(master!)
  src.start(); src.stop(c.currentTime + dur)
}

// ---- SFX ----
export const SFX = {
  shoot(weapon: string) {
    switch (weapon) {
      case 'pistol': noise(0.09, 0.35, 2600); tone(220, 0.08, 'square', 0.18, 90); break
      case 'smg':    noise(0.06, 0.28, 3000); tone(260, 0.05, 'square', 0.14, 120); break
      case 'ak':     noise(0.11, 0.42, 2200); tone(160, 0.10, 'sawtooth', 0.22, 70); break
      case 'shotgun':noise(0.18, 0.5, 1400); tone(110, 0.16, 'sawtooth', 0.28, 50); break
      case 'sniper': noise(0.22, 0.55, 1800); tone(140, 0.2, 'sawtooth', 0.3, 55); break
      case 'knife':  noise(0.05, 0.2, 5000, 'highpass'); tone(900, 0.05, 'triangle', 0.1, 1400); break
      default:       noise(0.08, 0.3, 2400)
    }
  },
  dryFire() { tone(600, 0.04, 'square', 0.08, 300) },
  reload() { tone(380, 0.05, 'square', 0.12); setTimeout(() => tone(520, 0.06, 'square', 0.12), 180) },
  hit() { tone(720, 0.05, 'triangle', 0.14, 480) },          // 命中敵人反饋
  headshot() { tone(1200, 0.08, 'triangle', 0.22, 700); tone(300, 0.06, 'square', 0.1) },
  enemyHit() { noise(0.06, 0.2, 1200) },
  enemyDie() { tone(180, 0.3, 'sawtooth', 0.2, 60); noise(0.2, 0.18, 900) },
  playerHurt() { tone(160, 0.18, 'sawtooth', 0.25, 80); noise(0.12, 0.18, 700) },
  pickup() { tone(660, 0.08, 'triangle', 0.18); setTimeout(() => tone(990, 0.1, 'triangle', 0.18), 70) },
  buy() { tone(520, 0.07, 'square', 0.15); setTimeout(() => tone(780, 0.09, 'square', 0.15), 80) },
  waveStart() { [330, 440, 550].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.2), i * 130)) },
  waveClear() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.22), i * 110)) },
  gameOver() { [440, 392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sawtooth', 0.22, f * 0.8), i * 260)) },
  explode() { noise(0.4, 0.5, 800); tone(80, 0.4, 'sawtooth', 0.3, 40) },
  throwGrenade() { noise(0.16, 0.18, 1200, 'bandpass'); tone(420, 0.12, 'triangle', 0.1, 180) },
}

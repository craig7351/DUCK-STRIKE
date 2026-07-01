// ============================================================================
// config.ts — 全域數值常數（資料層）。換新遊戲調這裡，流程不動。
// ============================================================================

export const WORLD = {
  arenaHalf: 48,        // 競技場半徑（正方形）
  gravity: -22,
  groundFriction: 10,
}

export const PLAYER = {
  height: 1.7,          // 眼睛高度
  radius: 0.45,
  walkSpeed: 6.5,
  runSpeed: 9.5,
  crouchSpeed: 3.2,
  jumpSpeed: 7.2,
  maxHp: 100,
  startArmor: 0,
  mouseSensitivity: 0.0022,
  // 受擊後回血（慢速）：最後一次受擊過 regenDelay 秒後，每秒回 regenRate
  regenDelay: 5,        // 秒，最後一次受擊後
  regenRate: 3,         // hp/秒（慢速回血）
}

export type WeaponId = 'knife' | 'pistol' | 'smg' | 'ak' | 'shotgun' | 'sniper'

export interface WeaponDef {
  id: WeaponId
  name: string
  model: string         // public/models/guns/*
  melee?: boolean
  damage: number
  rpm: number           // 每分鐘發射數
  auto: boolean         // 全自動
  magSize: number
  reserve: number       // 備彈
  reloadTime: number    // 秒
  spreadHip: number     // 腰射散布（弧度）
  spreadAim: number     // 瞄準散布
  pellets: number       // 霰彈顆數
  range: number
  recoil: number        // 後座（鏡頭抬升量）
  headMult: number      // 爆頭倍率
  scope?: number        // 開鏡 FOV（狙擊）
  price: number
  // 視角模型擺放（相對相機，右下角）
  vm: { pos: [number, number, number]; rot: [number, number, number]; scale: number; muzzle: [number, number, number] }
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  // vm.rot：素材槍管沿 local +X，繞 Y 轉 -90° 讓槍口朝向螢幕內(+Z)。
  // vm.pos：相對相機的右下偏移。vm.scale：相對統一長度的微調。muzzle 已不使用(改相機相對)。
  knife: {
    id: 'knife', name: '軍刀', model: 'knife_1', melee: true,
    damage: 55, rpm: 120, auto: false, magSize: 0, reserve: 0, reloadTime: 0,
    spreadHip: 0, spreadAim: 0, pellets: 1, range: 2.4, recoil: 0, headMult: 1.5, price: 0,
    vm: { pos: [0.16, -0.16, 0.34], rot: [0, -Math.PI / 2, 0], scale: 0.9, muzzle: [0, 0, 0] },
  },
  pistol: {
    id: 'pistol', name: '手槍', model: 'pistol',
    damage: 28, rpm: 360, auto: false, magSize: 12, reserve: 96, reloadTime: 0.3,
    spreadHip: 0.022, spreadAim: 0.006, pellets: 1, range: 80, recoil: 0.012, headMult: 3.2, price: 0,
    vm: { pos: [0.16, -0.17, 0.34], rot: [0, -Math.PI / 2, 0], scale: 0.85, muzzle: [0, 0, 0] },
  },
  smg: {
    id: 'smg', name: '衝鋒槍', model: 'smg',
    damage: 22, rpm: 750, auto: true, magSize: 30, reserve: 210, reloadTime: 0.44,
    spreadHip: 0.04, spreadAim: 0.013, pellets: 1, range: 90, recoil: 0.009, headMult: 2.6, price: 1200,
    vm: { pos: [0.16, -0.18, 0.36], rot: [0, -Math.PI / 2, 0], scale: 1.0, muzzle: [0, 0, 0] },
  },
  ak: {
    id: 'ak', name: '突擊步槍', model: 'ak',
    damage: 38, rpm: 600, auto: true, magSize: 30, reserve: 180, reloadTime: 0.5,
    spreadHip: 0.05, spreadAim: 0.009, pellets: 1, range: 120, recoil: 0.018, headMult: 3.5, price: 2700,
    vm: { pos: [0.17, -0.18, 0.36], rot: [0, -Math.PI / 2, 0], scale: 1.15, muzzle: [0, 0, 0] },
  },
  shotgun: {
    id: 'shotgun', name: '霰彈槍', model: 'shotgun',
    damage: 22, rpm: 105, auto: false, magSize: 8, reserve: 64, reloadTime: 0.12, // 逐發裝填(簡化)
    spreadHip: 0.075, spreadAim: 0.045, pellets: 10, range: 42, recoil: 0.045, headMult: 1.8, price: 2000,
    vm: { pos: [0.17, -0.18, 0.36], rot: [0, -Math.PI / 2, 0], scale: 1.1, muzzle: [0, 0, 0] },
  },
  sniper: {
    id: 'sniper', name: '狙擊槍', model: 'sniper',
    damage: 115, rpm: 48, auto: false, magSize: 5, reserve: 35, reloadTime: 0.6,
    spreadHip: 0.12, spreadAim: 0.0008, pellets: 1, range: 200, recoil: 0.05, headMult: 1.8, scope: 22, price: 4750,
    vm: { pos: [0.17, -0.18, 0.38], rot: [0, -Math.PI / 2, 0], scale: 1.25, muzzle: [0, 0, 0] },
  },
}

export type EnemyId = 'grunt' | 'rusher' | 'hazmat' | 'bomber' | 'boss' | 'slasher'

export interface EnemyDef {
  id: EnemyId
  name: string
  model: string         // public/models/characters/*
  hp: number
  speed: number
  damage: number        // 每發
  rpm: number           // 攻擊頻率
  range: number         // 開火距離
  accuracy: number      // 0~1 命中機率
  reward: number        // 擊殺金錢
  scale: number
  suicide?: boolean     // 自爆兵：接近後引爆
  explodeRadius?: number
  explodeDmg?: number
  melee?: boolean       // 近戰兵：貼身砍擊（不開槍、不射曳光）
  boss?: boolean
  tint?: [number, number, number] // 模型染色（區別兵種）
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  grunt:  { id: 'grunt',  name: '雜兵',   model: 'enemy',  hp: 100, speed: 3.2, damage: 8,  rpm: 90,  range: 32, accuracy: 0.35, reward: 150, scale: 1.0 },
  rusher: { id: 'rusher', name: '突擊兵', model: 'enemy',  hp: 70,  speed: 5.4, damage: 14, rpm: 50,  range: 6,  accuracy: 0.6,  reward: 180, scale: 0.92 },
  hazmat: { id: 'hazmat', name: '重裝兵', model: 'hazmat', hp: 240, speed: 2.4, damage: 16, rpm: 70,  range: 28, accuracy: 0.45, reward: 300, scale: 1.05 },
  bomber: { id: 'bomber', name: '自爆兵', model: 'enemy',  hp: 55,  speed: 6.2, damage: 0,  rpm: 1,   range: 2.6, accuracy: 1, reward: 220, scale: 0.95, suicide: true, explodeRadius: 4.5, explodeDmg: 55, tint: [1, 0.35, 0.1] },
  slasher:{ id: 'slasher',name: '刀兵',   model: 'soldier',hp: 95,  speed: 7.0, damage: 20, rpm: 70,  range: 2.4, accuracy: 1, reward: 210, scale: 1.0, melee: true },
  boss:   { id: 'boss',   name: '王',     model: 'hazmat', hp: 1600, speed: 2.7, damage: 24, rpm: 90, range: 34, accuracy: 0.55, reward: 2000, scale: 2.3, boss: true, tint: [0.7, 0.1, 0.7] },
}

// 補血包（軍火庫購買，每次進軍火庫限購 1 個）
export const MEDKIT = { price: 500, heal: 50 }

export const ECONOMY = {
  startMoney: 800,
  killBonusStreak: 20,    // 連殺額外
  roundReward: 300,
  headshotBonus: 50,
}

// 波次設定：每波敵人數與組成隨波遞增；每 5 波為王波
export interface WaveSpec { count: number; types: EnemyId[]; concurrent: number; boss: boolean }
export function waveSpec(wave: number): WaveSpec {
  if (wave % 5 === 0) {
    // 王波：N 隻王 + 一大群小兵
    const bossCount = Math.floor(wave / 5)            // 第10波2隻、15波3隻…
    const types: EnemyId[] = []
    for (let i = 0; i < bossCount; i++) types.push('boss')
    return { count: bossCount + 6 + Math.floor(wave / 3), types, concurrent: 6, boss: true }
  }
  const count = 5 + Math.floor(wave * 2.6)
  const concurrent = Math.min(5 + Math.floor(wave * 0.7), 14)
  const types: EnemyId[] = ['grunt']
  if (wave >= 2) types.push('rusher')
  if (wave >= 3) types.push('grunt', 'rusher', 'slasher')
  if (wave >= 4) types.push('hazmat', 'bomber')
  if (wave >= 6) types.push('hazmat', 'rusher', 'bomber', 'slasher')
  return { count, types, concurrent, boss: false }
}

// 難度
export type Difficulty = 'easy' | 'normal' | 'hard' | 'hell'
export interface DiffMod { name: string; enemyHp: number; enemyDmg: number; enemySpeed: number; count: number; reward: number }
export const DIFFICULTIES: Record<Difficulty, DiffMod> = {
  easy:   { name: '簡單', enemyHp: 0.7, enemyDmg: 0.55, enemySpeed: 0.9,  count: 0.8,  reward: 1.2 },
  normal: { name: '普通', enemyHp: 1.0, enemyDmg: 1.0,  enemySpeed: 1.0,  count: 1.0,  reward: 1.0 },
  hard:   { name: '困難', enemyHp: 1.4, enemyDmg: 1.4,  enemySpeed: 1.1,  count: 1.25, reward: 1.35 },
  hell:   { name: '地獄', enemyHp: 2.0, enemyDmg: 1.9,  enemySpeed: 1.25, count: 1.5,  reward: 1.7 },
}

// 掉落物 / 限時強化
export type PickupKind = 'heal' | 'ammo' | 'frenzy'
export const DROP = {
  chance: 0.26,            // 一般敵人掉落機率
  healAmount: 35,
  ammoMags: 2,             // 補當前武器 N 個彈匣量的備彈
  frenzyDuration: 7,       // 狂暴秒數
  frenzyDmgMult: 2,
  frenzyRpmMult: 1.5,
  pickupRadius: 1.8,
}

// 手榴彈（投擲物）：拋物線飛行、落地反彈、引信到時範圍爆炸
export const GRENADE = {
  start: 2,             // 每場起始數量
  max: 4,               // 攜帶上限
  refillPerWave: 1,     // 每進新一波補充
  damage: 260,          // 中心最大傷害（依距離遞減）×2
  radius: 12,           // 爆炸半徑（公尺）×2
  fuse: 1.5,            // 引信秒數
  throwSpeed: 34,       // 水平投擲初速（拋出距離 ×2）
  throwUp: 4.2,         // 上拋分量
  cooldown: 0.55,       // 連續投擲冷卻（秒）
  size: 0.32,           // 視覺模型高度（公尺）
  restitution: 0.42,    // 反彈係數
  friction: 0.66,       // 落地後水平摩擦
  playerDmgFactor: 0.7, // 對玩家自傷比例
  selfDmgMax: 10,       // 自傷上限（最多扣這麼多 HP）
}

// 連殺獎勵門檻
export const KILLSTREAK = {
  heal: 5,        // 連殺 5 → 回血
  healAmount: 30,
  frenzy: 10,     // 連殺 10 → 狂暴
  supply: 15,     // 連殺 15 → 補滿彈藥
}

// 大絕：時間緩慢（子彈時間）。靠擊殺充能，啟動時世界變慢、玩家照常。
export const ULTIMATE = {
  slowFactor: 0.3,      // 世界時間縮放（敵人/敵彈/掉落/特效）
  maxCharge: 10,        // 充能上限（秒）
  killsPerStep: 5,      // 每殺幾隻充能一次
  chargePerStep: 1,     // 每次充能秒數
  minActivate: 0.3,     // 至少要有這麼多秒才能啟動
}

export const THEME = {
  title: 'DUCK STRIKE',
  subtitle: '鴨鴨突擊',
  accent: '#ffcc00',
}

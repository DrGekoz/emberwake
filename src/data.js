export const NIGHT = 300; // seconds until dawn
export const BOSS_AT = 210;
export const SURGES = [60, 120, 180, 255];

// Stats are pure functions of upgrade level, so balance tweaks live in one place.
export const UPGRADES = [
  { id: 'bolt', icon: 0, name: 'Ember Bolt', max: 5, desc: (l) => l === 1 ? 'Your lantern spits fire at the nearest foe.' : `Bolt damage ${boltDmg(l - 1)} → ${boltDmg(l)}, fires faster.` },
  { id: 'twin', icon: 1, name: 'Twin Flame', max: 4, desc: (l) => `Fire ${l + 1} bolts per volley.` },
  { id: 'orbit', icon: 2, name: 'Cinder Halo', max: 5, desc: (l) => l === 1 ? '2 cinders circle you, scorching anything they touch.' : `${l + 1} cinders, wider and hotter.` },
  { id: 'scatter', icon: 3, name: 'Scatter Sparks', max: 4, desc: (l) => `Bolts burst into ${l + 1} sparks on impact.` },
  { id: 'boots', icon: 4, name: 'Swift Boots', max: 5, desc: (l) => `+${l * 10}% move speed, dash recharges faster.` },
  { id: 'heart', icon: 5, name: 'Hearthstone', max: 5, desc: () => '+20 max health and heal 40.' },
  { id: 'magnet', icon: 6, name: 'Lodestone', max: 4, desc: (l) => `Pull embers from ${Math.round(magnetR(l) * 10) / 10}m away.` },
  { id: 'lantern', icon: 7, name: 'Bright Lantern', max: 5, desc: (l) => `Wider light. Foes inside it burn for ${auraDps(l)}/s.` },
  { id: 'chain', icon: 8, name: 'Storm Chain', max: 5, desc: (l) => l === 1 ? 'Lightning leaps between 3 foes every few seconds.' : `Leaps ${l + 2} times, strikes more often.` },
  { id: 'nova', icon: 9, name: 'Sunburst', max: 5, desc: (l) => l === 1 ? 'Release a blast of daylight around you.' : `Bigger blast, ${novaDmg(l)} damage.` },
  { id: 'ward', icon: 10, name: 'Moon Ward', max: 4, desc: (l) => `A shield blocks one hit. Recharges in ${wardCd(l)}s.` },
  { id: 'wick', icon: 11, name: 'Quick Wick', max: 4, desc: (l) => `All abilities recharge ${l * 8}% faster.` },
];

export const boltDmg = (l) => 10 + (l - 1) * 5;
export const boltCd = (l) => 0.62 - (l - 1) * 0.06;
export const orbitDmg = (l) => 9 + l * 4;
export const magnetR = (l) => 2.4 * (1 + l * 0.55);
export const auraDps = (l) => l * 5;
export const lightR = (l) => 8 + l * 1.3;
export const chainCd = (l) => 3.4 - l * 0.35;
export const chainDmg = (l) => 16 + l * 7;
export const novaCd = (l) => 5.2 - l * 0.5;
export const novaDmg = (l) => 22 + l * 10;
export const novaR = (l) => 4 + l * 0.7;
export const wardCd = (l) => 13 - l * 2;

// r: collision radius, s: sprite scale, col: death burst color, glow: emissive strength
export const ENEMIES = {
  shade: { hp: 14, speed: 2.7, dmg: 8, r: 0.45, xp: 1, score: 10, s: 0.85, col: [0.6, 0.35, 1.0], glow: 2.6, hover: 0.35 },
  moth: { hp: 7, speed: 4.4, dmg: 6, r: 0.4, xp: 1, score: 8, s: 0.75, col: [0.85, 0.7, 1.0], glow: 2.0, hover: 0.9 },
  crawler: { hp: 34, speed: 1.9, dmg: 11, r: 0.6, xp: 2, score: 20, s: 0.9, col: [0.5, 1.0, 0.35], glow: 2.4, hover: 0 },
  wraith: { hp: 70, speed: 2.2, dmg: 12, r: 0.55, xp: 5, score: 60, s: 1.0, col: [1.0, 0.3, 0.3], glow: 3.0, hover: 0.25 },
  golem: { hp: 220, speed: 1.35, dmg: 20, r: 1.0, xp: 8, score: 120, s: 1.0, col: [0.4, 1.0, 0.9], glow: 2.2, hover: 0, heavy: true },
  boss: { hp: 3200, speed: 2.3, dmg: 22, r: 1.7, xp: 0, score: 5000, s: 1.0, col: [0.7, 0.8, 1.0], glow: 3.0, hover: 1.4, heavy: true },
};

export const xpNeed = (lv) => Math.round(5 + lv * 3 + lv ** 1.6);

// Aircraft catalogue: flight characteristics, weapons and the geometric design
// data used by JetBuilder. Dimensions are metres, z measured from the nose tip
// towards the tail, x to the right, y up.

const S = (z, w, top, bot, y = 0, n = 2, nb) => ({ z, w, top, bot, y, n, nb: nb ?? n });
const W = (x, y, z, chord, t = 0.045) => ({ x, y, z, chord, t });

// Tangent-ogive radome from the nose tip to a station (len, w, top, bot)
const NOSE = (len, w, top, bot, y = 0, tipY = y, n = 2, nb = n, steps = 6) => {
  const out = [];
  const f = len / w; // fineness ratio in units of the radius
  const rho = (1 + f * f) / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * f;
    const r = Math.sqrt(Math.max(0, rho * rho - (f - x) * (f - x))) - (rho - 1);
    const k = i === 0 ? 0 : Math.min(1, Math.max(0, r));
    out.push(S(t * len, w * k, top * k, bot * k, tipY + (y - tipY) * t, n, nb));
  }
  return out;
};

export const JETS = {
  f16: {
    id: 'f16',
    name: 'F-16C Viper',
    role: 'Multirole fighter',
    description: 'Light, nimble and forgiving. Bubble canopy gives superb visibility and the fly-by-wire system lets you pull 9 G all day.',
    unlock: 0,
    stats: { speed: 0.72, agility: 0.86, firepower: 0.55, armor: 0.5 },
    flight: {
      mass: 12000, wingArea: 27.9, thrustDry: 76, thrustAB: 127, cd0: 0.019, k: 0.11,
      clAlpha: 4.6, maxAoA: 26, maxG: 9, pitchRate: 26, rollRate: 260, yawRate: 18, maxMach: 2.0,
    },
    weapons: { gunAmmo: 510, missiles: 6, flares: 30, gunRate: 100, gunDamage: 6 },
    health: 100,
    livery: { base: '#8c939b', belly: '#9aa1a8', camo: [{ color: '#727982', count: 40, size: 80, type: 'blob' }], panelAlpha: 0.32, seed: 11, weather: 1 },
    insignia: 'star', tailCode: 'WP',
    design: {
      length: 15.0, cg: 8.4,
      fuselage: [
        ...NOSE(2.6, 0.48, 0.47, 0.45, 0.02, 0.08),
        S(3.8, 0.56, 0.55, 0.55, 0), S(5.2, 0.66, 0.6, 0.66, -0.02, 2.4), S(7.0, 0.78, 0.62, 0.7, -0.02, 2.8),
        S(9.5, 0.8, 0.62, 0.66, -0.02, 2.6), S(11.8, 0.7, 0.58, 0.58, 0.0, 2.3), S(13.5, 0.56, 0.52, 0.52, 0.04),
      ],
      spine: [S(4.9, 0.2, 0.62, 0.1, 0.25), S(6.0, 0.34, 0.6, 0.1, 0.3), S(9.0, 0.36, 0.55, 0.1, 0.32), S(11.5, 0.28, 0.42, 0.1, 0.3), S(12.6, 0.1, 0.25, 0.1, 0.3)],
      intake: { sections: [S(4.4, 0.54, 0.34, 0.38, -0.84, 2.6), S(5.6, 0.6, 0.5, 0.42, -0.84, 2.8), S(8.0, 0.62, 0.55, 0.4, -0.66, 2.8), S(10.0, 0.5, 0.45, 0.3, -0.45, 2.6), S(11.0, 0.3, 0.3, 0.2, -0.35)], lip: true },
      canopy: { z0: 2.5, z1: 6.0, w: 0.4, h: 0.62, y: 0.42, frameAt: 0.62 },
      wing: { stations: [W(0.7, -0.05, 6.4, 5.0, 0.04), W(4.45, -0.05, 9.65, 1.05, 0.04)], aileron: [0.12, 0.92, 0.74] },
      lex: { stations: [W(0.6, -0.04, 3.9, 3.2, 0.03), W(1.05, -0.04, 6.0, 1.4, 0.03)] },
      stab: { stations: [W(0.75, -0.12, 12.3, 2.3, 0.04), W(2.75, -0.46, 13.6, 0.85, 0.04)], pivot: 0.35 },
      vtails: [{ x: 0, cant: 0, stations: [W(0, 0.55, 10.4, 3.5, 0.05), W(0, 3.65, 12.95, 1.2, 0.05)], rudder: [0.08, 0.86, 0.72] }],
      ventrals: [{ x: 0.42, cant: -18, stations: [W(0, -0.45, 11.0, 1.3, 0.05), W(0, -1.0, 11.7, 0.7, 0.05)] }],
      nozzles: [{ x: 0, y: 0.03, z: 13.4, r: 0.5, len: 1.5, type: 'round' }],
      pylons: [{ x: 4.65, y: -0.08, z: 9.0, type: 'ir', rail: true }, { x: 3.55, y: -0.2, z: 8.6, type: 'ir' }, { x: 2.55, y: -0.25, z: 8.0, type: 'radar' }],
      tanks: [],
      gear: { nose: { z: 5.1, y: -0.95, len: 1.35 }, main: { z: 8.9, x: 1.18, y: -0.75, len: 1.5 } },
      pilotEye: { y: 0.95, z: 3.75 },
      gun: { x: -0.65, y: 0.3, z: 5.0 },
      lights: { wingtip: 4.45, tail: [0, 3.5, 13.3] },
    },
  },

  fa18: {
    id: 'fa18',
    name: 'F/A-18E Super Hornet',
    role: 'Carrier strike fighter',
    description: 'Big leading-edge extensions give it outstanding high-alpha handling. Slower than the rest, but carries the heaviest missile load.',
    unlock: 2,
    stats: { speed: 0.62, agility: 0.8, firepower: 0.85, armor: 0.75 },
    flight: {
      mass: 20500, wingArea: 46.5, thrustDry: 124, thrustAB: 196, cd0: 0.022, k: 0.105,
      clAlpha: 4.4, maxAoA: 35, maxG: 7.6, pitchRate: 24, rollRate: 220, yawRate: 20, maxMach: 1.8,
    },
    weapons: { gunAmmo: 570, missiles: 10, flares: 40, gunRate: 100, gunDamage: 6 },
    health: 130,
    livery: { base: '#9aa2aa', belly: '#a9b0b6', camo: [{ color: '#8a929b', count: 20, size: 90, type: 'blob' }], panelAlpha: 0.3, seed: 23, weather: 1.2 },
    insignia: 'star', tailCode: 'NE',
    design: {
      length: 18.3, cg: 10.4,
      fuselage: [
        ...NOSE(3.4, 0.56, 0.56, 0.5, 0.0, -0.04),
        S(5.0, 0.7, 0.62, 0.58, 0.0, 2.4), S(7.0, 0.95, 0.6, 0.6, 0.0, 3), S(9.0, 1.3, 0.62, 0.62, -0.05, 3.4),
        S(12.5, 1.35, 0.62, 0.6, -0.05, 3.4), S(15.0, 1.2, 0.58, 0.55, 0.0, 3), S(16.9, 1.05, 0.52, 0.5, 0.0, 2.6),
      ],
      spine: [S(5.6, 0.25, 0.68, 0.1, 0.3), S(7.0, 0.4, 0.66, 0.1, 0.3), S(11, 0.42, 0.6, 0.1, 0.35), S(14.5, 0.2, 0.4, 0.1, 0.3)],
      sideIntakes: { x: 1.05, sections: [S(7.4, 0.42, 0.48, 0.5, -0.35, 3.5), S(8.8, 0.46, 0.5, 0.5, -0.35, 3.5), S(11.0, 0.4, 0.45, 0.45, -0.3, 3)] },
      canopy: { z0: 3.3, z1: 6.9, w: 0.44, h: 0.65, y: 0.5, frameAt: 0.6 },
      wing: { stations: [W(1.3, 0.05, 9.3, 4.9, 0.045), W(6.8, -0.15, 11.9, 1.7, 0.04)], aileron: [0.55, 0.95, 0.72], flap: [0.08, 0.5, 0.72] },
      lex: { stations: [W(0.65, 0.0, 4.2, 5.4, 0.03), W(1.4, 0.03, 8.6, 1.3, 0.03)] },
      stab: { stations: [W(1.1, -0.05, 14.7, 2.9, 0.04), W(3.5, -0.05, 16.5, 1.2, 0.04)], pivot: 0.35 },
      vtails: [
        { x: 1.05, cant: 20, stations: [W(0, 0.45, 11.2, 3.4, 0.05), W(0, 3.25, 13.3, 1.35, 0.05)], rudder: [0.08, 0.88, 0.7] },
        { x: -1.05, cant: -20, stations: [W(0, 0.45, 11.2, 3.4, 0.05), W(0, 3.25, 13.3, 1.35, 0.05)], rudder: [0.08, 0.88, 0.7] },
      ],
      ventrals: [],
      nozzles: [{ x: 0.55, y: 0.0, z: 16.8, r: 0.48, len: 1.5, type: 'round' }, { x: -0.55, y: 0.0, z: 16.8, r: 0.48, len: 1.5, type: 'round' }],
      pylons: [{ x: 6.85, y: -0.15, z: 11.6, type: 'ir', rail: true }, { x: 5.3, y: -0.4, z: 10.6, type: 'radar' }, { x: 4.0, y: -0.4, z: 10.2, type: 'radar' }, { x: 2.7, y: -0.4, z: 9.8, type: 'radar' }, { x: 1.2, y: -0.75, z: 10.2, type: 'radar', body: true }],
      gear: { nose: { z: 4.0, y: -0.6, len: 1.8 }, main: { z: 11.6, x: 1.6, y: -0.6, len: 1.6 } },
      pilotEye: { y: 1.0, z: 4.6 },
      gun: { x: 0, y: 0.35, z: 0.9 },
      lights: { wingtip: 6.8, tail: [1.6, 3.2, 13.6] },
    },
  },

  typhoon: {
    id: 'typhoon',
    name: 'Eurofighter Typhoon',
    role: 'Air superiority',
    description: 'Canard-delta with a phenomenal thrust-to-weight ratio. Supercruises, out-climbs everything and turns hard at high altitude.',
    unlock: 4,
    stats: { speed: 0.88, agility: 0.88, firepower: 0.7, armor: 0.6 },
    flight: {
      mass: 15500, wingArea: 51.2, thrustDry: 120, thrustAB: 180, cd0: 0.018, k: 0.12,
      clAlpha: 3.9, maxAoA: 28, maxG: 9, pitchRate: 28, rollRate: 260, yawRate: 18, maxMach: 2.0,
    },
    weapons: { gunAmmo: 150, missiles: 8, flares: 32, gunRate: 28, gunDamage: 14 },
    health: 110,
    livery: { base: '#a2a9b0', belly: '#b0b6bb', camo: [{ color: '#959ca4', count: 18, size: 110, type: 'blob' }], panelAlpha: 0.28, seed: 31, weather: 0.8 },
    insignia: 'roundel', tailCode: 'EF',
    design: {
      length: 15.96, cg: 9.6,
      fuselage: [
        ...NOSE(3.2, 0.55, 0.52, 0.5, 0.0, 0.0),
        S(4.8, 0.66, 0.58, 0.6, 0.0, 2.6), S(6.8, 0.82, 0.62, 0.62, 0.0, 3.0), S(9.0, 1.0, 0.62, 0.6, 0.0, 3.2),
        S(12.5, 1.02, 0.6, 0.58, 0.0, 3.0), S(14.8, 0.92, 0.52, 0.5, 0.0, 2.8),
      ],
      spine: [S(5.2, 0.25, 0.66, 0.1, 0.3), S(6.5, 0.38, 0.62, 0.1, 0.3), S(10.0, 0.4, 0.56, 0.1, 0.32), S(13.5, 0.2, 0.4, 0.1, 0.3)],
      intake: { sections: [S(5.2, 0.85, 0.32, 0.5, -0.9, 3.6, 2.2), S(6.4, 0.88, 0.36, 0.5, -0.88, 3.6, 2.4), S(9.0, 0.9, 0.4, 0.42, -0.65, 3.4), S(11.0, 0.7, 0.3, 0.2, -0.45, 3)], lip: true },
      canopy: { z0: 2.9, z1: 6.2, w: 0.42, h: 0.62, y: 0.46, frameAt: 0.6 },
      canard: { stations: [W(0.62, 0.1, 4.7, 1.7, 0.04), W(2.1, 0.1, 6.15, 0.7, 0.04)], pivot: 0.4 },
      wing: { stations: [W(0.9, -0.15, 7.2, 8.0, 0.04), W(5.47, -0.15, 13.4, 1.25, 0.035)], aileron: [0.1, 0.95, 0.82] },
      vtails: [{ x: 0, cant: 0, stations: [W(0, 0.55, 10.3, 4.4, 0.05), W(0, 3.85, 14.0, 1.3, 0.05)], rudder: [0.1, 0.8, 0.75] }],
      ventrals: [],
      nozzles: [{ x: 0.46, y: -0.02, z: 14.6, r: 0.45, len: 1.4, type: 'round' }, { x: -0.46, y: -0.02, z: 14.6, r: 0.45, len: 1.4, type: 'round' }],
      pylons: [{ x: 5.5, y: -0.25, z: 12.8, type: 'ir', pod: true }, { x: 4.2, y: -0.4, z: 11.2, type: 'radar' }, { x: 3.0, y: -0.45, z: 10.2, type: 'radar' }, { x: 0.75, y: -0.95, z: 9.6, type: 'radar', body: true }],
      gear: { nose: { z: 4.5, y: -1.0, len: 1.25 }, main: { z: 10.8, x: 1.5, y: -0.55, len: 1.5 } },
      pilotEye: { y: 1.0, z: 4.2 },
      gun: { x: 0.85, y: -0.3, z: 7.0 },
      lights: { wingtip: 5.4, tail: [0, 3.8, 14.2] },
    },
  },

  mig29: {
    id: 'mig29',
    name: 'MiG-29 Fulcrum',
    role: 'Frontline fighter',
    description: 'A rugged dogfighter with brutal low-speed handling and a quick-pointing nose. Short legs, sharp teeth.',
    unlock: 3,
    stats: { speed: 0.8, agility: 0.9, firepower: 0.6, armor: 0.65 },
    flight: {
      mass: 14800, wingArea: 38.0, thrustDry: 100, thrustAB: 162, cd0: 0.02, k: 0.11,
      clAlpha: 4.4, maxAoA: 30, maxG: 9, pitchRate: 28, rollRate: 250, yawRate: 20, maxMach: 2.25,
    },
    weapons: { gunAmmo: 150, missiles: 6, flares: 30, gunRate: 25, gunDamage: 16 },
    health: 110,
    livery: { base: '#8e9a92', belly: '#b9c2c6', camo: [{ color: '#6f7f74', count: 26, size: 100, type: 'blob' }, { color: '#a7aea2', count: 16, size: 70, type: 'blob' }], panelAlpha: 0.35, seed: 47, weather: 1.4 },
    insignia: 'redstar', tailCode: '29',
    design: {
      length: 17.3, cg: 10.0,
      fuselage: [
        ...NOSE(3.6, 0.52, 0.52, 0.48, 0.0, -0.18),
        S(5.4, 0.66, 0.66, 0.5, 0.05, 2.4), S(7.4, 0.9, 0.64, 0.45, 0.05, 3), S(9.5, 1.15, 0.52, 0.38, 0.05, 3.6),
        S(13.0, 1.1, 0.5, 0.36, 0.05, 3.4), S(15.6, 0.7, 0.38, 0.3, 0.05, 3), S(17.0, 0.25, 0.2, 0.15, 0.05),
      ],
      spine: [S(6.0, 0.28, 0.8, 0.1, 0.3), S(7.5, 0.45, 0.78, 0.1, 0.3), S(11.0, 0.5, 0.62, 0.1, 0.3), S(14.0, 0.2, 0.38, 0.1, 0.3)],
      nacelles: { x: 1.05, sections: [S(7.6, 0.5, 0.45, 0.42, -0.6, 4), S(9.0, 0.52, 0.5, 0.48, -0.55, 3.4), S(12.5, 0.55, 0.52, 0.5, -0.45, 2.6), S(15.6, 0.5, 0.48, 0.48, -0.35, 2.2)], open: true },
      canopy: { z0: 3.6, z1: 6.9, w: 0.42, h: 0.66, y: 0.52, frameAt: 0.58 },
      wing: { stations: [W(1.4, 0.05, 9.6, 4.9, 0.045), W(5.7, -0.05, 12.6, 1.3, 0.04)], aileron: [0.5, 0.95, 0.74], flap: [0.08, 0.48, 0.74] },
      lex: { stations: [W(0.75, 0.05, 5.2, 5.0, 0.03), W(1.6, 0.05, 9.0, 1.5, 0.03)] },
      stab: { stations: [W(1.4, -0.25, 13.6, 2.9, 0.04), W(3.9, -0.3, 15.6, 1.1, 0.04)], pivot: 0.35 },
      vtails: [
        { x: 1.45, cant: 7, stations: [W(0, 0.25, 11.6, 3.3, 0.05), W(0, 3.1, 14.0, 1.2, 0.05)], rudder: [0.08, 0.85, 0.72] },
        { x: -1.45, cant: -7, stations: [W(0, 0.25, 11.6, 3.3, 0.05), W(0, 3.1, 14.0, 1.2, 0.05)], rudder: [0.08, 0.85, 0.72] },
      ],
      ventrals: [],
      nozzles: [{ x: 1.05, y: -0.35, z: 15.5, r: 0.48, len: 1.6, type: 'round' }, { x: -1.05, y: -0.35, z: 15.5, r: 0.48, len: 1.6, type: 'round' }],
      pylons: [{ x: 5.0, y: -0.15, z: 11.6, type: 'ir' }, { x: 3.9, y: -0.25, z: 10.9, type: 'ir' }, { x: 2.8, y: -0.3, z: 10.3, type: 'radar' }],
      gear: { nose: { z: 4.6, y: -0.6, len: 1.6 }, main: { z: 11.0, x: 1.6, y: -0.75, len: 1.4 } },
      pilotEye: { y: 1.05, z: 4.8 },
      gun: { x: -0.95, y: 0.15, z: 7.2 },
      lights: { wingtip: 5.7, tail: [1.75, 3.0, 13.9] },
    },
  },

  su35: {
    id: 'su35',
    name: 'Su-35 Flanker-E',
    role: 'Heavy air superiority',
    description: 'Thrust-vectoring super-manoeuvrability. Can point its nose almost anywhere at low speed and carries a huge missile load.',
    unlock: 6,
    stats: { speed: 0.86, agility: 0.95, firepower: 0.92, armor: 0.85 },
    flight: {
      mass: 25000, wingArea: 62.0, thrustDry: 172, thrustAB: 284, cd0: 0.021, k: 0.1,
      clAlpha: 4.5, maxAoA: 45, maxG: 9, pitchRate: 32, rollRate: 240, yawRate: 24, maxMach: 2.25, tvc: true,
    },
    weapons: { gunAmmo: 150, missiles: 12, flares: 48, gunRate: 25, gunDamage: 16 },
    health: 150,
    livery: { base: '#9db0c0', belly: '#c7d2dc', camo: [{ color: '#6f8aa6', count: 34, size: 120, type: 'splinter' }, { color: '#bfcbd6', count: 26, size: 90, type: 'splinter' }], panelAlpha: 0.32, seed: 59, weather: 1 },
    insignia: 'redstar', tailCode: '35',
    design: {
      length: 21.9, cg: 12.4,
      fuselage: [
        ...NOSE(4.2, 0.6, 0.6, 0.56, 0.0, -0.22),
        S(6.2, 0.78, 0.72, 0.55, 0.1, 2.4), S(8.4, 1.15, 0.7, 0.42, 0.15, 3.2), S(10.5, 1.85, 0.55, 0.32, 0.12, 4.2),
        S(15.0, 1.95, 0.5, 0.3, 0.1, 4.2), S(18.5, 1.1, 0.4, 0.3, 0.1, 3.4), S(21.0, 0.35, 0.25, 0.2, 0.1, 2.4), S(21.9, 0.15, 0.12, 0.1, 0.1),
      ],
      spine: [S(6.6, 0.3, 0.92, 0.1, 0.4), S(8.2, 0.55, 0.85, 0.1, 0.4), S(12, 0.6, 0.64, 0.1, 0.38), S(16, 0.3, 0.45, 0.1, 0.35)],
      nacelles: { x: 1.3, sections: [S(9.0, 0.58, 0.55, 0.5, -0.75, 4), S(10.5, 0.62, 0.6, 0.56, -0.7, 3.4), S(15.0, 0.66, 0.62, 0.6, -0.55, 2.6), S(19.3, 0.6, 0.55, 0.55, -0.45, 2.2)], open: true },
      canopy: { z0: 4.4, z1: 8.4, w: 0.48, h: 0.75, y: 0.62, frameAt: 0.56 },
      canard: { stations: [W(1.0, 0.15, 7.6, 1.8, 0.04), W(3.0, 0.15, 8.9, 0.8, 0.04)], pivot: 0.4 },
      wing: { stations: [W(1.9, 0.08, 11.2, 5.4, 0.045), W(7.6, 0.0, 15.6, 1.4, 0.04)], aileron: [0.55, 0.92, 0.74], flap: [0.08, 0.52, 0.74] },
      lex: { stations: [W(0.9, 0.1, 6.6, 6.2, 0.03), W(2.0, 0.08, 11.4, 1.0, 0.03)] },
      stab: { stations: [W(2.0, -0.35, 18.0, 3.4, 0.04), W(4.5, -0.35, 20.3, 1.3, 0.04)], pivot: 0.35 },
      vtails: [
        { x: 2.05, cant: 0, stations: [W(0, 0.25, 14.4, 3.8, 0.05), W(0, 3.95, 17.4, 1.35, 0.05)], rudder: [0.08, 0.88, 0.72] },
        { x: -2.05, cant: 0, stations: [W(0, 0.25, 14.4, 3.8, 0.05), W(0, 3.95, 17.4, 1.35, 0.05)], rudder: [0.08, 0.88, 0.72] },
      ],
      ventrals: [{ x: 1.5, cant: -10, stations: [W(0, -0.85, 15.5, 1.7, 0.05), W(0, -1.5, 16.6, 0.8, 0.05)] }],
      nozzles: [{ x: 1.3, y: -0.45, z: 19.2, r: 0.58, len: 1.9, type: 'round' }, { x: -1.3, y: -0.45, z: 19.2, r: 0.58, len: 1.9, type: 'round' }],
      pylons: [{ x: 7.65, y: 0.0, z: 15.2, type: 'ir', rail: true }, { x: 6.2, y: -0.25, z: 14.2, type: 'ir' }, { x: 4.9, y: -0.3, z: 13.4, type: 'radar' }, { x: 3.6, y: -0.3, z: 12.6, type: 'radar' }, { x: 1.3, y: -1.3, z: 12.0, type: 'radar', body: true }],
      gear: { nose: { z: 5.4, y: -0.7, len: 1.9 }, main: { z: 13.6, x: 2.1, y: -0.9, len: 1.7 } },
      pilotEye: { y: 1.25, z: 5.9 },
      gun: { x: 1.0, y: 0.25, z: 7.8 },
      lights: { wingtip: 7.6, tail: [2.05, 4.0, 17.2] },
    },
  },

  f22: {
    id: 'f22',
    name: 'F-22A Raptor',
    role: 'Stealth air dominance',
    description: 'Fifth-generation stealth fighter with supercruise and thrust vectoring. The ultimate dogfighter — earned, not given.',
    unlock: 9,
    stats: { speed: 0.97, agility: 0.97, firepower: 0.85, armor: 0.8 },
    flight: {
      mass: 29000, wingArea: 78.0, thrustDry: 232, thrustAB: 312, cd0: 0.017, k: 0.1,
      clAlpha: 4.2, maxAoA: 50, maxG: 9.2, pitchRate: 32, rollRate: 260, yawRate: 24, maxMach: 2.25, tvc: true,
    },
    weapons: { gunAmmo: 480, missiles: 8, flares: 40, gunRate: 100, gunDamage: 6 },
    health: 140,
    livery: { base: '#7f858c', belly: '#868c93', camo: [{ color: '#6f757c', count: 30, size: 120, type: 'splinter' }, { color: '#8d939a', count: 20, size: 90, type: 'splinter' }], panelAlpha: 0.22, seed: 71, weather: 0.6 },
    insignia: 'star', tailCode: 'FF', goldCanopy: true,
    design: {
      length: 18.9, cg: 11.2,
      fuselage: [
        ...NOSE(4.0, 0.82, 0.56, 0.38, 0.0, -0.05, 1.6, 1.4),
        S(6.4, 1.1, 0.62, 0.44, 0.05, 2.0, 1.7), S(8.6, 1.85, 0.6, 0.45, 0.05, 3.2, 2.6), S(12.5, 1.95, 0.6, 0.45, 0.05, 3.8, 3.2),
        S(15.5, 1.6, 0.52, 0.45, 0.05, 3.6, 3.2), S(17.4, 1.2, 0.42, 0.4, 0.05, 3.4, 3.2),
      ],
      spine: [S(6.2, 0.3, 0.75, 0.1, 0.35), S(8.0, 0.55, 0.7, 0.1, 0.35), S(12.0, 0.7, 0.62, 0.1, 0.32), S(15.0, 0.4, 0.45, 0.1, 0.3)],
      sideIntakes: { x: 1.25, sections: [S(6.4, 0.42, 0.5, 0.48, -0.1, 1.6), S(7.6, 0.48, 0.55, 0.5, -0.12, 2), S(10.5, 0.4, 0.45, 0.45, -0.1, 2.4)] },
      canopy: { z0: 2.6, z1: 7.4, w: 0.48, h: 0.68, y: 0.48, frameAt: -1 },
      wing: { stations: [W(1.6, 0.0, 8.6, 7.6, 0.04), W(6.78, -0.1, 13.5, 1.5, 0.035)], aileron: [0.55, 0.95, 0.8], flap: [0.08, 0.52, 0.8] },
      stab: { stations: [W(1.6, -0.02, 15.4, 3.4, 0.04), W(4.3, -0.02, 18.0, 1.0, 0.035)], pivot: 0.35 },
      vtails: [
        { x: 1.55, cant: 28, stations: [W(0, 0.45, 12.4, 4.0, 0.05), W(0, 3.15, 14.0, 1.7, 0.05)], rudder: [0.08, 0.92, 0.7] },
        { x: -1.55, cant: -28, stations: [W(0, 0.45, 12.4, 4.0, 0.05), W(0, 3.15, 14.0, 1.7, 0.05)], rudder: [0.08, 0.92, 0.7] },
      ],
      ventrals: [],
      nozzles: [{ x: 0.65, y: 0.02, z: 17.2, r: 0.5, len: 1.6, type: '2d' }, { x: -0.65, y: 0.02, z: 17.2, r: 0.5, len: 1.6, type: '2d' }],
      pylons: [{ x: 0.9, y: -0.55, z: 9.5, type: 'radar', internal: true }, { x: 1.4, y: -0.5, z: 10.5, type: 'radar', internal: true }, { x: 1.4, y: -0.25, z: 8.0, type: 'ir', internal: true }, { x: 0.4, y: -0.55, z: 11.0, type: 'radar', internal: true }],
      gear: { nose: { z: 3.8, y: -0.4, len: 1.9 }, main: { z: 12.6, x: 1.6, y: -0.5, len: 1.7 } },
      pilotEye: { y: 1.0, z: 4.6 },
      gun: { x: 1.3, y: 0.35, z: 7.2 },
      lights: { wingtip: 6.75, tail: [2.6, 3.4, 14.5] },
    },
  },
};

export const JET_ORDER = ['f16', 'fa18', 'mig29', 'typhoon', 'su35', 'f22'];

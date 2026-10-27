// Bombers and special aircraft: stealth flying wing, swing-wing supersonic
// bombers, the Stratofortress, the Blackbird and the Nighthawk. Same design
// format as jets.js, plus `bays` (weapons-bay doors), `bodies` (extra closed
// lofts), `spikes` (inlet cones), `faceted` (flat-shaded stealth skin),
// 'slot' nozzles (shielded exhausts) and `wing.elevon` (pitch mixed into the
// ailerons on tailless aircraft). Flight data follow the real aircraft:
// weights, wing areas, thrust, Mach and g limits (`maxIas` is a structural
// airspeed limit, `incidence` the wing setting angle, `ramK` the extra thrust
// a turbo-ramjet gains past Mach 1.4).
import { S, W, NOSE } from './designHelpers.js';

const BOMBS = (n, name, short) => ({ gunAmmo: 0, missiles: 0, bombs: n, bombName: name, bombShort: short, gunRate: 1, gunDamage: 0 });

export const HEAVIES = {
  b2: {
    id: 'b2',
    name: 'B-2A Spirit',
    role: 'Stealth strategic bomber',
    category: 'bomber',
    description: 'A 52-metre flying wing with no tail at all: four buried turbofans, exhausts hidden on top of the wing and a radar signature the size of a bird. Slow, smooth and devastating — sixteen 2,000 lb JDAMs in two internal bays.',
    unlock: 14,
    stealth: 0.12,
    stats: { speed: 0.42, agility: 0.2, firepower: 1.0, armor: 0.72 },
    flight: {
      brakes: { mu: 0.46, heatCap: 4.8 },
      mass: 120000, wingArea: 478, thrustDry: 308, thrustAB: 308, noAB: true, cd0: 0.0095, k: 0.065, waveDrag: 2.5,
      clAlpha: 4.0, maxAoA: 16, maxG: 2.5, pitchRate: 9, rollRate: 45, yawRate: 6, maxMach: 0.95, ceiling: 15200,
    },
    weapons: { ...BOMBS(16, 'GBU-31 JDAM', 'JDAM'), flares: 0 },
    health: 260,
    livery: { base: '#3d4248', belly: '#3a3f45', camo: [{ color: '#43484e', count: 22, size: 170, type: 'splinter' }], panelAlpha: 0.12, seed: 301, weather: 0.35, finish: 'ram' },
    insignia: 'star', tailCode: '', goldCanopy: true,
    design: {
      length: 21.0, cg: 9.0,
      // blended centre body over the wing root: cockpit hump forward, beaver tail aft
      fuselage: [
        S(0.0, 0.05, 0.03, 0.03, 0), S(1.2, 1.1, 0.55, 0.3, 0, 2.2, 2), S(2.8, 1.75, 1.15, 0.6, 0, 2.4, 2),
        S(4.6, 2.1, 1.75, 0.8, 0, 2.6, 2.2), S(7.0, 2.3, 1.95, 0.95, 0, 2.8, 2.4), S(10.0, 2.2, 1.8, 1.0, 0, 2.8, 2.4),
        S(14.0, 1.8, 1.3, 0.85, 0, 2.6, 2.2), S(18.0, 1.05, 0.62, 0.5, 0, 2.2, 2), S(20.8, 0.3, 0.14, 0.12, 0, 2),
      ],
      // engine humps with the intakes on top of the wing
      nacelles: {
        x: 4.4,
        sections: [S(5.6, 0.95, 0.3, 0.25, 1.3, 3, 2), S(7.0, 1.1, 0.45, 0.6, 1.25, 2.6, 2), S(10.5, 1.15, 0.5, 0.75, 1.05, 2.6, 2), S(14.0, 0.95, 0.38, 0.6, 0.8, 2.4, 2), S(16.5, 0.6, 0.15, 0.4, 0.55, 2)],
        open: true,
      },
      canopy: { z0: 2.6, z1: 5.6, w: 1.0, h: 0.35, y: 1.3, frameAt: 0.45, noTub: true },
      // sawtooth trailing edge: every edge parallel to one of two directions
      wing: {
        stations: [W(0, 0, 0, 21.0, 0.13), W(5.6, 0.05, 3.63, 13.74, 0.12), W(11.2, 0.15, 7.27, 13.73, 0.095), W(26.2, 0.65, 17.0, 1.6, 0.06)],
        aileron: [0.45, 0.97, 0.8], elevon: true,
      },
      vtails: [],
      ventrals: [],
      nozzles: [
        { x: 3.2, y: 0.42, z: 15.4, r: 0.5, len: 2.0, type: 'slot', w: 1.5, h: 0.14 },
        { x: -3.2, y: 0.42, z: 15.4, r: 0.5, len: 2.0, type: 'slot', w: 1.5, h: 0.14 },
        { x: 5.0, y: 0.36, z: 14.6, r: 0.5, len: 2.0, type: 'slot', w: 1.4, h: 0.14 },
        { x: -5.0, y: 0.36, z: 14.6, r: 0.5, len: 2.0, type: 'slot', w: 1.4, h: 0.14 },
      ],
      bays: [{ x: 1.0, y: -1.17, z0: 7.2, z1: 12.4, w: 1.5 }],
      pylons: [{ x: 1.0, y: -0.75, z: 9.8, type: 'bomb', internal: true }],
      gear: { nose: { z: 4.4, y: -1.25, len: 1.6, r: 0.45, twin: true }, main: { z: 10.8, x: 6.0, y: -0.7, len: 2.0, r: 0.55, axles: 2, pitch: 1.3 } },
      pilotEye: { x: -0.55, y: 1.45, z: 4.4 },
      gun: { x: 0, y: 0, z: 0 },
      lights: { wingtip: 26.2, tail: [0, 0.2, 20.7] },
    },
  },

  b1b: {
    id: 'b1b',
    name: 'B-1B Lancer',
    role: 'Supersonic swing-wing bomber',
    category: 'bomber',
    description: 'The "Bone": variable-sweep wings that fold from 15° to 67.5°, four afterburning F101s and a blended body. Dashes at Mach 1.25 up high and runs at 600 knots down low with 24 JDAMs in three bays.',
    unlock: 11,
    stealth: 0.5,
    stats: { speed: 0.66, agility: 0.32, firepower: 1.0, armor: 0.8 },
    flight: {
      brakes: { mu: 0.46, heatCap: 4.6 },
      mass: 150000, wingArea: 181, thrustDry: 260, thrustAB: 548, cd0: 0.015, k: 0.1,
      clAlpha: 4.4, maxAoA: 18, maxG: 3.0, pitchRate: 10, rollRate: 55, yawRate: 7, maxMach: 1.25, maxIas: 315, ceiling: 18000, flapCL: 0.7,
    },
    weapons: { ...BOMBS(24, 'GBU-31 JDAM', 'JDAM'), flares: 60 },
    health: 240,
    livery: { base: '#5f666e', belly: '#5b6269', camo: [{ color: '#585f67', count: 18, size: 150, type: 'blob' }], panelAlpha: 0.22, seed: 311, weather: 0.9 },
    insignia: 'star', tailCode: 'DY',
    design: {
      length: 44.5, cg: 21.0,
      fuselage: [
        ...NOSE(6.0, 1.15, 1.2, 1.1, 0, -0.25),
        S(9.0, 1.45, 1.5, 1.4, 0, 2.2), S(13.0, 1.75, 1.6, 1.55, 0, 2.4), S(17.0, 2.6, 1.7, 1.6, 0, 3.0, 2.6),
        S(24.0, 2.7, 1.75, 1.6, 0, 3.2, 2.8), S(31.0, 2.2, 1.6, 1.45, 0.1, 3.0, 2.6), S(37.0, 1.5, 1.4, 1.15, 0.25, 2.6, 2.2),
        S(41.5, 0.9, 1.05, 0.65, 0.45, 2.2), S(44.3, 0.25, 0.35, 0.18, 0.6),
      ],
      canopy: { z0: 5.6, z1: 9.4, w: 0.95, h: 0.6, y: 1.0, frameAt: 0.5, noTub: true },
      // fixed wing glove blending into the body
      lex: { stations: [W(1.6, 0.3, 11.5, 11.5, 0.03), W(6.4, 0.3, 16.6, 6.2, 0.06)] },
      wing: {
        stations: [W(6.0, 0.35, 17.0, 5.4, 0.08), W(20.9, 0.55, 21.0, 2.0, 0.07)],
        aileron: [0.55, 0.95, 0.78], flap: [0.05, 0.5, 0.76],
        sweep: { x: 6.2, z: 19.0, min: 15, max: 67.5 },
      },
      stab: { stations: [W(0.6, 2.6, 37.5, 5.0, 0.04), W(6.85, 2.6, 41.0, 1.8, 0.035)], pivot: 0.35 },
      vtails: [{ x: 0, cant: 0, stations: [W(0, 1.6, 33.0, 9.0, 0.05), W(0, 8.8, 40.0, 3.5, 0.05)], rudder: [0.08, 0.9, 0.7] }],
      ventrals: [],
      nacelleBoxes: [{ x0: 2.4, x1: 5.2, top: -0.7, bottom: -2.6, z0: 21.5, z1: 33.2 }],
      nozzles: [
        { x: 3.1, y: -1.65, z: 33.0, r: 0.56, len: 1.5, type: 'round' }, { x: -3.1, y: -1.65, z: 33.0, r: 0.56, len: 1.5, type: 'round' },
        { x: 4.5, y: -1.65, z: 33.0, r: 0.56, len: 1.5, type: 'round' }, { x: -4.5, y: -1.65, z: 33.0, r: 0.56, len: 1.5, type: 'round' },
      ],
      bays: [{ x: 0, y: -1.6, z0: 12.5, z1: 17.5, w: 1.8 }, { x: 0, y: -1.55, z0: 25.0, z1: 31.0, w: 1.8 }],
      pylons: [{ x: 0.4, y: -1.0, z: 15.0, type: 'bomb', internal: true }, { x: 0.4, y: -1.0, z: 28.0, type: 'bomb', internal: true }],
      gear: { nose: { z: 8.0, y: -1.3, len: 2.3, r: 0.48, twin: true }, main: { z: 22.5, x: 1.25, y: -1.5, len: 2.2, r: 0.6, axles: 2, pitch: 1.4 } },
      pilotEye: { x: -0.55, y: 1.55, z: 7.3 },
      gun: { x: 0, y: 0, z: 0 },
      lights: { wingtip: 20.9, tail: [0, 8.8, 43.5] },
    },
  },

  b52: {
    id: 'b52',
    name: 'B-52H Stratofortress',
    role: 'Strategic heavy bomber',
    category: 'bomber',
    description: 'BUFF: eight TF33 turbofans in four twin pods, a 56-metre wing that droops on the ground and flexes up in flight, bicycle landing gear with wingtip outriggers. Its wing is set at +6°, so it lifts off almost flat and cruises nose-down.',
    unlock: 10,
    stealth: 1.4,
    stats: { speed: 0.4, agility: 0.12, firepower: 1.0, armor: 0.9 },
    flight: {
      brakes: { mu: 0.46, heatCap: 4.6, chute: 50, chuteSingle: true },
      mass: 160000, wingArea: 370, thrustDry: 608, thrustAB: 608, noAB: true, cd0: 0.019, k: 0.049, waveDrag: 3,
      clAlpha: 5.0, maxAoA: 14, maxG: 2.0, pitchRate: 6, rollRate: 25, yawRate: 4, maxMach: 0.86, incidence: 6, flapCL: 0.5, ceiling: 15000,
    },
    weapons: { ...BOMBS(20, 'GBU-31 JDAM', 'JDAM'), flares: 60 },
    health: 320,
    livery: { base: '#6e7479', belly: '#6a7075', camo: [{ color: '#666c71', count: 20, size: 140, type: 'blob' }], panelAlpha: 0.3, seed: 321, weather: 1.4 },
    insignia: 'star', tailCode: 'LA',
    design: {
      length: 48.5, cg: 22.0,
      fuselage: [
        ...NOSE(6.5, 1.45, 1.6, 1.7, 0, -0.35, 2.2, 2.4),
        S(10.0, 1.55, 1.95, 1.9, 0, 2.6), S(36.0, 1.55, 1.95, 1.9, 0, 2.6), S(41.0, 1.25, 1.75, 1.5, 0.2, 2.4),
        S(45.5, 0.8, 1.3, 0.9, 0.5, 2.2), S(48.3, 0.3, 0.6, 0.35, 0.8, 2),
      ],
      canopy: { z0: 4.0, z1: 7.8, w: 1.1, h: 0.55, y: 1.2, frameAt: 0.4, noTub: true },
      // shoulder wing with anhedral at rest
      wing: {
        stations: [W(1.5, 1.6, 15.0, 12.0, 0.12), W(10.5, 1.4, 21.8, 7.8, 0.11), W(28.2, 0.9, 35.1, 3.6, 0.09)],
        aileron: [0.62, 0.92, 0.78], flap: [0.05, 0.55, 0.75],
      },
      stab: { stations: [W(1.0, 0.6, 41.0, 6.0, 0.04), W(8.4, 0.6, 45.0, 2.4, 0.035)], elevator: [0.05, 0.95, 0.7] },
      vtails: [{ x: 0, cant: 0, stations: [W(0, 1.9, 36.0, 10.0, 0.05), W(0, 10.4, 44.0, 4.0, 0.05)], rudder: [0.05, 0.95, 0.75] }],
      ventrals: [],
      nozzles: [],
      // four pylons, each with two TF33s side by side
      pods: [
        { x: 9.3, y: -0.35, z: 18.3, r: 0.62, len: 4.6, pylon: { x: 10.0, y: 1.0 } },
        { x: 10.75, y: -0.35, z: 18.3, r: 0.62, len: 4.6, pylon: { x: 10.0, y: 1.0 } },
        { x: 17.9, y: -0.45, z: 24.8, r: 0.62, len: 4.6, pylon: { x: 18.6, y: 0.9 } },
        { x: 19.35, y: -0.45, z: 24.8, r: 0.62, len: 4.6, pylon: { x: 18.6, y: 0.9 } },
      ],
      bays: [{ x: 0, y: -1.9, z0: 17.0, z1: 25.5, w: 2.2 }],
      pylons: [{ x: 0.5, y: -1.2, z: 20.5, type: 'bomb', internal: true }],
      // bicycle gear: front and rear trucks on the centre line, outriggers near the tips
      gear: {
        nose: { z: 12.5, y: -1.7, len: 1.6, r: 0.55, twin: true, axles: 2, pitch: 1.4 },
        main: { z: 28.0, x: 1.1, y: -1.6, len: 1.7, r: 0.55, axles: 2, pitch: 1.4 },
        body: { z: 33.5, x: 23.5, y: 0.95, len: 4.0, r: 0.3 },
      },
      pilotEye: { x: -0.55, y: 1.75, z: 6.0 },
      gun: { x: 0, y: 0, z: 0 },
      lights: { wingtip: 28.2, tail: [0, 10.4, 47.5] },
    },
  },

  tu160: {
    id: 'tu160',
    name: 'Tu-160 Blackjack',
    role: 'Supersonic strategic bomber',
    category: 'bomber',
    description: 'The "White Swan", the largest and heaviest combat aircraft ever to fly faster than sound: four NK-32 engines with 980 kN of reheat, wings that sweep from 20° to 65° and two 11-metre weapons bays. Mach 2 at altitude.',
    unlock: 13,
    stealth: 1.1,
    stats: { speed: 0.82, agility: 0.24, firepower: 1.0, armor: 0.85 },
    flight: {
      brakes: { mu: 0.46, heatCap: 4.6, chute: 60 },
      mass: 200000, wingArea: 293, thrustDry: 549, thrustAB: 980, cd0: 0.0102, k: 0.11,
      clAlpha: 4.6, maxAoA: 16, maxG: 2.0, pitchRate: 8, rollRate: 40, yawRate: 5, maxMach: 2.05, maxIas: 335, ceiling: 16000, flapCL: 0.6,
    },
    weapons: { ...BOMBS(24, 'KAB-500S guided bombs', 'KAB-500S'), flares: 72 },
    health: 300,
    livery: { base: '#e3e6e9', belly: '#dde1e5', camo: [], panelAlpha: 0.3, seed: 331, weather: 0.9 },
    insignia: 'redstar', tailCode: '18',
    design: {
      length: 54.1, cg: 26.0,
      fuselage: [
        ...NOSE(7.0, 1.35, 1.35, 1.3, 0, -0.25),
        S(11.0, 1.6, 1.7, 1.55, 0, 2.2), S(18.0, 2.4, 1.75, 1.55, 0, 3.0, 2.6), S(28.0, 2.6, 1.7, 1.55, 0, 3.2, 2.8),
        S(38.0, 2.1, 1.55, 1.35, 0.1, 3.0, 2.6), S(46.0, 1.4, 1.35, 1.0, 0.3, 2.6, 2.2), S(51.5, 0.7, 0.9, 0.5, 0.6, 2.2), S(54.0, 0.2, 0.3, 0.15, 0.8),
      ],
      canopy: { z0: 7.6, z1: 11.6, w: 1.0, h: 0.6, y: 1.1, frameAt: 0.45, noTub: true },
      lex: { stations: [W(1.6, 0.35, 11.0, 24.0, 0.035), W(9.9, 0.35, 21.0, 8.0, 0.06)] },
      wing: {
        stations: [W(9.4, 0.35, 22.0, 6.2, 0.1), W(27.85, 0.1, 28.7, 2.4, 0.08)],
        aileron: [0.55, 0.95, 0.76], flap: [0.05, 0.5, 0.74],
        sweep: { x: 9.6, z: 24.0, min: 20, max: 65 },
      },
      stab: { stations: [W(0.8, 4.0, 45.0, 6.0, 0.04), W(6.6, 4.0, 49.5, 2.2, 0.035)], pivot: 0.35 },
      vtails: [{ x: 0, cant: 0, stations: [W(0, 1.6, 40.0, 11.0, 0.05), W(0, 11.5, 48.5, 4.5, 0.05)], rudder: [0.08, 0.92, 0.72] }],
      ventrals: [],
      nacelleBoxes: [{ x0: 3.9, x1: 7.6, top: -0.6, bottom: -2.5, z0: 24.5, z1: 40.0 }],
      nozzles: [
        { x: 4.85, y: -1.55, z: 40.0, r: 0.75, len: 1.8, type: 'round' }, { x: -4.85, y: -1.55, z: 40.0, r: 0.75, len: 1.8, type: 'round' },
        { x: 6.65, y: -1.55, z: 40.0, r: 0.75, len: 1.8, type: 'round' }, { x: -6.65, y: -1.55, z: 40.0, r: 0.75, len: 1.8, type: 'round' },
      ],
      bays: [{ x: 0, y: -1.55, z0: 15.0, z1: 25.0, w: 1.9 }, { x: 0, y: -1.5, z0: 31.5, z1: 39.0, w: 1.9 }],
      pylons: [{ x: 0.45, y: -0.9, z: 20.0, type: 'bomb', internal: true }, { x: 0.45, y: -0.9, z: 35.0, type: 'bomb', internal: true }],
      gear: { nose: { z: 12.5, y: -1.5, len: 2.6, r: 0.55, twin: true }, main: { z: 30.0, x: 2.8, y: -1.4, len: 2.65, r: 0.6, axles: 3, pitch: 1.35 } },
      pilotEye: { x: -0.55, y: 1.7, z: 9.6 },
      gun: { x: 0, y: 0, z: 0 },
      lights: { wingtip: 27.85, tail: [0, 11.5, 53.0] },
    },
  },

  sr71: {
    id: 'sr71',
    name: 'SR-71A Blackbird',
    role: 'Mach 3 strategic reconnaissance',
    category: 'recon',
    description: 'Titanium, black and the fastest air-breathing jet ever flown. The J58s act more and more like ramjets as the speed climbs, so it is slow-witted down low (450-knot structural limit) and only comes alive above 20 km: climb high, light the burners and run at Mach 3.2. Unarmed: outrun everything.',
    unlock: 9,
    unarmed: true,
    stealth: 0.7,
    stats: { speed: 1.0, agility: 0.32, firepower: 0, armor: 0.5 },
    flight: {
      brakes: { chute: 38 },
      mass: 45000, wingArea: 170, thrustDry: 190, thrustAB: 302, cd0: 0.010, k: 0.17,
      clAlpha: 2.9, maxAoA: 18, maxG: 3.0, pitchRate: 10, rollRate: 70, yawRate: 6, maxMach: 3.3, maxIas: 232, ramK: 2.0, ramMach: 3.3, ceiling: 25900,
    },
    weapons: { gunAmmo: 0, missiles: 0, flares: 0, gunRate: 1, gunDamage: 0 },
    health: 140,
    livery: { base: '#18191c', belly: '#16171a', camo: [{ color: '#1e2024', count: 30, size: 140, type: 'splinter' }], panelAlpha: 0.2, seed: 351, weather: 0.5, finish: 'ram' },
    insignia: 'star', tailCode: '972',
    design: {
      length: 32.7, cg: 18.0,
      // the chines: a lens-shaped section with sharp edges right from the nose
      fuselage: [
        ...NOSE(4.0, 0.9, 0.35, 0.28, 0, -0.1, 1.4, 1.4),
        S(7.0, 1.6, 0.6, 0.45, 0, 1.4, 1.5), S(10.0, 2.0, 0.85, 0.55, 0, 1.5, 1.6), S(14.0, 2.3, 0.85, 0.55, 0, 1.6, 1.6),
        S(18.0, 2.5, 0.8, 0.55, 0, 1.6, 1.6), S(24.0, 2.2, 0.75, 0.5, 0, 1.6, 1.6), S(29.0, 1.4, 0.6, 0.45, 0.05, 1.7, 1.7), S(32.6, 0.4, 0.25, 0.2, 0.1, 2),
      ],
      canopy: { z0: 7.6, z1: 11.0, w: 0.45, h: 0.45, y: 0.6, frameAt: 0.45, noTub: true },
      nacelles: {
        x: 5.4,
        sections: [S(12.0, 0.98, 0.98, 0.98, 0, 2), S(14.0, 1.12, 1.12, 1.12, 0, 2), S(22.0, 1.15, 1.15, 1.15, 0, 2), S(28.0, 1.05, 1.05, 1.05, 0, 2), S(30.5, 0.95, 0.95, 0.95, 0, 2)],
        open: true,
      },
      spikes: [{ x: 5.4, y: 0, z: 9.2, r: 0.9, len: 3.4 }],
      wing: {
        stations: [W(1.8, 0.0, 15.5, 14.5, 0.04), W(5.4, 0.0, 20.0, 9.0, 0.035), W(8.47, 0.05, 25.0, 2.8, 0.03)],
        aileron: [0.05, 0.97, 0.82], elevon: true,
      },
      // all-moving fins on the nacelles, canted inwards
      vtails: [
        { x: 5.4, cant: -15, stations: [W(0, 1.0, 24.0, 5.0, 0.04), W(0, 4.3, 27.5, 2.2, 0.04)], rudder: [0.05, 0.95, 0.3] },
        { x: -5.4, cant: 15, stations: [W(0, 1.0, 24.0, 5.0, 0.04), W(0, 4.3, 27.5, 2.2, 0.04)], rudder: [0.05, 0.95, 0.3] },
      ],
      ventrals: [],
      nozzles: [{ x: 5.4, y: 0, z: 30.3, r: 0.85, len: 1.6, type: 'round' }, { x: -5.4, y: 0, z: 30.3, r: 0.85, len: 1.6, type: 'round' }],
      pylons: [],
      gear: { nose: { z: 8.0, y: -0.5, len: 1.57, r: 0.38, twin: true }, main: { z: 19.0, x: 2.6, y: -0.4, len: 1.55, r: 0.5, twin: true } },
      pilotEye: { y: 0.95, z: 9.4 },
      gun: { x: 0, y: 0, z: 0 },
      lights: { wingtip: 8.47, tail: [0, 0.2, 32.5] },
    },
  },

  f117: {
    id: 'f117',
    name: 'F-117A Nighthawk',
    role: 'Stealth attack',
    category: 'attack',
    description: 'The first stealth aircraft: a faceted black arrowhead designed on 1970s computers that could only calculate flat panels. Subsonic, no afterburners, no radar, no flares — two laser-guided 2,000 lb bombs and the dark.',
    unlock: 6,
    stealth: 0.15,
    stats: { speed: 0.46, agility: 0.42, firepower: 0.55, armor: 0.45 },
    flight: {
      brakes: { chute: 18 },
      mass: 19000, wingArea: 73, thrustDry: 96, thrustAB: 96, noAB: true, cd0: 0.022, k: 0.16, waveDrag: 2,
      clAlpha: 3.2, maxAoA: 20, maxG: 6, pitchRate: 16, rollRate: 120, yawRate: 10, maxMach: 0.92, ceiling: 13700,
    },
    weapons: { ...BOMBS(2, 'GBU-27 Paveway III', 'GBU-27'), flares: 0 },
    health: 120,
    livery: { base: '#26282b', belly: '#232528', camo: [{ color: '#2c2e32', count: 26, size: 150, type: 'splinter' }], panelAlpha: 0.1, seed: 361, weather: 0.4, finish: 'ram' },
    insignia: 'star', tailCode: 'HO', goldCanopy: true,
    design: {
      length: 20.1, cg: 11.0,
      faceted: true, radial: 8,
      fuselage: [
        S(0, 0.03, 0.02, 0.02, 0, 1, 6), S(3.0, 0.75, 0.55, 0.15, 0, 1, 6), S(5.5, 1.3, 1.0, 0.25, 0, 1, 6),
        S(8.5, 1.9, 1.15, 0.35, 0, 1, 6), S(12.0, 2.3, 1.05, 0.4, 0, 1, 6), S(16.0, 2.0, 0.85, 0.35, 0, 1, 6),
        S(19.5, 1.1, 0.45, 0.25, 0, 1, 6), S(20.1, 0.9, 0.3, 0.2, 0, 1, 6),
      ],
      sideIntakes: { x: 1.75, sections: [S(7.6, 0.55, 0.45, 0.2, 0.55, 1, 6), S(9.0, 0.6, 0.5, 0.25, 0.55, 1, 6), S(13.0, 0.45, 0.35, 0.2, 0.4, 1, 6)] },
      canopy: { z0: 3.6, z1: 7.4, w: 0.55, h: 0.5, y: 0.8, frameAt: 0.5 },
      wing: { stations: [W(1.2, 0.0, 2.9, 13.5, 0.06), W(6.6, 0.05, 15.9, 2.2, 0.04)], aileron: [0.25, 0.95, 0.8], elevon: true },
      // butterfly tail of all-moving ruddervators
      vtails: [
        { x: 0.9, cant: 40, stations: [W(0, 0.6, 15.6, 3.6, 0.04), W(0, 3.3, 18.4, 1.6, 0.04)], rudder: [0.05, 0.95, 0.35] },
        { x: -0.9, cant: -40, stations: [W(0, 0.6, 15.6, 3.6, 0.04), W(0, 3.3, 18.4, 1.6, 0.04)], rudder: [0.05, 0.95, 0.35] },
      ],
      ventrals: [],
      nozzles: [
        { x: 0.9, y: 0.42, z: 18.8, r: 0.5, len: 1.3, type: 'slot', w: 1.5, h: 0.12 },
        { x: -0.9, y: 0.42, z: 18.8, r: 0.5, len: 1.3, type: 'slot', w: 1.5, h: 0.12 },
      ],
      bays: [{ x: 0.65, y: -0.38, z0: 7.5, z1: 12.5, w: 1.1 }],
      pylons: [{ x: 0.65, y: -0.15, z: 10.0, type: 'bomb', internal: true }],
      gear: { nose: { z: 4.6, y: -0.25, len: 1.6, r: 0.33 }, main: { z: 11.2, x: 1.75, y: -0.35, len: 1.45, r: 0.42 } },
      pilotEye: { y: 1.05, z: 5.3 },
      gun: { x: 0, y: 0, z: 0 },
      lights: { wingtip: 6.6, tail: [0, 0.45, 20.0] },
    },
  },
};

// stealth bomber last: the final campaign reward
export const HEAVY_ORDER = ['f117', 'sr71', 'b52', 'b1b', 'tu160', 'b2'];

// More of the hangar, derived from airframes that are already modelled: each
// new type scales a related design to its own real length, span, fuselage
// diameter and wing area, then gets its own weights, thrust, Mach limit and
// livery (fictional airlines). Called from jets.js with the catalogue.
import { S, W } from './designHelpers.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const spanOf = (d) => d.wing.stations[d.wing.stations.length - 1].x * 2;
const diaOf = (d) => Math.max(...d.fuselage.map((s) => s.w)) * 2;

// Scale a design: L along the body, X across the span, D across the fuselage
// section; chords follow the wing area (area / span).
function scaleDesign(src, { L = 1, X = 1, D = 1, chord = 1 }) {
  const d = clone(src);
  const sec = (s) => { s.z *= L; s.w *= D; s.top *= D; s.bot *= D; if (s.y !== undefined) s.y *= D; if (s.x !== undefined) s.x *= X; };
  const st = (s, xk = X, ck = chord) => { s.x *= xk; s.y *= D; s.z *= L; s.chord *= ck; };
  d.length *= L;
  d.cg *= L;
  d.fuselage.forEach(sec);
  if (d.spine) d.spine.forEach(sec);
  if (d.hump) d.hump.sections.forEach(sec);
  for (const k of ['intake']) if (d[k]) d[k].sections.forEach(sec);
  for (const k of ['sideIntakes', 'nacelles']) if (d[k]) { d[k].sections.forEach(sec); d[k].x *= D; }
  for (const b of d.bodies || []) { b.sections.forEach(sec); if (b.x) b.x *= X; }
  for (const f of d.fairings || []) { f.sections.forEach(sec); f.x *= D; }
  for (const w of d.windows || []) { w.y *= D; w.z0 *= L; w.z1 *= L; }
  if (d.doors) d.doors = d.doors.map((z) => z * L);
  if (d.cockpit) { d.cockpit.z0 *= L; d.cockpit.z1 *= L; d.cockpit.y0 *= D; d.cockpit.y1 *= D; }
  if (d.canopy) { d.canopy.z0 *= L; d.canopy.z1 *= L; d.canopy.w *= D; d.canopy.h *= D; d.canopy.y *= D; }
  d.wing.stations.forEach((s) => st(s));
  if (d.lex) d.lex.stations.forEach((s) => st(s));
  if (d.canard) d.canard.stations.forEach((s) => st(s, X, L));
  const tk = Math.sqrt(L * X);
  if (d.stab) d.stab.stations.forEach((s) => st(s, tk, L));
  for (const v of d.vtails || []) { v.x *= D; v.stations.forEach((s) => { s.y = s.y * tk; s.z *= L; s.chord *= L; }); }
  for (const v of d.ventrals || []) { v.x *= D; v.stations.forEach((s) => { s.y *= D; s.z *= L; s.chord *= L; }); }
  for (const w of d.winglets || []) { w.h *= X; w.chord0 *= chord; w.chord1 *= chord; w.sweep *= chord; }
  for (const p of d.pods || []) {
    p.x *= X; p.y *= D; p.z *= L;
    if (p.pylon) { p.pylon.x *= X; p.pylon.y *= D; if (p.pylon.z0) { p.pylon.z0 *= L; p.pylon.z1 *= L; } }
  }
  for (const n of d.nozzles || []) { n.x *= D; n.y *= D; n.z *= L; n.r *= D; }
  for (const p of d.pylons || []) { p.x *= p.body ? D : X; p.y *= D; p.z *= L; }
  for (const k of ['nose', 'main', 'body']) {
    const g = d.gear && d.gear[k];
    if (!g) continue;
    g.z *= L; g.y *= D; g.len *= D;
    if (g.x) g.x *= k === 'main' ? Math.sqrt(X * D) : D;
    if (g.r) g.r *= Math.sqrt(D);
  }
  d.pilotEye = { ...d.pilotEye, y: d.pilotEye.y * D, z: d.pilotEye.z * L, x: (d.pilotEye.x || 0) * D };
  if (d.gun) d.gun = { x: d.gun.x * D, y: d.gun.y * D, z: d.gun.z * L };
  d.lights = clone(d.lights);
  d.lights.wingtip *= X;
  d.lights.tail = [d.lights.tail[0] * D, d.lights.tail[1] * tk, d.lights.tail[2] * L];
  if (d.lights.beacons) d.lights.beacons = d.lights.beacons.map(([x, y, z]) => [x * D, y * D, z * L]);
  return d;
}

// a new airliner from a base type and the real figures
function airliner(base, o) {
  const b = base.design;
  const L = o.length / b.length, X = o.span / spanOf(b), D = o.diameter / diaOf(b);
  const chord = (o.wingArea / base.flight.wingArea) / X;
  const design = scaleDesign(b, { L, X, D, chord });
  for (const p of design.pods || []) { if (o.podR) p.r = o.podR; if (o.podLen) p.len = o.podLen; if (p.pylon) p.pylon.y = p.y + o.podR * 1.15; }
  if (o.winglets !== undefined) design.winglets = o.winglets;
  if (o.windowPitch) for (const w of design.windows) w.pitch = o.windowPitch;
  if (o.doors) design.doors = o.doors;
  return {
    ...clone(base), ...o.meta,
    id: o.id, design,
    flight: { ...clone(base.flight), ...o.flight },
    livery: { ...base.livery, ...o.livery },
    stats: { ...base.stats, ...o.stats },
  };
}

function fighter(base, o) {
  const b = base.design;
  const L = (o.length || b.length) / b.length;
  const X = (o.span || spanOf(b)) / spanOf(b);
  const chord = ((o.wingArea || base.flight.wingArea) / base.flight.wingArea) / X;
  const design = scaleDesign(b, { L, X, D: o.D || 1, chord });
  if (o.edit) o.edit(design);
  return {
    ...clone(base), ...o.meta,
    id: o.id, design,
    flight: { ...clone(base.flight), ...o.flight },
    weapons: { ...base.weapons, ...o.weapons },
    livery: { ...base.livery, ...o.livery },
    stats: { ...base.stats, ...o.stats },
    insignia: o.insignia || base.insignia, tailCode: o.tailCode ?? base.tailCode,
  };
}

export function makeVariants(J) {
  const out = {};

  // ---------------------------------------------------------------- fighters
  // Sukhoi Su-30MKI: two-seat thrust-vectoring Flanker with canards, 21.9 m,
  // 14.7 m span, 62 m2, two AL-31FP of 123 kN in reheat, Mach 2.0
  out.su30 = fighter(J.su35, {
    id: 'su30', insignia: 'india', tailCode: 'SB',
    meta: { name: 'Su-30MKI Flanker-H', role: 'Two-seat air superiority', unlock: 6, description: 'Long-range two-seater with canards and vectoring nozzles. Huge fuel load, twelve missiles and the agility of a much smaller jet.' },
    flight: { mass: 26500, wingArea: 62, thrustDry: 150, thrustAB: 246, cd0: 0.022, maxMach: 2.0, maxG: 9, tvc: true },
    weapons: { missiles: 12 },
    livery: { base: '#8f9ca6', belly: '#c3cdd5', camo: [{ color: '#5d6d7c', count: 36, size: 120, type: 'splinter' }, { color: '#a7b4bf', count: 20, size: 80, type: 'splinter' }], seed: 307 },
    stats: { speed: 0.84, agility: 0.93, firepower: 0.92, armor: 0.88 },
    edit: (d) => { d.canopy.z1 += 1.5; d.spine[0].z += 1.2; },
  });
  // Boeing F-15E Strike Eagle: conformal fuel tanks, dark grey, two F100-229
  // of 129 kN, 31 t, Mach 2.5
  out.f15e = fighter(J.f15, {
    id: 'f15e', tailCode: 'SJ',
    meta: { name: 'F-15E Strike Eagle', role: 'Dual-role strike fighter', unlock: 5, description: 'The Eagle grown into a heavyweight striker: conformal fuel tanks hug the intakes, a weapons officer sits behind the pilot and it still does Mach 2.5.' },
    flight: { mass: 31000, wingArea: 56.5, thrustDry: 158, thrustAB: 258, cd0: 0.0205, maxMach: 2.5, maxG: 9 },
    weapons: { missiles: 8, gunAmmo: 500 },
    livery: { base: '#4e555b', belly: '#565d63', camo: [], panelAlpha: 0.26, seed: 311, weather: 1.3 },
    stats: { speed: 0.9, agility: 0.72, firepower: 0.95, armor: 0.9 },
    edit: (d) => {
      d.canopy.z1 += 1.2;
      d.bodies = [...(d.bodies || []), { x: 1.68, sections: [S(7.8, 0.06, 0.08, 0.08, -0.22), S(8.8, 0.3, 0.34, 0.34, -0.28, 2.4), S(13.4, 0.3, 0.34, 0.34, -0.28, 2.4), S(14.8, 0.06, 0.08, 0.08, -0.2)] }];
    },
  });
  // Chengdu J-10C: canard delta with a ventral chin intake, 16.9 m, 9.75 m
  // span, 39 m2, one WS-10B of about 135 kN, Mach 1.8
  out.j10 = fighter(J.mirage, {
    id: 'j10', insignia: 'china', tailCode: '52',
    length: 16.9, span: 9.75, wingArea: 39,
    meta: { name: 'J-10C Vigorous Dragon', role: 'Multirole fighter', unlock: 4, description: 'A canard delta with a chin intake under the cockpit: unstable by design, fly-by-wire, quick to point and quick to climb.' },
    flight: { mass: 13500, wingArea: 39, thrustDry: 89, thrustAB: 135, cd0: 0.017, maxMach: 1.8, maxG: 9, pitchRate: 28, rollRate: 260 },
    weapons: { missiles: 6, gunAmmo: 200 },
    livery: { base: '#a9b0b7', belly: '#b8bfc5', camo: [{ color: '#8d969f', count: 26, size: 110, type: 'blob' }], seed: 313 },
    stats: { speed: 0.8, agility: 0.88, firepower: 0.66, armor: 0.6 },
    edit: (d) => {
      delete d.sideIntakes;
      d.intake = { sections: [S(5.0, 0.5, 0.32, 0.36, -0.86, 2.6), S(6.2, 0.56, 0.46, 0.4, -0.84, 2.8), S(9.0, 0.56, 0.5, 0.38, -0.66, 2.8), S(11.6, 0.44, 0.42, 0.28, -0.45, 2.6), S(12.6, 0.28, 0.28, 0.2, -0.35)], lip: true };
      d.canard = { stations: [W(0.55, 0.12, 5.2, 1.4, 0.04), W(1.95, 0.12, 6.4, 0.6, 0.04)], pivot: 0.4 };
      d.ventrals = [{ x: 0.5, cant: -25, stations: [W(0, -0.45, 13.4, 1.2, 0.05), W(0, -0.95, 14.0, 0.6, 0.05)] }];
    },
  });
  // Mikoyan MiG-35: the modernised Fulcrum, two RD-33MKV of 88 kN, Mach 2.25
  out.mig35 = fighter(J.mig29, {
    id: 'mig35', tailCode: '35', length: 17.3,
    meta: { name: 'MiG-35 Fulcrum-F', role: 'Multirole fighter', unlock: 5, description: 'The Fulcrum reborn with smokeless engines, more fuel and an AESA radar. Same brutal low-speed agility, longer legs.' },
    flight: { mass: 16500, thrustDry: 106, thrustAB: 176, maxMach: 2.25, maxG: 9 },
    weapons: { missiles: 8 },
    livery: { base: '#9aa7b5', belly: '#c9d2da', camo: [{ color: '#6f8196', count: 30, size: 120, type: 'blob' }, { color: '#b9c4cf', count: 14, size: 80, type: 'blob' }], seed: 317 },
    stats: { speed: 0.8, agility: 0.92, firepower: 0.7, armor: 0.68 },
  });

  // ---------------------------------------------------------------- airliners
  const narrow = J.a320, b737 = J.b737, wide = J.b787;
  out.a321 = airliner(narrow, {
    id: 'a321', length: 44.5, span: 35.8, diameter: 4.14, wingArea: 122.4, podR: 1.12, podLen: 4.7,
    meta: { name: 'Airbus A321neo', role: 'Long narrow-body airliner', description: 'The stretched A320: 44.5 m long with extra over-wing exits, up to 240 seats and LEAP engines. Heavier on the controls and a longer take-off roll.' },
    flight: { mass: 82000, wingArea: 122.4, thrustDry: 294, thrustAB: 294, maxMach: 0.82 },
    livery: { airline: 'TERRA AIR', top: '#f5f7f5', belly: '#d7dfd8', stripe: '#0f7a4a', stripe2: '#9bd36a', tail: '#0f7a4a', tailAccent: '#9bd36a', logo: 'wave', engine: '#0f7a4a', seed: 401 },
    doors: [5.4, 13.5, 19.0, 26.5, 36.2],
  });
  out.a220 = airliner(narrow, {
    id: 'a220', length: 38.7, span: 35.1, diameter: 3.7, wingArea: 112.3, podR: 0.98, podLen: 4.3,
    meta: { name: 'Airbus A220-300', role: 'Regional jet', description: 'Clean-sheet, mostly composite and whisper quiet: geared turbofans, big windows and the best seat-mile economics in its class.' },
    flight: { mass: 58000, wingArea: 112.3, thrustDry: 206, thrustAB: 206, maxMach: 0.82 },
    livery: { airline: 'LUMA', top: '#fafafa', belly: '#e3e0ec', stripe: '#5b2a86', stripe2: '#e05a9b', tail: '#5b2a86', tailAccent: '#e05a9b', logo: 'star', engine: '#5b2a86', seed: 409 },
  });
  out.e195 = airliner(narrow, {
    id: 'e195', length: 41.5, span: 35.1, diameter: 3.35, wingArea: 103, podR: 0.95, podLen: 4.1,
    meta: { name: 'Embraer E195-E2', role: 'Regional jet', description: 'Brazil\'s largest airliner: a slim double-bubble fuselage with no middle seats, high-aspect wing and full fly-by-wire.' },
    flight: { mass: 54000, wingArea: 103, thrustDry: 200, thrustAB: 200, maxMach: 0.82 },
    livery: { airline: 'CARIOCA', top: '#f7f7f2', belly: '#2b6b3a', stripe: '#1f8a3c', stripe2: '#f5c518', tail: '#1f8a3c', tailAccent: '#f5c518', logo: 'globe', engine: '#f5c518', seed: 419 },
  });
  out.b757 = airliner(b737, {
    id: 'b757', length: 47.3, span: 38.05, diameter: 3.76, wingArea: 185, podR: 1.25, podLen: 5.4,
    meta: { name: 'Boeing 757-200', role: 'Narrow-body airliner', description: 'The pencil: a long, slim fuselage on tall gear with two big Rolls-Royce engines. Famously over-powered: it leaps off short runways.' },
    flight: { mass: 100000, wingArea: 185, thrustDry: 380, thrustAB: 380, maxMach: 0.86 },
    livery: { airline: 'ATLANTICA', top: '#ffffff', belly: '#1d2f5e', stripe: '#c8102e', stripe2: '#1d2f5e', tail: '#1d2f5e', tailAccent: '#c8102e', logo: 'stripes', engine: '#1d2f5e', seed: 421 },
    winglets: [{ h: 2.4, chord0: 1.6, chord1: 0.5, sweep: 1.5, cant: 8 }],
  });
  out.b767 = airliner(wide, {
    id: 'b767', length: 54.9, span: 47.6, diameter: 5.03, wingArea: 283, podR: 1.45, podLen: 6.0,
    meta: { name: 'Boeing 767-300ER', role: 'Wide-body twin', description: 'The twin that opened the oceans to two engines: a semi-wide body with seven abreast, tough, quick and still flying cargo and passengers everywhere.' },
    flight: { mass: 170000, wingArea: 283, thrustDry: 564, thrustAB: 564, maxMach: 0.86 },
    livery: { airline: 'SOLAR', top: '#fbfaf6', belly: '#f3e6c8', stripe: '#e8761c', stripe2: '#f6b51e', tail: '#e8761c', tailAccent: '#f6b51e', logo: 'falcon', engine: '#e8761c', seed: 431 },
    winglets: [{ h: 3.2, chord0: 2.0, chord1: 0.6, sweep: 1.8, cant: 6 }],
  });
  out.a330 = airliner(wide, {
    id: 'a330', length: 63.7, span: 64, diameter: 5.64, wingArea: 465, podR: 1.75, podLen: 7.0,
    meta: { name: 'Airbus A330-900neo', role: 'Wide-body twin', description: 'A new 64 m wing with sharklets and Trent 7000 engines on the proven A330: smooth, quiet and long-legged.' },
    flight: { mass: 220000, wingArea: 465, thrustDry: 640, thrustAB: 640, maxMach: 0.86 },
    livery: { airline: 'MERIDIAN', top: '#f6f8fb', belly: '#c9d3df', stripe: '#003d7a', stripe2: '#d71920', tail: '#003d7a', tailAccent: '#d71920', logo: 'star', engine: '#f2f4f7', seed: 433 },
    winglets: [{ h: 4.0, chord0: 2.6, chord1: 0.8, sweep: 2.2, cant: 12 }],
  });
  out.a350 = airliner(wide, {
    id: 'a350', length: 66.8, span: 64.75, diameter: 5.96, wingArea: 442, podR: 1.85, podLen: 7.4,
    meta: { name: 'Airbus A350-900', role: 'Long-haul twin', description: 'Carbon-fibre fuselage, a morphing wing with curved sharklets and Trent XWB engines. Mach 0.85 for 15,000 km behind its trademark "raccoon mask" windscreen.' },
    flight: { mass: 240000, wingArea: 442, thrustDry: 748, thrustAB: 748, maxMach: 0.89 },
    livery: { airline: 'HORIZON', top: '#f7f8fa', belly: '#e2e7ee', stripe: '#6b1e3d', stripe2: '#c9a24a', tail: '#6b1e3d', tailAccent: '#c9a24a', logo: 'globe', engine: '#f2f4f6', seed: 439 },
    winglets: [{ h: 3.4, chord0: 2.4, chord1: 0.5, sweep: 2.8, cant: 30 }],
  });
  for (const id of ['a321', 'a220', 'e195', 'b757', 'b767', 'a330', 'a350']) out[id].category = 'airliner';
  return out;
}

export const VARIANT_MILITARY = ['j10', 'f15e', 'mig35', 'su30'];
export const VARIANT_AIRLINERS = ['a220', 'e195', 'a321', 'b757', 'b767', 'a330', 'a350'];

// Map (theatre) definitions. Each map provides a deterministic height function
// plus look-and-feel parameters (sky, fog, water, terrain palette, clouds, trees).
import { Simplex2, smoothstep, lerp, clamp } from './noise.js';
import { CityLayout } from './cityLayout.js';

// ---------------------------------------------------------------------------
// Height functions
// ---------------------------------------------------------------------------

function pacificHeight(n, n2) {
  const volcanoX = 7000, volcanoZ = -5500;
  return (x, z) => {
    const wx = x + n2.noise(x / 9000, z / 9000) * 1100;
    const wz = z + n2.noise(x / 9000 + 31.7, z / 9000 - 17.1) * 1100;
    const c = n.fbm(wx / 15000, wz / 15000, 5, 2.0, 0.42);
    const land = c - 0.14;
    let h;
    if (land > 0) {
      const inland = smoothstep(0.0, 0.22, land);
      h = land * 700 +
        n.ridged(wx / 3200, wz / 3200, 5) * 650 * inland * inland +
        n2.fbm(x / 700, z / 700, 3) * 25 * inland;
    } else {
      h = land * 1400;
    }
    // Volcanic island landmark
    const ang = Math.atan2(z - volcanoZ, x - volcanoX);
    const rad = 4800 * (1 + 0.18 * n2.noise(Math.cos(ang) * 1.5 + 40, Math.sin(ang) * 1.5));
    const dv = Math.hypot(x - volcanoX, z - volcanoZ);
    if (dv < rad) {
      const k = 1 - dv / rad;
      const cone = (k * k * 0.55 + Math.pow(k, 4) * 0.45) * 1650;
      const crater = smoothstep(420, 120, dv) * 220;
      const ridges = n.ridged((x - volcanoX) / 700, (z - volcanoZ) / 700, 4) * 220 * k;
      h = Math.max(h, cone - crater + ridges - 90);
    }
    return h;
  };
}

// The main canyon follows this path; missions use it to lay out ring courses.
export function canyonPathZ(x) {
  return 2600 * Math.sin(x / 6500) + 1100 * Math.sin(x / 2100 + 1.3);
}
function canyonPathDz(x) {
  return (2600 / 6500) * Math.cos(x / 6500) + (1100 / 2100) * Math.cos(x / 2100 + 1.3);
}

function canyonHeight(n, n2) {
  const terrace = (h, step) => {
    const t = h / step;
    const f = t - Math.floor(t);
    return (Math.floor(t) + smoothstep(0.35, 0.65, f)) * step;
  };
  return (x, z) => {
    const wx = x + n2.noise(x / 5000, z / 5000) * 900;
    const wz = z + n2.noise(x / 5000 + 9.1, z / 5000 + 3.3) * 900;
    // High desert plateau with mesas
    let h = 420 + n.fbm(wx / 9000, wz / 9000, 4) * 180;
    const mesa = smoothstep(0.15, 0.3, n.fbm(wx / 4200 + 5, wz / 4200, 4));
    h += mesa * 260;
    // Side canyon network
    const net = n2.ridged(wx / 6000, wz / 6000, 4);
    h -= smoothstep(0.55, 0.85, net) * 300;
    h = terrace(h, 55) + n2.fbm(x / 400, z / 400, 2) * 6;
    // Main canyon carved along a sinuous path
    const dz = canyonPathDz(x);
    const d = Math.abs(z - canyonPathZ(x)) / Math.sqrt(1 + dz * dz) + n2.noise(x / 900, z / 900) * 60;
    const floor = 30;
    const wall = smoothstep(150, 750, d);
    const carved = lerp(floor, h, Math.pow(wall, 0.85));
    h = Math.min(h, terrace(carved, 45) * 0.85 + carved * 0.15);
    // Dunes on flat plateau areas
    const dune = Math.abs(Math.sin((x * 0.8 + z * 0.6) / 170 + n2.noise(x / 1500, z / 1500) * 2.5));
    h += dune * 9 * (1 - mesa) * wall;
    return h;
  };
}

function alpsHeight(n, n2) {
  return (x, z) => {
    const wx = x + n2.noise(x / 8000, z / 8000) * 2500;
    const wz = z + n2.noise(x / 8000 - 13.3, z / 8000 + 7.7) * 2500;
    const r = n.ridged(wx / 14000, wz / 14000, 7, 2.05, 0.52);
    const massif = smoothstep(-0.4, 0.5, n2.fbm(x / 30000, z / 30000, 2));
    let h = Math.pow(r, 1.9) * 5200 * (0.45 + 0.55 * massif);
    h += n2.fbm(x / 2500, z / 2500, 3) * 120 + 260;
    // soften valley floors so lakes and meadows appear
    const valley = smoothstep(900, 300, h);
    h = lerp(h, 330 + (h - 330) * 0.35, valley * 0.6);
    return h;
  };
}

function arcticHeight(n, n2) {
  return (x, z) => {
    const wx = x + n2.noise(x / 6000, z / 6000) * 2200;
    const wz = z + n2.noise(x / 6000 + 4.4, z / 6000 - 8.8) * 2200;
    const v = n.noise(wx / 9000, wz / 9000);
    const channel = Math.abs(v); // fjords run along v = 0 lines
    const fjord = smoothstep(0.03, 0.26, channel);
    const mtn = n2.ridged(wx / 7000, wz / 7000, 6) * 1900;
    let h = lerp(-260, 120 + mtn, fjord);
    // open sea towards the south-east
    const sea = smoothstep(14000, 26000, x * 0.6 + z * 0.8);
    h = lerp(h, -300, sea);
    h += n.fbm(x / 1600, z / 1600, 3) * 40;
    return h;
  };
}

export function highlandRiverZ(x) {
  return -1800 + 2200 * Math.sin(x / 5200 + 0.4) + 700 * Math.sin(x / 1700);
}

function highlandsHeight(n, n2) {
  return (x, z) => {
    let h = 230 + n.fbm(x / 7000, z / 7000, 5) * 380;
    h += n2.ridged(x / 5000, z / 5000, 4) * 260 * smoothstep(0.0, 0.35, n.fbm(x / 15000 + 3, z / 15000, 2));
    // Meandering river valley
    const dzdx = (2200 / 5200) * Math.cos(x / 5200 + 0.4) + (700 / 1700) * Math.cos(x / 1700);
    const d = Math.abs(z - highlandRiverZ(x)) / Math.sqrt(1 + dzdx * dzdx);
    const valley = smoothstep(2200, 90, d);
    h = lerp(h, -6, Math.pow(valley, 1.6));
    // Coastline in the west
    const coast = smoothstep(-9000, -16000, x + n2.noise(x / 6000, z / 6000) * 2500);
    h = lerp(h, -120, coast);
    return h;
  };
}

// Metro Bay: a coastal plain with a river estuary running through downtown,
// hills to the north and the open sea to the south.
export function metroRiverX(z) {
  return 900 + 700 * Math.sin(z / 3800) + 300 * Math.sin(z / 1300 + 0.7);
}
export function metroCoastZ(x) {
  return 5200 + 900 * Math.sin(x / 5200 + 0.6) + 500 * Math.sin(x / 1900);
}

function metroHeight(n, n2) {
  return (x, z) => {
    let h = 14 + n.fbm(x / 6000, z / 6000, 3) * 6 + n2.fbm(x / 1500, z / 1500, 2) * 2;
    // mountains to the north
    const north = smoothstep(-6500, -16000, z + n2.noise(x / 7000, 3.3) * 2500);
    h += north * (180 + n.ridged(x / 6000, z / 6000, 5) * 1500);
    // rolling hills far east and west of the city
    const side = smoothstep(12500, 20000, Math.abs(x - 1000) + n2.noise(z / 5000, 1.1) * 2000);
    h += side * (60 + n.fbm(x / 4000, z / 4000, 4) * 320) * (1 - north * 0.5);
    // the sea to the south
    const cz = metroCoastZ(x) + n2.noise(x / 2500, 9.1) * 300;
    const sea = smoothstep(cz - 150, cz + 600, z);
    h = lerp(h, -40 - smoothstep(cz, cz + 6000, z) * 60, sea);
    // river estuary from the mountains to the bay
    const dr = Math.abs(x - metroRiverX(z));
    const width = 170 + smoothstep(0, 5200, z) * 260;
    const river = smoothstep(width + 160, width, dr) * smoothstep(-12500, -9500, z);
    h = lerp(h, -12, river);
    // a few islands out in the bay
    for (const [ix, iz, r] of [[-4200, 8600, 900], [3600, 9400, 600], [7800, 8200, 1100]]) {
      const d = Math.hypot(x - ix, z - iz) / r;
      if (d < 1) h = Math.max(h, (1 - d * d) * 70 + n2.fbm(x / 400, z / 400, 2) * 8 - 8);
    }
    return h;
  };
}

// Desert Metropolis: flat golden coast, dunes inland and a palm-shaped
// island off the shore.
export function desertCoastX(z) {
  return -3000 + 600 * Math.sin(z / 6000) + 250 * Math.sin(z / 1700 + 1.2);
}
const PALM = { x0: -3200, z: 2600, x1: -8200, fronds: 7 };

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function palmLand(x, z) {
  if (x > PALM.x0 + 300 || x < PALM.x1 - 3200 || Math.abs(z - PALM.z) > 3600) return -Infinity;
  let d = segDist(x, z, PALM.x0 + 200, PALM.z, PALM.x1, PALM.z) - 120;
  // fronds branching off the outer half of the trunk
  for (let i = 0; i < PALM.fronds; i++) {
    const fx = PALM.x1 + 300 + i * 420;
    for (const s of [-1, 1]) {
      const ex = fx + 650, ez = PALM.z + s * (900 + i * 60);
      d = Math.min(d, segDist(x, z, fx, PALM.z, ex, ez) - 45);
    }
  }
  // crescent breakwater
  const cx = PALM.x1 + 800, r = Math.hypot(x - cx, z - PALM.z);
  const ang = Math.atan2(z - PALM.z, x - cx);
  if (Math.abs(ang) > Math.PI * 0.42) d = Math.min(d, Math.abs(r - 2700) - 70);
  return d < 0 ? 3.5 : d < 40 ? 3.5 - d * 0.3 : -Infinity;
}

function desertHeight(n, n2) {
  return (x, z) => {
    let h = 8 + n.fbm(x / 7000, z / 7000, 3) * 4;
    // dunes inland
    const inland = smoothstep(5500, 12000, x + n2.noise(z / 4000, 2.2) * 1500);
    const dune = Math.abs(Math.sin((x * 0.75 + z * 0.66) / 210 + n2.noise(x / 1800, z / 1800) * 2.6));
    h += inland * (dune * 34 + n.fbm(x / 3000, z / 3000, 4) * 70 + 30);
    // distant rocky mountains in the east
    h += smoothstep(17000, 26000, x) * n.ridged(x / 5000, z / 5000, 5) * 1100;
    // sea to the west
    const cx = desertCoastX(z) + n2.noise(z / 2000, 4.4) * 120;
    const sea = smoothstep(cx + 120, cx - 500, x);
    h = lerp(h, -30 - smoothstep(cx, cx - 8000, x) * 40, sea);
    const palm = palmLand(x, z);
    if (palm > h) h = palm;
    return h;
  };
}

// ---------------------------------------------------------------------------
// Map definitions
// ---------------------------------------------------------------------------

export const MAPS = {
  pacific: {
    id: 'pacific',
    name: 'Pacific Atoll',
    subtitle: 'Turquoise lagoons, volcanic islands',
    seed: 1337,
    heightFn: pacificHeight,
    airbaseNear: [0, 0],
    lighting: { elevation: 34, azimuth: 115, turbidity: 2.6, rayleigh: 1.3, mie: 0.004, mieG: 0.82, exposure: 0.42 },
    fog: { density: 1 / 42000, falloff: 1 / 1500, haze: 0.14 },
    water: { level: 0, deep: '#0a3a55', shallow: '#2fb8b0', absorb: 9 },
    palette: {
      sand: '#e3d3a6', grass1: '#56783a', grass2: '#7f934c', forest: '#2a4520',
      rock1: '#6c6156', rock2: '#3e3832', snow: '#f2f4f7', dirt: '#7a6040',
    },
    snowLine: 99999, beach: 14, forest: 0.85, fields: 0.0, strata: 0.0,
    clouds: { density: 1.0, base: 1300, top: 2300 },
    trees: { kind: 'tropical', density: 1.0, maxAlt: 700 },
    groundAmbient: '#5a6a48',
  },
  canyon: {
    id: 'canyon',
    name: 'Red Canyon',
    subtitle: 'Desert mesas and a deep river gorge',
    seed: 4242,
    heightFn: canyonHeight,
    airbaseNear: [-6000, 6000],
    lighting: { elevation: 42, azimuth: 210, turbidity: 4.5, rayleigh: 0.9, mie: 0.006, mieG: 0.8, exposure: 0.37 },
    fog: { density: 1 / 45000, falloff: 1 / 2200, haze: 0.18 },
    water: { level: 52, deep: '#24434a', shallow: '#4f8a7c', absorb: 6 },
    palette: {
      sand: '#d9a066', grass1: '#b8834f', grass2: '#c99a5e', forest: '#6b6a3a',
      rock1: '#a5532e', rock2: '#6e3420', snow: '#f0e8de', dirt: '#8a5a3a',
    },
    snowLine: 99999, beach: 6, forest: 0.12, fields: 0.0, strata: 1.0,
    clouds: { density: 0.35, base: 2600, top: 3400 },
    trees: { kind: 'desert', density: 0.25, maxAlt: 900 },
    groundAmbient: '#8a5a3a',
  },
  alps: {
    id: 'alps',
    name: 'Alpine Peaks',
    subtitle: 'Glaciers, knife-edge ridges and lakes',
    seed: 9001,
    heightFn: alpsHeight,
    airbaseNear: [0, 0],
    lighting: { elevation: 30, azimuth: 160, turbidity: 2.0, rayleigh: 1.1, mie: 0.003, mieG: 0.8, exposure: 0.41 },
    fog: { density: 1 / 52000, falloff: 1 / 2600, haze: 0.14 },
    water: { level: 300, deep: '#0f3346', shallow: '#3a7f86', absorb: 8 },
    palette: {
      sand: '#9a8f78', grass1: '#4d6e2c', grass2: '#76883e', forest: '#1f3b1e',
      rock1: '#6f6b66', rock2: '#47443f', snow: '#f5f8fc', dirt: '#6a5a44',
    },
    snowLine: 2100, beach: 4, forest: 0.9, fields: 0.15, strata: 0.15,
    clouds: { density: 0.8, base: 3200, top: 4400 },
    trees: { kind: 'conifer', density: 1.0, maxAlt: 1800 },
    groundAmbient: '#4a5a44',
  },
  arctic: {
    id: 'arctic',
    name: 'Frozen Fjords',
    subtitle: 'Low polar sun over icy channels',
    seed: 777,
    heightFn: arcticHeight,
    airbaseNear: [-4000, -3000],
    lighting: { elevation: 9, azimuth: 200, turbidity: 3.2, rayleigh: 1.6, mie: 0.005, mieG: 0.85, exposure: 0.48 },
    fog: { density: 1 / 36000, falloff: 1 / 1400, haze: 0.18 },
    water: { level: 0, deep: '#0c2232', shallow: '#355f6e', absorb: 7 },
    palette: {
      sand: '#8d8a84', grass1: '#d9e2ea', grass2: '#c4d0da', forest: '#2e3d36',
      rock1: '#4b4e52', rock2: '#2c2e31', snow: '#f4f8fc', dirt: '#5a5650',
    },
    snowLine: 140, beach: 6, forest: 0.25, fields: 0.0, strata: 0.2,
    clouds: { density: 0.9, base: 1500, top: 2500 },
    trees: { kind: 'snowconifer', density: 0.45, maxAlt: 500 },
    groundAmbient: '#8a96a4',
  },
  highlands: {
    id: 'highlands',
    name: 'Green Highlands',
    subtitle: 'Patchwork farmland, rivers and coast at sunset',
    seed: 2024,
    heightFn: highlandsHeight,
    airbaseNear: [3000, 4000],
    lighting: { elevation: 7, azimuth: 255, turbidity: 4.0, rayleigh: 2.2, mie: 0.006, mieG: 0.86, exposure: 0.51 },
    fog: { density: 1 / 32000, falloff: 1 / 1300, haze: 0.2 },
    water: { level: 0, deep: '#13303c', shallow: '#3f6f66', absorb: 8 },
    palette: {
      sand: '#c9b88a', grass1: '#4f7a2c', grass2: '#86913f', forest: '#22401c',
      rock1: '#6a675e', rock2: '#46443e', snow: '#f2f4f7', dirt: '#6e5636',
    },
    snowLine: 99999, beach: 5, forest: 0.6, fields: 1.0, strata: 0.0,
    clouds: { density: 0.75, base: 1600, top: 2600 },
    trees: { kind: 'broadleaf', density: 0.9, maxAlt: 900 },
    groundAmbient: '#4a5638',
  },
  metro: {
    id: 'metro',
    name: 'Metro Bay',
    subtitle: 'Skyscrapers, a river estuary and the harbour',
    seed: 5150,
    heightFn: metroHeight,
    airbaseNear: [10500, 1800],
    lighting: { elevation: 26, azimuth: 230, turbidity: 3.4, rayleigh: 1.3, mie: 0.005, mieG: 0.82, exposure: 0.42 },
    fog: { density: 1 / 36000, falloff: 1 / 1500, haze: 0.2 },
    water: { level: 0, deep: '#0f3043', shallow: '#3a7c7e', absorb: 7 },
    palette: {
      sand: '#cdbf98', grass1: '#5a7a3a', grass2: '#7d8c4a', forest: '#2c4524',
      rock1: '#6c675e', rock2: '#46433e', snow: '#f2f4f7', dirt: '#6e5a3e',
    },
    snowLine: 1700, beach: 6, forest: 0.55, fields: 0.35, strata: 0.0,
    clouds: { density: 0.7, base: 1700, top: 2700 },
    trees: { kind: 'broadleaf', density: 0.7, maxAlt: 1100 },
    groundAmbient: '#4f5a44',
    city: {
      x: -400, z: 1200, radius: 6400, cell: 120, street: 18, seed: 9137, style: 'metro', lowRise: 16, parks: 0.07,
      districts: [{ x: -300, z: 1500, r: 1300, h: 380 }, { x: 2700, z: 450, r: 950, h: 230 }, { x: -2700, z: -1700, r: 1050, h: 170 }, { x: 1200, z: 3600, r: 900, h: 120 }],
      port: { x: 3800, z: 5100, r: 2600 },
      landmarks: [{ type: 'needle', x: -980, z: 2020, h: 560 }, { type: 'twin', x: 380, z: 820, h: 420 }, { type: 'stadium', x: -3600, z: 2900, r: 130, h: 42 }],
      exclude: [{ x: -980, z: 2020, r: 70 }, { x: 380, z: 820, r: 90 }, { x: -3600, z: 2900, r: 170 }],
      bridge: { x0: 600, x1: 2150, z: 960, deckY: 44, towerH: 150, towers: [1050, 1700] },
    },
  },
  desert: {
    id: 'desert',
    name: 'Desert Metropolis',
    subtitle: 'Supertall towers on a golden coast at dusk',
    seed: 8686,
    heightFn: desertHeight,
    airbaseNear: [9500, -3500],
    lighting: { elevation: 3, azimuth: 262, turbidity: 5.5, rayleigh: 2.4, mie: 0.008, mieG: 0.88, exposure: 0.5 },
    fog: { density: 1 / 30000, falloff: 1 / 1600, haze: 0.24 },
    water: { level: 0, deep: '#0c3446', shallow: '#3aa1a0', absorb: 9 },
    palette: {
      sand: '#e2c48c', grass1: '#cfae74', grass2: '#d8b97e', forest: '#5d6a3a',
      rock1: '#a87a52', rock2: '#7a5438', snow: '#f0e8de', dirt: '#b08a5a',
    },
    snowLine: 99999, beach: 8, forest: 0.08, fields: 0.0, strata: 0.4,
    clouds: { density: 0.25, base: 2800, top: 3600 },
    trees: { kind: 'tropical', density: 0.35, maxAlt: 120 },
    groundAmbient: '#9a7a52',
    city: {
      x: 1200, z: 0, radius: 7200, cell: 120, street: 20, seed: 4411, style: 'gulf', lowRise: 13, parks: 0.05,
      shape: (x) => x < 6200,
      districts: [{ x: 900, z: -400, r: 1500, h: 430 }, { x: -1600, z: 4600, r: 1000, h: 300 }, { x: 2600, z: -3600, r: 1000, h: 220 }, { x: -1300, z: -2600, r: 800, h: 160 }],
      landmarks: [{ type: 'supertall', x: 1250, z: -350, h: 828 }, { type: 'twin', x: -1550, z: 4400, h: 330 }, { type: 'stadium', x: 3600, z: 2600, r: 120, h: 38 }],
      exclude: [{ x: 1250, z: -350, r: 120 }, { x: -1550, z: 4400, r: 90 }, { x: 3600, z: 2600, r: 160 }],
    },
  },
};

export const MAP_ORDER = ['pacific', 'canyon', 'alps', 'arctic', 'highlands', 'metro', 'desert'];

// Time-of-day presets that missions or free flight can apply on top of a map.
export const TIME_PRESETS = {
  dawn: { elevation: 6, azimuthOffset: -100, turbidity: 3.5, rayleigh: 2.4, mie: 0.006, mieG: 0.86, exposure: 0.54 },
  morning: { elevation: 24, azimuthOffset: -60, turbidity: 2.8, rayleigh: 1.4, mie: 0.004, mieG: 0.82, exposure: 0.42 },
  noon: { elevation: 62, azimuthOffset: 0, turbidity: 2.4, rayleigh: 1.0, mie: 0.004, mieG: 0.8, exposure: 0.34 },
  afternoon: { elevation: 30, azimuthOffset: 50, turbidity: 3.0, rayleigh: 1.2, mie: 0.005, mieG: 0.8, exposure: 0.41 },
  sunset: { elevation: 4, azimuthOffset: 95, turbidity: 4.5, rayleigh: 2.6, mie: 0.007, mieG: 0.88, exposure: 0.58 },
  dusk: { elevation: 0.8, azimuthOffset: 100, turbidity: 5.0, rayleigh: 3.0, mie: 0.008, mieG: 0.9, exposure: 0.8 },
  night: { elevation: -14, azimuthOffset: 120, turbidity: 2.0, rayleigh: 1.0, mie: 0.003, mieG: 0.8, exposure: 1.25, night: true, moonElevation: 34, moonAzimuthOffset: -60 },
};

// ---------------------------------------------------------------------------
// Runtime map: wraps the height function with airbase flattening & helpers.
// ---------------------------------------------------------------------------

export class MapRuntime {
  constructor(def) {
    this.def = def;
    this.n = new Simplex2(def.seed);
    this.n2 = new Simplex2(def.seed * 7 + 3);
    this.base = def.heightFn(this.n, this.n2);
    this.waterLevel = def.water.level;
    this.airbase = null;
    this._findAirbase();
    this.city = def.city ? new CityLayout(this, def.city) : null;
  }

  _findAirbase() {
    const [cx, cz] = this.def.airbaseNear;
    const L = 3000;
    const wl = this.waterLevel;
    let best = null;
    const headings = [0, 30, 60, 90, 120, 150];
    for (let gx = -8; gx <= 8; gx++) {
      for (let gz = -8; gz <= 8; gz++) {
        const x = cx + gx * 600, z = cz + gz * 600;
        for (const hd of headings) {
          const a = (hd * Math.PI) / 180;
          const dx = Math.sin(a), dz = -Math.cos(a);
          let sum = 0, sum2 = 0, mn = Infinity, cnt = 0;
          for (let i = -6; i <= 6; i++) {
            for (let j = -1; j <= 1; j++) {
              const u = (i / 6) * (L / 2 + 300);
              const v = j * 180;
              const px = x + dx * u - dz * v;
              const pz = z + dz * u + dx * v;
              const h = this.base(px, pz);
              sum += h; sum2 += h * h; mn = Math.min(mn, h); cnt++;
            }
          }
          const mean = sum / cnt;
          const std = Math.sqrt(Math.max(0, sum2 / cnt - mean * mean));
          let cost = std + Math.max(0, wl + 12 - mn) * 4 + Math.hypot(gx, gz) * 6;
          // keep the airport out of the city
          if (this.def.city && Math.hypot(x - this.def.city.x, z - this.def.city.z) < this.def.city.radius + 2600) cost += 1e5;
          if (this.def.id === 'canyon') cost += Math.max(0, 300 - mean) * 2; // keep on plateau
          if (!best || cost < best.cost) best = { x, z, heading: hd, cost, mean };
        }
      }
    }
    const elev = Math.max(best.mean, wl + 10);
    const a = (best.heading * Math.PI) / 180;
    this.airbase = {
      x: best.x, z: best.z, heading: best.heading, elevation: elev,
      dirX: Math.sin(a), dirZ: -Math.cos(a),
      length: L, width: 50,
      halfL: L / 2 + 350, halfW: 420, blend: 650,
    };
  }

  // Local runway coordinates: u along runway, v to the right
  toAirbaseLocal(x, z) {
    const ab = this.airbase;
    const rx = x - ab.x, rz = z - ab.z;
    return { u: rx * ab.dirX + rz * ab.dirZ, v: rx * -ab.dirZ + rz * ab.dirX };
  }

  fromAirbaseLocal(u, v) {
    const ab = this.airbase;
    return { x: ab.x + ab.dirX * u - ab.dirZ * v, z: ab.z + ab.dirZ * u + ab.dirX * v };
  }

  heightAt(x, z) {
    let h = this.base(x, z);
    const ab = this.airbase;
    if (ab) {
      const rx = x - ab.x, rz = z - ab.z;
      if (Math.abs(rx) < ab.halfL + ab.blend + ab.halfW && Math.abs(rz) < ab.halfL + ab.blend + ab.halfW) {
        const u = rx * ab.dirX + rz * ab.dirZ;
        const v = rx * -ab.dirZ + rz * ab.dirX;
        const du = Math.max(0, Math.abs(u) - ab.halfL);
        const dv = Math.max(0, Math.abs(v) - ab.halfW);
        const d = Math.hypot(du, dv);
        if (d < ab.blend) {
          const t = smoothstep(0, ab.blend, d);
          h = lerp(ab.elevation, h, t);
        }
      }
    }
    return h;
  }

  // Height of the surface an aircraft can hit: terrain, water or a building
  // whose underside is below height y (so you can fly under a bridge)
  surfaceAt(x, z, y = Infinity) {
    const h = Math.max(this.heightAt(x, z), this.waterLevel);
    if (this.city) {
      const t = this.city.obstacleTop(x, z, y);
      if (t > h) return t;
    }
    return h;
  }

  buildingTopAt(x, z, y = Infinity) {
    return this.city ? this.city.obstacleTop(x, z, y) : -Infinity;
  }

  isUrban(x, z) {
    if (!this.city) return 0;
    return this.city.typeAt(x, z);
  }

  normalAt(x, z, out) {
    const e = 3;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    let nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const len = Math.hypot(nx, ny, nz);
    out.x = nx / len; out.y = ny / len; out.z = nz / len;
    return out;
  }

  isOnRunway(x, z) {
    const { u, v } = this.toAirbaseLocal(x, z);
    return Math.abs(u) < this.airbase.length / 2 + 40 && Math.abs(v) < this.airbase.width / 2 + 6;
  }

  // Find a reasonably flat land location near (x,z) for ground units.
  findLandSpot(x, z, radius, rand, opts = {}) {
    const minAbove = opts.minAboveWater ?? 6;
    const maxSlope = opts.maxSlope ?? 0.25;
    const n = { x: 0, y: 1, z: 0 };
    let best = null;
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = this.heightAt(px, pz);
      if (h < this.waterLevel + minAbove) continue;
      if (this.airbase && Math.hypot(px - this.airbase.x, pz - this.airbase.z) < 2200 && !opts.allowAirbase) continue;
      if (this.city && !opts.allowUrban) {
        const t = this.city.typeAt(px, pz);
        if (t === 1 || t === 3) continue;
      }
      this.normalAt(px, pz, n);
      const slope = 1 - n.y;
      if (slope > maxSlope) continue;
      const score = slope + rand() * 0.05;
      if (!best || score < best.score) best = { x: px, z: pz, y: h, score };
      if (slope < 0.03) break;
    }
    if (!best) {
      const h = this.heightAt(x, z);
      best = { x, z, y: Math.max(h, this.waterLevel) };
    }
    return best;
  }

  // Find open water near (x,z) deep enough for ships.
  findWaterSpot(x, z, radius, rand, minDepth = 25) {
    let best = null;
    for (let i = 0; i < 120; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const depth = this.waterLevel - this.heightAt(px, pz);
      if (depth < minDepth) continue;
      // make sure the surroundings are water too
      let ok = true;
      for (let k = 0; k < 6 && ok; k++) {
        const b = (k / 6) * Math.PI * 2;
        if (this.waterLevel - this.heightAt(px + Math.cos(b) * 250, pz + Math.sin(b) * 250) < 8) ok = false;
      }
      if (!ok) continue;
      best = { x: px, z: pz, y: this.waterLevel };
      break;
    }
    return best;
  }

  maxHeightAround(x, z, r) {
    let m = -Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) m = Math.max(m, this.heightAt(x + (i * r) / 2, z + (j * r) / 2));
    return m;
  }
}

export function sunDirection(elevationDeg, azimuthDeg, out) {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  out.x = Math.sin(az) * Math.cos(el);
  out.y = Math.sin(el);
  out.z = -Math.cos(az) * Math.cos(el);
  return out;
}

export function resolveLighting(mapDef, timeKey) {
  const base = { ...mapDef.lighting };
  if (timeKey && timeKey !== 'default' && TIME_PRESETS[timeKey]) {
    const p = TIME_PRESETS[timeKey];
    return {
      elevation: p.elevation,
      azimuth: base.azimuth + p.azimuthOffset,
      turbidity: p.turbidity,
      rayleigh: p.rayleigh,
      mie: p.mie,
      mieG: p.mieG,
      exposure: p.exposure,
      night: !!p.night,
      moonElevation: p.moonElevation,
      moonAzimuth: p.moonAzimuthOffset !== undefined ? base.azimuth + p.moonAzimuthOffset : undefined,
    };
  }
  return base;
}

export { clamp };

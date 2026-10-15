// Graphics quality presets + device detection so the game scales from phones
// and integrated GPUs up to high-end desktop cards.

export const PRESETS = {
  low: {
    label: 'Low',
    pixelRatio: 0.85,
    maxPixelRatio: 1,
    antialias: false,
    postFX: false,
    msaa: 0,
    shadows: false,
    shadowSize: 0,
    terrainSegments: 16,
    lodFactor: 1.5,
    minNodeSize: 640,
    viewDistance: 26000,
    clouds: 0.35,
    trees: 0,
    particles: 900,
    waterDetail: 0,
    textureSize: 512,
    envSize: 64,
    lensflare: false,
    chunkBudgetMs: 3,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1,
    maxPixelRatio: 1.25,
    antialias: true,
    postFX: false,
    msaa: 0,
    shadows: true,
    shadowSize: 1024,
    terrainSegments: 32,
    lodFactor: 1.5,
    minNodeSize: 400,
    viewDistance: 32000,
    clouds: 0.6,
    trees: 0.5,
    particles: 1600,
    waterDetail: 1,
    textureSize: 1024,
    envSize: 128,
    lensflare: true,
    chunkBudgetMs: 4,
  },
  high: {
    label: 'High',
    pixelRatio: 1,
    maxPixelRatio: 1.5,
    antialias: false,
    postFX: true,
    msaa: 4,
    shadows: true,
    shadowSize: 2048,
    terrainSegments: 48,
    lodFactor: 1.6,
    minNodeSize: 320,
    viewDistance: 40000,
    clouds: 0.85,
    trees: 1.0,
    particles: 2600,
    waterDetail: 2,
    textureSize: 1024,
    envSize: 256,
    lensflare: true,
    chunkBudgetMs: 5,
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 1,
    maxPixelRatio: 2,
    antialias: false,
    postFX: true,
    msaa: 4,
    shadows: true,
    shadowSize: 4096,
    terrainSegments: 64,
    lodFactor: 1.75,
    minNodeSize: 256,
    viewDistance: 50000,
    clouds: 1.0,
    trees: 1.6,
    particles: 4000,
    waterDetail: 2,
    textureSize: 2048,
    envSize: 256,
    lensflare: true,
    chunkBudgetMs: 6,
  },
};

export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (touch && /Macintosh/.test(ua));
}

export function detectQuality(gl) {
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch (e) {
    /* ignore */
  }
  const g = gpu.toLowerCase();
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = isMobileDevice();
  let tier = 'high';
  if (mobile) {
    tier = /apple gpu|adreno \(tm\) (7[3-9]\d|8\d\d)|mali-g7[1-9]|immortalis/.test(g) ? 'medium' : 'low';
  } else if (/swiftshader|llvmpipe|software|microsoft basic/.test(g)) {
    tier = 'low';
  } else if (/intel/.test(g) && !/arc/.test(g)) {
    tier = /iris xe|iris\(r\) xe/.test(g) ? 'medium' : 'low';
  } else if (/rtx (30|40|50)\d\d|rx (6[7-9]|7[6-9])\d\d|apple m[1-4] (pro|max|ultra)/.test(g)) {
    tier = 'ultra';
  } else if (/apple m[1-4]/.test(g)) {
    tier = 'high';
  }
  if (mem <= 2 || cores <= 2) tier = 'low';
  else if (mem <= 4 && tier !== 'low') tier = 'medium';
  return { tier, gpu, mobile };
}

// Adjusts render scale at runtime to hold a target frame rate.
export class DynamicResolution {
  constructor() {
    this.scale = 1;
    this.min = 0.55;
    this.max = 1;
    this.frameTimes = [];
    this.cooldown = 0;
    this.enabled = true;
    this.targetMs = 1000 / 55;
  }

  update(dtMs) {
    if (!this.enabled) return false;
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    this.cooldown -= dtMs;
    if (this.cooldown > 0 || this.frameTimes.length < 30) return false;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let changed = false;
    if (median > this.targetMs * 1.18 && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale - 0.08);
      changed = true;
    } else if (median < this.targetMs * 0.8 && this.scale < this.max) {
      this.scale = Math.min(this.max, this.scale + 0.05);
      changed = true;
    }
    if (changed) {
      this.cooldown = 1500;
      this.frameTimes.length = 0;
    }
    return changed;
  }
}

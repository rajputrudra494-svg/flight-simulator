// Per-aircraft cockpit layouts. Airliner windows are convex quads given as
// [azimuth, elevation] corners in degrees seen from the centre of the flight
// deck at eye height (left side; mirrored to the right), ordered bottom-inner,
// bottom-outer, top-outer, top-inner. Display positions are metres on the
// main instrument panel: x from the centreline (right +), y down from the
// panel top edge. Fighter panels use the same convention; gauges are round
// analogue instruments (see cockpitDisplays.js) and displays name the page
// they show.

// ---------------------------------------------------------------------------
// Airliners
// ---------------------------------------------------------------------------
const sq = (page, x, y, s, extra = {}) => ({ page, x, y, w: s, h: s, ...extra });

export const AIRLINER_COCKPITS = {
  a320: {
    maker: 'airbus', style: 'airbus', control: 'sidestick', engines: 2, hw: 1.28, panelHW: 0.8,
    windows: [
      { pts: [[3.2, -9.5], [40, -11.5], [38, 18], [3.2, 21]], r: 1.6 },
      { pts: [[46, -12], [88, -10], [86, 15.5], [44.5, 17.5]], r: 3.5 },
      { pts: [[95, -9], [122, -6], [120, 10.5], [95, 13]], r: 3.5 },
    ],
    displays: [sq('pfd', -0.6, 0.13, 0.184), sq('nd', -0.37, 0.13, 0.184), sq('ewd', 0, 0.12, 0.184), sq('sd', 0, 0.33, 0.17), sq('nd', 0.37, 0.13, 0.184), sq('pfd', 0.6, 0.13, 0.184), sq('standby', -0.19, 0.09, 0.075)],
  },
  b737: {
    maker: 'boeing', style: 'boeing', control: 'yoke', engines: 2, hw: 1.25, panelHW: 0.82,
    windows: [
      { pts: [[3, -10], [33, -12], [32, 18], [3, 20]], r: 1.2 },
      { pts: [[38, -12], [66, -11], [64, 16.5], [37, 18]], r: 1.5 },
      { pts: [[72, -9], [104, -6], [102, 13], [72, 15]], r: 2.5 },
    ],
    displays: [
      { page: 'pfd', x: -0.6, y: 0.14, w: 0.25, h: 0.19 }, { page: 'nd', x: -0.32, y: 0.14, w: 0.25, h: 0.19 },
      { page: 'ewd', x: 0, y: 0.12, w: 0.22, h: 0.17 }, { page: 'sd', x: 0, y: 0.32, w: 0.18, h: 0.14 },
      { page: 'nd', x: 0.32, y: 0.14, w: 0.25, h: 0.19 }, { page: 'pfd', x: 0.6, y: 0.14, w: 0.25, h: 0.19 },
      sq('standby', -0.16, 0.3, 0.07),
    ],
  },
  b777: {
    maker: 'boeing', style: 'boeing', control: 'yoke', engines: 2, hw: 1.5, panelHW: 0.95,
    windows: [
      { pts: [[3.2, -10], [42, -12.5], [39, 19], [3.2, 22]], r: 1.6 },
      { pts: [[48, -12.5], [86, -10.5], [84, 16], [46, 18]], r: 3 },
      { pts: [[93, -9], [118, -6], [116, 11], [93, 13]], r: 3 },
    ],
    displays: [sq('pfd', -0.69, 0.13, 0.2), sq('nd', -0.45, 0.13, 0.2), sq('ewd', 0, 0.13, 0.2), sq('sd', 0, 0.36, 0.19), sq('nd', 0.45, 0.13, 0.2), sq('pfd', 0.69, 0.13, 0.2), sq('standby', -0.22, 0.1, 0.075)],
  },
  b747: {
    maker: 'boeing', style: 'boeing', control: 'yoke', engines: 4, hw: 1.45, panelHW: 0.92,
    windows: [
      { pts: [[3, -9.5], [37, -11.5], [35, 17], [3, 20]], r: 1.4 },
      { pts: [[43, -11], [78, -10], [76, 15], [42, 17]], r: 2.5 },
      { pts: [[85, -8.5], [108, -6], [106, 10], [85, 12]], r: 2.5 },
    ],
    displays: [sq('pfd', -0.66, 0.13, 0.2), sq('nd', -0.43, 0.13, 0.2), sq('ewd', 0, 0.13, 0.2), sq('sd', 0, 0.36, 0.19), sq('nd', 0.43, 0.13, 0.2), sq('pfd', 0.66, 0.13, 0.2), sq('standby', -0.21, 0.1, 0.075)],
  },
  a380: {
    maker: 'airbus', style: 'airbus', control: 'sidestick', engines: 4, hw: 1.6, panelHW: 1.0,
    windows: [
      { pts: [[3.5, -10], [41, -12.5], [38, 19], [3.5, 22]], r: 1.8 },
      { pts: [[47, -12.5], [90, -10.5], [88, 16], [45, 18]], r: 3.5 },
      { pts: [[97, -9], [122, -6], [120, 11], [97, 13]], r: 3.5 },
    ],
    displays: [
      { page: 'ois', x: -0.84, y: 0.15, w: 0.15, h: 0.2 }, { page: 'pfd', x: -0.64, y: 0.15, w: 0.17, h: 0.21 }, { page: 'nd', x: -0.43, y: 0.15, w: 0.17, h: 0.21 },
      { page: 'ewd', x: 0, y: 0.13, w: 0.17, h: 0.21 }, { page: 'sd', x: 0, y: 0.37, w: 0.16, h: 0.19 },
      { page: 'nd', x: 0.43, y: 0.15, w: 0.17, h: 0.21 }, { page: 'pfd', x: 0.64, y: 0.15, w: 0.17, h: 0.21 }, { page: 'ois', x: 0.84, y: 0.15, w: 0.15, h: 0.2 },
      sq('standby', -0.22, 0.09, 0.075),
    ],
  },
  b787: {
    maker: 'boeing', style: 'boeing', control: 'yoke', engines: 2, hw: 1.42, panelHW: 0.92,
    windows: [
      { pts: [[3.2, -10], [43, -12.5], [40, 19], [3.2, 22]], r: 2.2 },
      { pts: [[49, -12.5], [88, -10.5], [86, 16], [47, 18]], r: 3.5 },
    ],
    // five large-format displays across the panel
    displays: [
      { page: 'pfd', x: -0.66, y: 0.15, w: 0.24, h: 0.19 }, { page: 'nd', x: -0.37, y: 0.15, w: 0.24, h: 0.19 },
      { page: 'ewd', x: 0, y: 0.15, w: 0.24, h: 0.19 }, { page: 'nd', x: 0.37, y: 0.15, w: 0.24, h: 0.19 },
      { page: 'pfd', x: 0.66, y: 0.15, w: 0.24, h: 0.19 }, sq('standby', -0.17, 0.34, 0.07),
    ],
  },
  concorde: {
    maker: 'concorde', style: 'concorde', control: 'ramhorn', engines: 4, hw: 1.0, panelHW: 0.68, narrow: true,
    windows: [
      { pts: [[3, -6.5], [26, -7.5], [25, 9], [3, 10]], r: 1.2 },
      { pts: [[31, -7.5], [56, -7], [55, 9], [30, 10]], r: 1.4 },
      { pts: [[64, -5], [86, -4], [85, 7], [64, 8]], r: 2.5 },
    ],
    analog: {
      gauges: [
        // captain: ADI over HSI with speed / altitude / Mach and vertical speed around them
        { type: 'adi', x: -0.47, y: 0.12, r: 0.055 }, { type: 'hsi', x: -0.47, y: 0.27, r: 0.05 },
        { type: 'asi', x: -0.6, y: 0.12, r: 0.042 }, { type: 'alt', x: -0.34, y: 0.12, r: 0.042 },
        { type: 'mach', x: -0.6, y: 0.24, r: 0.035 }, { type: 'vsi', x: -0.34, y: 0.24, r: 0.035 },
        // first officer
        { type: 'adi', x: 0.47, y: 0.12, r: 0.055 }, { type: 'hsi', x: 0.47, y: 0.27, r: 0.05 },
        { type: 'asi', x: 0.34, y: 0.12, r: 0.042 }, { type: 'alt', x: 0.6, y: 0.12, r: 0.042 },
        { type: 'mach', x: 0.34, y: 0.24, r: 0.035 }, { type: 'vsi', x: 0.6, y: 0.24, r: 0.035 },
        // centre engine instruments: four engines, rows of N1 / EGT / fuel flow
        { type: 'eng', x: 0, y: 0.17, r: 0.13, engines: 4, rows: 4 },
        { type: 'clock', x: -0.21, y: 0.06, r: 0.022 }, { type: 'clock', x: 0.21, y: 0.06, r: 0.022 },
      ],
    },
  },
  an124: {
    maker: 'soviet', style: 'soviet', control: 'yoke', engines: 4, hw: 1.6, panelHW: 1.0, metric: true,
    windows: [
      { pts: [[2.5, -12], [22, -13.5], [21.5, 14], [2.5, 15.5]], r: 1.0 },
      { pts: [[26, -13.5], [48, -13], [47, 14], [25.5, 15]], r: 1.0 },
      { pts: [[52, -13], [80, -11], [78, 14], [51.5, 14.5]], r: 1.4 },
      { pts: [[86, -9], [108, -6], [106, 11], [86, 13]], r: 2.5 },
    ],
    analog: {
      gauges: [
        { type: 'adi', x: -0.6, y: 0.13, r: 0.06 }, { type: 'hsi', x: -0.6, y: 0.29, r: 0.055 },
        { type: 'asi', x: -0.75, y: 0.13, r: 0.045 }, { type: 'alt', x: -0.45, y: 0.13, r: 0.045 },
        { type: 'vsi', x: -0.45, y: 0.27, r: 0.04 }, { type: 'g', x: -0.75, y: 0.27, r: 0.035 },
        { type: 'adi', x: 0.6, y: 0.13, r: 0.06 }, { type: 'hsi', x: 0.6, y: 0.29, r: 0.055 },
        { type: 'asi', x: 0.45, y: 0.13, r: 0.045 }, { type: 'alt', x: 0.75, y: 0.13, r: 0.045 },
        { type: 'vsi', x: 0.75, y: 0.27, r: 0.04 }, { type: 'g', x: 0.45, y: 0.27, r: 0.035 },
        { type: 'eng', x: 0, y: 0.18, r: 0.15, engines: 4, rows: 4 },
        { type: 'annun', x: -0.25, y: 0.06, r: 0.06, cols: 4, rows: 2 }, { type: 'annun', x: 0.25, y: 0.06, r: 0.06, cols: 4, rows: 2 },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Fighters
// ---------------------------------------------------------------------------
const mfd = (page, x, y, s, extra = {}) => ({ page, x, y, w: s, h: s, osb: true, ...extra });
const adiCluster = (x, y, k = 1) => [
  { type: 'adi', x, y, r: 0.036 * k }, { type: 'asi', x: x - 0.082 * k, y: y - 0.01, r: 0.028 * k },
  { type: 'alt', x: x + 0.082 * k, y: y - 0.01, r: 0.028 * k }, { type: 'hsi', x, y: y + 0.088 * k, r: 0.034 * k },
];

export const FIGHTER_COCKPITS = {
  f16: {
    style: 'fighter', stick: 'side', hud: 'wide', panelW: 0.6, color: false,
    displays: [mfd('radar', -0.2, 0.2, 0.1), mfd('sms', 0.2, 0.2, 0.1, { tgp: true }), { page: 'ded', x: 0, y: 0.045, w: 0.09, h: 0.03 }],
    gauges: [...adiCluster(0, 0.17, 0.9), { type: 'rpm', x: 0.27, y: 0.06, r: 0.022 }, { type: 'egt', x: 0.27, y: 0.115, r: 0.022 }, { type: 'aoa', x: -0.27, y: 0.07, r: 0.02 }],
    ufc: { x: 0, y: 0.075, w: 0.11, h: 0.04 },
  },
  f22: {
    style: 'fighterDark', stick: 'side', hud: 'single', panelW: 0.7, color: true,
    displays: [mfd('tsd', 0, 0.2, 0.2, { tgp: false }), mfd('radar', -0.23, 0.16, 0.155), mfd('sms', 0.23, 0.16, 0.155, { tgp: true }), mfd('eng', 0, 0.38, 0.13), { page: 'ded', x: -0.1, y: 0.04, w: 0.075, h: 0.055, color: true }, { page: 'rwr', x: 0.1, y: 0.04, w: 0.075, h: 0.055 }],
    gauges: [],
  },
  f35: {
    style: 'fighterDark', stick: 'side', hud: 'none', panelW: 0.66, color: true,
    displays: [{ page: 'pano', x: 0, y: 0.15, w: 0.5, h: 0.2, tgpRect: [0.75, 0.0, 1.0, 0.5] }, { page: 'standby', x: 0, y: 0.3, w: 0.06, h: 0.045 }],
    gauges: [],
  },
  fa18: {
    style: 'fighter', stick: 'center', hud: 'single', panelW: 0.64, color: true,
    displays: [mfd('radar', -0.21, 0.12, 0.127), mfd('sms', 0.21, 0.12, 0.127, { tgp: true }), mfd('tsd', 0, 0.26, 0.15), { page: 'ded', x: 0, y: 0.05, w: 0.1, h: 0.04, color: true }],
    gauges: [{ type: 'adi', x: -0.24, y: 0.27, r: 0.025 }, { type: 'alt', x: 0.24, y: 0.27, r: 0.025 }],
    ufc: { x: 0, y: 0.085, w: 0.12, h: 0.035 },
  },
  typhoon: {
    style: 'fighterDark', stick: 'center', hud: 'single', panelW: 0.64, color: true,
    displays: [mfd('radar', -0.2, 0.18, 0.155), mfd('tsd', 0, 0.2, 0.155), mfd('sms', 0.2, 0.18, 0.155, { tgp: true })],
    gauges: [{ type: 'adi', x: -0.27, y: 0.05, r: 0.018 }, { type: 'alt', x: 0.27, y: 0.05, r: 0.018 }],
    ufc: { x: 0, y: 0.05, w: 0.14, h: 0.035 },
  },
  rafale: {
    style: 'fighterDark', stick: 'side', hud: 'single', panelW: 0.6, color: true,
    displays: [{ page: 'tsd', x: 0, y: 0.1, w: 0.2, h: 0.13 }, mfd('radar', -0.2, 0.2, 0.125), mfd('sms', 0.2, 0.2, 0.125, { tgp: true }), mfd('eng', 0, 0.27, 0.11)],
    gauges: [],
  },
  gripen: {
    style: 'fighterDark', stick: 'center', hud: 'single', panelW: 0.6, color: true,
    displays: [{ page: 'radar', x: -0.19, y: 0.18, w: 0.15, h: 0.19, osb: true }, { page: 'tsd', x: 0, y: 0.18, w: 0.15, h: 0.19, osb: true }, { page: 'sms', x: 0.19, y: 0.18, w: 0.15, h: 0.19, osb: true, tgp: true }],
    gauges: [],
    ufc: { x: 0, y: 0.035, w: 0.12, h: 0.03 },
  },
  tejas: {
    style: 'fighterDark', stick: 'center', hud: 'single', panelW: 0.58, color: true,
    displays: [mfd('radar', -0.19, 0.17, 0.127), mfd('sms', 0.19, 0.17, 0.127, { tgp: true }), mfd('tsd', 0, 0.25, 0.1)],
    gauges: [{ type: 'adi', x: 0, y: 0.1, r: 0.03 }],
    ufc: { x: 0, y: 0.035, w: 0.12, h: 0.03 },
  },
  mirage: {
    style: 'fighter', stick: 'center', hud: 'single', panelW: 0.58, color: false,
    displays: [{ page: 'radar', x: 0, y: 0.09, w: 0.12, h: 0.1 }, mfd('tsd', 0.2, 0.2, 0.1)],
    gauges: [...adiCluster(-0.12, 0.2, 0.95), { type: 'rpm', x: 0.12, y: 0.17, r: 0.026 }, { type: 'egt', x: 0.12, y: 0.25, r: 0.024 }, { type: 'fuel', x: 0.25, y: 0.07, r: 0.022 }, { type: 'mach', x: -0.25, y: 0.07, r: 0.022 }],
  },
  f15: {
    style: 'fighter', stick: 'center', hud: 'single', panelW: 0.66, color: false,
    displays: [{ page: 'radar', x: -0.19, y: 0.12, w: 0.12, h: 0.12 }, { page: 'rwr', x: 0.22, y: 0.26, w: 0.09, h: 0.09 }],
    gauges: [...adiCluster(0, 0.17, 1), { type: 'rpm', x: 0.18, y: 0.1, r: 0.024 }, { type: 'rpm', x: 0.24, y: 0.1, r: 0.024 }, { type: 'egt', x: 0.18, y: 0.16, r: 0.024 }, { type: 'egt', x: 0.24, y: 0.16, r: 0.024 }, { type: 'aoa', x: -0.18, y: 0.26, r: 0.022 }, { type: 'vsi', x: -0.24, y: 0.26, r: 0.022 }, { type: 'g', x: 0.29, y: 0.06, r: 0.018 }],
    ufc: { x: 0, y: 0.04, w: 0.13, h: 0.035 },
  },
  f14: {
    style: 'fighter', stick: 'center', hud: 'single', panelW: 0.68, color: false,
    displays: [{ page: 'radar', x: 0, y: 0.1, w: 0.13, h: 0.11 }, { page: 'tsd', x: 0, y: 0.25, w: 0.13, h: 0.12 }],
    gauges: [{ type: 'asi', x: -0.13, y: 0.1, r: 0.03 }, { type: 'alt', x: 0.13, y: 0.1, r: 0.03 }, { type: 'aoa', x: -0.13, y: 0.18, r: 0.026 }, { type: 'vsi', x: 0.13, y: 0.18, r: 0.026 }, { type: 'adi', x: -0.13, y: 0.27, r: 0.03 }, { type: 'g', x: 0.13, y: 0.27, r: 0.024 }, { type: 'rpm', x: 0.24, y: 0.1, r: 0.022 }, { type: 'rpm', x: 0.29, y: 0.1, r: 0.022 }, { type: 'egt', x: 0.24, y: 0.16, r: 0.022 }, { type: 'egt', x: 0.29, y: 0.16, r: 0.022 }, { type: 'fuel', x: 0.265, y: 0.24, r: 0.026 }, { type: 'clock', x: -0.25, y: 0.1, r: 0.02 }],
  },
  a10: {
    style: 'fighter', stick: 'center', hud: 'single', panelW: 0.7, color: true,
    displays: [mfd('tsd', -0.2, 0.15, 0.127), mfd('sms', 0.2, 0.15, 0.127, { tgp: true })],
    gauges: [...adiCluster(0, 0.16, 1), { type: 'rpm', x: 0.31, y: 0.08, r: 0.02 }, { type: 'rpm', x: 0.31, y: 0.13, r: 0.02 }, { type: 'egt', x: 0.31, y: 0.18, r: 0.02 }, { type: 'fuel', x: 0.31, y: 0.25, r: 0.024 }, { type: 'aoa', x: -0.31, y: 0.1, r: 0.02 }],
    ufc: { x: 0, y: 0.04, w: 0.12, h: 0.03 },
  },
  mig21: {
    style: 'fighterRu', stick: 'center', hud: 'ru', panelW: 0.52, color: false, metric: true,
    displays: [{ page: 'radar', x: 0, y: 0.075, w: 0.09, h: 0.08 }],
    gauges: [{ type: 'adi', x: 0, y: 0.2, r: 0.04 }, { type: 'asi', x: -0.11, y: 0.15, r: 0.032 }, { type: 'alt', x: 0.11, y: 0.15, r: 0.032 }, { type: 'mach', x: -0.11, y: 0.24, r: 0.028 }, { type: 'vsi', x: 0.11, y: 0.24, r: 0.028 }, { type: 'rpm', x: 0.2, y: 0.08, r: 0.024 }, { type: 'egt', x: 0.2, y: 0.15, r: 0.024 }, { type: 'g', x: -0.2, y: 0.08, r: 0.022 }, { type: 'fuel', x: 0.2, y: 0.23, r: 0.024 }, { type: 'clock', x: -0.2, y: 0.15, r: 0.02 }],
  },
  mig29: {
    style: 'fighterRu', stick: 'center', hud: 'ru', panelW: 0.6, color: false, metric: true,
    displays: [{ page: 'radar', x: 0.17, y: 0.08, w: 0.1, h: 0.085 }],
    gauges: [{ type: 'adi', x: 0, y: 0.13, r: 0.04 }, { type: 'hsi', x: 0, y: 0.25, r: 0.036 }, { type: 'asi', x: -0.1, y: 0.12, r: 0.03 }, { type: 'alt', x: 0.1, y: 0.12, r: 0.03 }, { type: 'vsi', x: 0.1, y: 0.22, r: 0.026 }, { type: 'aoa', x: -0.1, y: 0.22, r: 0.026 }, { type: 'rpm', x: 0.21, y: 0.2, r: 0.022 }, { type: 'rpm', x: 0.26, y: 0.2, r: 0.022 }, { type: 'egt', x: 0.21, y: 0.26, r: 0.022 }, { type: 'egt', x: 0.26, y: 0.26, r: 0.022 }, { type: 'g', x: -0.22, y: 0.1, r: 0.022 }, { type: 'annun', x: -0.22, y: 0.24, r: 0.05, cols: 3, rows: 3 }],
  },
  su35: {
    style: 'fighterDark', stick: 'center', hud: 'ru', panelW: 0.72, color: true, metric: true,
    displays: [{ page: 'tsd', x: -0.15, y: 0.17, w: 0.26, h: 0.2, osb: true }, { page: 'radar', x: 0.15, y: 0.17, w: 0.26, h: 0.2, osb: true, tgp: true }, { page: 'ded', x: 0, y: 0.32, w: 0.1, h: 0.05, color: true }],
    gauges: [{ type: 'adi', x: -0.32, y: 0.08, r: 0.02 }, { type: 'alt', x: 0.32, y: 0.08, r: 0.02 }],
  },
  su57: {
    style: 'fighterDark', stick: 'center', hud: 'ru', panelW: 0.78, color: true, metric: true,
    displays: [{ page: 'tsd', x: -0.17, y: 0.18, w: 0.3, h: 0.22, osb: true }, { page: 'radar', x: 0.17, y: 0.18, w: 0.3, h: 0.22, osb: true, tgp: true }, { page: 'eng', x: -0.34, y: 0.07, w: 0.08, h: 0.08 }, { page: 'rwr', x: 0.34, y: 0.07, w: 0.08, h: 0.08 }],
    gauges: [],
  },
  // bombers and specials: the B-2's eight colour MFDs, the B-1's and B-52's
  // mixed analogue / glass panels, the Blackbird's all-steam gauges
  b2: {
    style: 'fighterDark', stick: 'center', hud: 'none', panelW: 0.82, color: true,
    displays: [mfd('tsd', -0.3, 0.15, 0.14), mfd('radar', -0.1, 0.15, 0.14), mfd('sms', 0.1, 0.15, 0.14, { tgp: true }), mfd('eng', 0.3, 0.15, 0.14), { page: 'ded', x: 0, y: 0.04, w: 0.12, h: 0.035, color: true }],
    gauges: [],
  },
  b1b: {
    style: 'fighter', stick: 'center', hud: 'none', panelW: 0.76, color: true,
    displays: [mfd('tsd', -0.24, 0.15, 0.13), mfd('sms', 0.24, 0.15, 0.13, { tgp: true })],
    gauges: [...adiCluster(0, 0.16, 1), { type: 'rpm', x: 0.34, y: 0.08, r: 0.02 }, { type: 'egt', x: 0.34, y: 0.13, r: 0.02 }, { type: 'mach', x: -0.34, y: 0.08, r: 0.02 }, { type: 'fuel', x: -0.34, y: 0.14, r: 0.022 }],
  },
  b52: {
    style: 'fighter', stick: 'center', hud: 'none', panelW: 0.82, color: false,
    displays: [{ page: 'tsd', x: 0.0, y: 0.08, w: 0.13, h: 0.1 }],
    gauges: [
      ...adiCluster(-0.2, 0.17, 1), { type: 'vsi', x: -0.33, y: 0.25, r: 0.022 },
      { type: 'rpm', x: 0.14, y: 0.08, r: 0.018 }, { type: 'rpm', x: 0.19, y: 0.08, r: 0.018 }, { type: 'rpm', x: 0.24, y: 0.08, r: 0.018 }, { type: 'rpm', x: 0.29, y: 0.08, r: 0.018 },
      { type: 'egt', x: 0.14, y: 0.13, r: 0.018 }, { type: 'egt', x: 0.19, y: 0.13, r: 0.018 }, { type: 'egt', x: 0.24, y: 0.13, r: 0.018 }, { type: 'egt', x: 0.29, y: 0.13, r: 0.018 },
      { type: 'fuel', x: 0.21, y: 0.22, r: 0.026 }, { type: 'clock', x: 0.33, y: 0.22, r: 0.018 },
    ],
  },
  tu160: {
    style: 'fighterRu', stick: 'center', hud: 'none', panelW: 0.8, color: false, metric: true,
    displays: [{ page: 'radar', x: 0.0, y: 0.09, w: 0.12, h: 0.1 }],
    gauges: [{ type: 'adi', x: -0.2, y: 0.13, r: 0.04 }, { type: 'hsi', x: -0.2, y: 0.25, r: 0.034 }, { type: 'asi', x: -0.32, y: 0.12, r: 0.028 }, { type: 'alt', x: -0.08, y: 0.25, r: 0.028 }, { type: 'mach', x: -0.32, y: 0.22, r: 0.024 }, { type: 'rpm', x: 0.18, y: 0.1, r: 0.02 }, { type: 'rpm', x: 0.23, y: 0.1, r: 0.02 }, { type: 'rpm', x: 0.28, y: 0.1, r: 0.02 }, { type: 'rpm', x: 0.33, y: 0.1, r: 0.02 }, { type: 'egt', x: 0.18, y: 0.16, r: 0.02 }, { type: 'egt', x: 0.23, y: 0.16, r: 0.02 }, { type: 'egt', x: 0.28, y: 0.16, r: 0.02 }, { type: 'egt', x: 0.33, y: 0.16, r: 0.02 }, { type: 'annun', x: 0.25, y: 0.25, r: 0.05, cols: 3, rows: 3 }],
  },
  sr71: {
    style: 'fighter', stick: 'center', hud: 'none', panelW: 0.56, color: false,
    displays: [],
    gauges: [...adiCluster(0, 0.15, 1.05), { type: 'mach', x: -0.2, y: 0.08, r: 0.026 }, { type: 'vsi', x: -0.2, y: 0.17, r: 0.024 }, { type: 'rpm', x: 0.2, y: 0.08, r: 0.022 }, { type: 'rpm', x: 0.25, y: 0.08, r: 0.022 }, { type: 'egt', x: 0.2, y: 0.15, r: 0.022 }, { type: 'egt', x: 0.25, y: 0.15, r: 0.022 }, { type: 'fuel', x: 0.225, y: 0.23, r: 0.026 }, { type: 'g', x: -0.2, y: 0.25, r: 0.02 }],
  },
  f117: {
    style: 'fighterDark', stick: 'center', hud: 'single', panelW: 0.62, color: true,
    displays: [mfd('tsd', -0.19, 0.15, 0.12), mfd('sms', 0.19, 0.15, 0.12, { tgp: true }), { page: 'radar', x: 0, y: 0.24, w: 0.13, h: 0.11 }],
    gauges: [{ type: 'adi', x: 0, y: 0.1, r: 0.03 }],
    ufc: { x: 0, y: 0.035, w: 0.12, h: 0.03 },
  },
  mig31: {
    style: 'fighterRu', stick: 'center', hud: 'ru', panelW: 0.64, color: false, metric: true,
    displays: [{ page: 'radar', x: 0.17, y: 0.09, w: 0.11, h: 0.09 }, { page: 'tsd', x: -0.17, y: 0.09, w: 0.11, h: 0.09 }],
    gauges: [{ type: 'adi', x: 0, y: 0.14, r: 0.04 }, { type: 'hsi', x: 0, y: 0.26, r: 0.034 }, { type: 'asi', x: -0.1, y: 0.2, r: 0.026 }, { type: 'alt', x: 0.1, y: 0.2, r: 0.026 }, { type: 'mach', x: -0.1, y: 0.28, r: 0.024 }, { type: 'vsi', x: 0.1, y: 0.28, r: 0.024 }, { type: 'rpm', x: 0.23, y: 0.2, r: 0.02 }, { type: 'rpm', x: 0.28, y: 0.2, r: 0.02 }, { type: 'egt', x: 0.23, y: 0.26, r: 0.02 }, { type: 'egt', x: 0.28, y: 0.26, r: 0.02 }, { type: 'g', x: -0.25, y: 0.2, r: 0.02 }],
  },
  f4: {
    style: 'fighter', stick: 'center', hud: 'single', panelW: 0.62, color: false,
    displays: [{ page: 'radar', x: 0, y: 0.09, w: 0.12, h: 0.1 }],
    gauges: [...adiCluster(0, 0.21, 0.95), { type: 'rpm', x: 0.2, y: 0.08, r: 0.022 }, { type: 'rpm', x: 0.25, y: 0.08, r: 0.022 }, { type: 'egt', x: 0.2, y: 0.14, r: 0.022 }, { type: 'egt', x: 0.25, y: 0.14, r: 0.022 }, { type: 'aoa', x: -0.2, y: 0.09, r: 0.022 }, { type: 'g', x: -0.25, y: 0.14, r: 0.02 }, { type: 'fuel', x: 0.225, y: 0.22, r: 0.024 }],
  },
  j20: {
    style: 'fighterDark', stick: 'center', hud: 'single', panelW: 0.76, color: true,
    displays: [{ page: 'pano', x: 0, y: 0.16, w: 0.46, h: 0.2, tgpRect: [0.75, 0.0, 1.0, 0.5] }, mfd('eng', -0.31, 0.15, 0.1), mfd('rwr', 0.31, 0.15, 0.1)],
    gauges: [],
  },
};

export function airlinerProfile(id) {
  return AIRLINER_COCKPITS[id] || AIRLINER_COCKPITS.a320;
}

export function fighterProfile(id) {
  return FIGHTER_COCKPITS[id] || FIGHTER_COCKPITS.f16;
}

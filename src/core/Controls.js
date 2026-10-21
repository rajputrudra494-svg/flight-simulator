// Remappable control scheme. Every action has up to two keyboard / mouse codes
// and a list of gamepad buttons; the gamepad sticks (or a joystick / HOTAS)
// drive the flight axes through a configurable axis map with dead zone and
// response curve. The player's layout lives in settings.controls and is merged
// over the defaults, so actions added later always get a binding.

export const ACTION_GROUPS = [
  {
    name: 'Flight',
    actions: [
      ['pitchDown', 'Nose down (push)'],
      ['pitchUp', 'Nose up (pull)'],
      ['rollLeft', 'Roll left'],
      ['rollRight', 'Roll right'],
      ['yawLeft', 'Rudder left'],
      ['yawRight', 'Rudder right'],
      ['throttleUp', 'Throttle up'],
      ['throttleDown', 'Throttle down'],
      ['thr0', 'Throttle idle'],
      ['thr25', 'Throttle 25%'],
      ['thr50', 'Throttle 50%'],
      ['thr75', 'Throttle 75%'],
      ['thr90', 'Throttle military (90%)'],
      ['thr100', 'Throttle full / afterburner'],
    ],
  },
  {
    name: 'Weapons',
    actions: [
      ['gun', 'Fire gun'],
      ['missile', 'Fire missile / release bomb'],
      ['flare', 'Flares'],
      ['target', 'Next target'],
      ['lockView', 'Lock target in view'],
    ],
  },
  {
    name: 'Systems',
    actions: [
      ['gear', 'Landing gear'],
      ['brakes', 'Air brake / wheel brakes (hold)'],
      ['autobrake', 'Autobrake mode'],
      ['reverser', 'Thrust reversers / drag chute'],
      ['radio', 'ATC radio menu'],
    ],
  },
  {
    name: 'Camera',
    actions: [
      ['camera', 'Next camera view'],
      ['padlock', 'Padlock view'],
      ['lookLeft', 'Look left'],
      ['lookRight', 'Look right'],
      ['lookUp', 'Look up'],
      ['lookDown', 'Look down'],
      ['pause', 'Pause'],
    ],
  },
];

export const ACTION_IDS = ACTION_GROUPS.flatMap((g) => g.actions.map((a) => a[0]));
export const ACTION_LABELS = Object.fromEntries(ACTION_GROUPS.flatMap((g) => g.actions));

// Standard-mapping gamepad: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back,
// 9 Start, 10 L3, 11 R3, 12-15 D-pad up/down/left/right
const DEFAULT_KEYS = {
  pitchDown: ['KeyW', 'ArrowUp'],
  pitchUp: ['KeyS', 'ArrowDown'],
  rollLeft: ['KeyA', 'ArrowLeft'],
  rollRight: ['KeyD', 'ArrowRight'],
  yawLeft: ['KeyQ', null],
  yawRight: ['KeyE', null],
  throttleUp: ['ShiftLeft', 'KeyR'],
  throttleDown: ['KeyF', 'Minus'],
  thr0: ['Digit0', null],
  thr25: ['Digit1', null],
  thr50: ['Digit2', null],
  thr75: ['Digit3', null],
  thr90: ['Digit4', null],
  thr100: ['Digit5', null],
  gun: ['Space', null],
  missile: ['Enter', 'KeyX'],
  flare: ['KeyV', 'KeyZ'],
  target: ['KeyT', 'Tab'],
  lockView: ['KeyY', 'Mouse1'],
  gear: ['KeyG', null],
  brakes: ['KeyB', null],
  autobrake: ['KeyU', null],
  reverser: ['KeyJ', null],
  radio: ['KeyM', null],
  camera: ['KeyC', null],
  padlock: ['KeyL', null],
  lookLeft: ['Numpad4', null],
  lookRight: ['Numpad6', null],
  lookUp: ['Numpad8', null],
  lookDown: ['Numpad2', null],
  pause: ['KeyP', null],
};

const DEFAULT_PAD = {
  throttleUp: [5, 12], throttleDown: [4, 13], gun: [7], missile: [0, 6], flare: [1], target: [2],
  camera: [3], padlock: [11], gear: [8], brakes: [10], autobrake: [15], reverser: [14], pause: [9],
};

// stick axes: index into gamepad.axes, invert flag. -1 = unassigned.
const DEFAULT_AXES = {
  roll: { axis: 0, invert: false },
  pitch: { axis: 1, invert: false },
  yaw: { axis: 2, invert: false },
  lookY: { axis: 3, invert: false },
  throttle: { axis: -1, invert: true },
};

export const PRESETS = {
  standard: { label: 'Standard (WASD + arrows)', keys: DEFAULT_KEYS },
  leftHanded: {
    label: 'Left-handed (IJKL + numpad)',
    keys: {
      ...DEFAULT_KEYS,
      pitchDown: ['KeyI', 'ArrowUp'], pitchUp: ['KeyK', 'ArrowDown'], rollLeft: ['KeyJ', 'ArrowLeft'], rollRight: ['KeyL', 'ArrowRight'],
      yawLeft: ['KeyU', null], yawRight: ['KeyO', null], throttleUp: ['ShiftRight', 'NumpadAdd'], throttleDown: ['Slash', 'NumpadSubtract'],
      gun: ['Space', 'Numpad0'], missile: ['Enter', 'NumpadEnter'], flare: ['Semicolon', 'NumpadDecimal'], target: ['KeyH', 'Tab'],
      lockView: ['KeyN', 'Mouse1'], gear: ['KeyG', null], brakes: ['KeyB', null], autobrake: ['Period', null], reverser: ['Comma', null],
      radio: ['KeyM', null], camera: ['KeyC', null], padlock: ['KeyP', null], pause: ['Backquote', null],
      lookLeft: ['Numpad4', null], lookRight: ['Numpad6', null], lookUp: ['Numpad8', null], lookDown: ['Numpad5', null],
    },
  },
  arrows: {
    label: 'Arrow keys first (rudder on , and .)',
    keys: {
      ...DEFAULT_KEYS,
      pitchDown: ['ArrowUp', 'KeyW'], pitchUp: ['ArrowDown', 'KeyS'], rollLeft: ['ArrowLeft', 'KeyA'], rollRight: ['ArrowRight', 'KeyD'],
      yawLeft: ['Comma', 'KeyQ'], yawRight: ['Period', 'KeyE'], throttleUp: ['PageUp', 'ShiftLeft'], throttleDown: ['PageDown', 'KeyF'],
      gun: ['Space', null], missile: ['Enter', 'KeyX'], flare: ['ShiftRight', 'KeyV'],
    },
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function defaultControls() {
  return { keys: clone(DEFAULT_KEYS), pad: clone(DEFAULT_PAD), axes: clone(DEFAULT_AXES), deadzone: 0.12, expo: 0.5, keyRate: 1 };
}

// merge a saved layout over the defaults (tolerates missing or old data)
export function resolveControls(saved) {
  const d = defaultControls();
  if (!saved || typeof saved !== 'object') return d;
  for (const id of ACTION_IDS) {
    const k = saved.keys && saved.keys[id];
    if (Array.isArray(k)) d.keys[id] = [k[0] || null, k[1] || null];
    const p = saved.pad && saved.pad[id];
    if (Array.isArray(p)) d.pad[id] = p.filter((i) => Number.isInteger(i));
  }
  if (saved.axes) {
    for (const a of Object.keys(d.axes)) {
      const s = saved.axes[a];
      if (s && Number.isInteger(s.axis)) d.axes[a] = { axis: s.axis, invert: !!s.invert };
    }
  }
  for (const k of ['deadzone', 'expo', 'keyRate']) if (typeof saved[k] === 'number' && isFinite(saved[k])) d[k] = saved[k];
  return d;
}

export function applyPreset(ctrl, presetId) {
  const p = PRESETS[presetId];
  if (!p) return ctrl;
  ctrl.keys = clone(p.keys);
  return ctrl;
}

// keys the browser must keep (reload, fullscreen, dev tools) and the menu key
export const RESERVED_CODES = new Set(['Escape', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu']);

// actions already using a code (for conflict hints)
export function actionsUsing(ctrl, code, except = null) {
  if (!code) return [];
  return ACTION_IDS.filter((id) => id !== except && ctrl.keys[id] && ctrl.keys[id].includes(code));
}

const KEY_NAMES = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/',
  Semicolon: ';', Quote: "'", Backquote: '`', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', CapsLock: 'Caps',
  PageUp: 'PgUp', PageDown: 'PgDn', Home: 'Home', End: 'End', Insert: 'Ins', Delete: 'Del',
  NumpadEnter: 'Num Enter', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
  Mouse0: 'Mouse L', Mouse1: 'Mouse middle', Mouse2: 'Mouse R', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
};

export function codeName(code) {
  if (!code) return '';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-up', 'D-down', 'D-left', 'D-right', 'Home'];
export function padName(i) {
  return PAD_NAMES[i] || `Btn ${i}`;
}

const AXIS_NAMES = ['Left stick X', 'Left stick Y', 'Right stick X', 'Right stick Y'];
export function axisName(i) {
  if (i < 0) return 'None';
  return AXIS_NAMES[i] || `Axis ${i}`;
}

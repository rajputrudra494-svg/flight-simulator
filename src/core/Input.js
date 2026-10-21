// Unified input: keyboard, mouse (virtual stick with pointer lock), gamepad /
// joystick, touch and device tilt (gyro). Keyboard, mouse and gamepad buttons
// go through the player's remappable layout (see Controls.js). Produces a
// normalised control state every frame.
import { resolveControls, RESERVED_CODES } from './Controls.js';

function dz(v, dead) {
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * ((a - dead) / (1 - dead));
}

// response curve: expo 0 = linear, 1 = fully cubic-ish near the centre
function curve(v, expo) {
  return v * Math.abs(v) * expo + v * (1 - expo);
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.settings = { invertPitch: false, mouseFlight: false, sensitivity: 1 };
    this.controls = resolveControls(null);
    this.mouse = { x: 0, y: 0, down: [false, false, false, false, false], wheel: 0, locked: false, active: false, idle: 0 };
    this.mouseClick = new Set();
    this.touch = { active: false, x: 0, y: 0, throttle: null, gun: false, buttons: new Set() };
    // device tilt, written by the gyro controller (-1..1 each)
    this.gyro = { active: false, x: 0, y: 0 };
    this.state = {
      pitch: 0, roll: 0, yaw: 0, throttleRate: 0, throttleAbs: null,
      gun: false, missile: false, flare: false, target: false, camera: false, gear: false,
      airbrake: false, brakes: false, pause: false, lookX: 0, lookY: 0, look: false, view: false,
      lockView: false, autobrake: false, reverser: false, radio: false, radioQuick: false, menuPick: 0, menuClose: false,
    };
    // while the ATC menu is open the number keys pick an entry instead of setting the throttle
    this.menuMode = false;
    // the controls editor captures keys itself
    this.capturing = false;
    this.kb = { pitch: 0, roll: 0, yaw: 0 };
    this.gamepadIndex = null;
    this.lastDevice = 'keyboard';
    this.enabled = true;
    this._boundCodes = new Set();
    this.setControls(null);
    this._bind();
  }

  setControls(saved) {
    this.controls = resolveControls(saved);
    this._boundCodes.clear();
    for (const list of Object.values(this.controls.keys)) for (const c of list) if (c) this._boundCodes.add(c);
  }

  isBound(action, code) {
    const k = this.controls.keys[action];
    return !!(k && k.includes(code));
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (this.capturing) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const code = e.code;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      this.lastDevice = 'keyboard';
      // keep bound keys from scrolling the page or moving focus
      if ((this._boundCodes.has(code) || code === 'Space' || code.startsWith('Arrow')) && !RESERVED_CODES.has(code) && !e.ctrlKey && !e.metaKey) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down.fill(false);
    });
    const c = this.canvas;
    c.addEventListener('mousemove', (e) => {
      if (this.mouse.locked) {
        const s = 0.0028 * this.settings.sensitivity;
        this.mouse.x = Math.max(-1, Math.min(1, this.mouse.x + e.movementX * s));
        this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y + e.movementY * s));
        this.mouse.idle = 0;
        this.mouse.active = true;
        this.lastDevice = 'mouse';
      } else if (this.mouse.down[2] || this.mouse.down[1]) {
        this.state.lookX += e.movementX * 0.005;
        this.state.lookY += e.movementY * 0.005;
      }
    });
    c.addEventListener('mousedown', (e) => {
      if (e.button > 4) return;
      this.mouse.down[e.button] = true;
      this.mouseClick.add(e.button);
      if (this.settings.mouseFlight && !this.mouse.locked && this.enabled && e.button === 0) {
        c.requestPointerLock?.();
      }
      // side buttons would otherwise navigate the browser back / forward
      if (e.button >= 3) e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { if (e.button <= 4) this.mouse.down[e.button] = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === c;
      if (!this.mouse.locked) { this.mouse.x = 0; this.mouse.y = 0; }
    });
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
      this.lastDevice = 'gamepad';
    });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (const p of pads) if (p && p.connected) { this.gamepadIndex = p.index; return p; }
    return null;
  }

  // left and right mouse buttons only act as bindings in mouse flight (pointer
  // lock) so clicking the screen or right-dragging to look never fires anything
  _mouseUsable(n) {
    return n === 1 || n >= 3 || this.mouse.locked;
  }

  _codeDown(code) {
    if (!code) return false;
    if (code.startsWith('Mouse')) {
      const n = Number(code.slice(5));
      return !!this.mouse.down[n] && this._mouseUsable(n);
    }
    return this.keys.has(code);
  }

  _codeHit(code) {
    if (!code) return false;
    if (code.startsWith('Mouse')) {
      const n = Number(code.slice(5));
      return this.mouseClick.has(n) && this._mouseUsable(n);
    }
    return this.pressed.has(code);
  }

  update(dt) {
    const s = this.state;
    const K = this.controls.keys;
    const down = (a) => !!K[a] && (this._codeDown(K[a][0]) || this._codeDown(K[a][1]));
    const hit = (a) => !!K[a] && (this._codeHit(K[a][0]) || this._codeHit(K[a][1]));

    // Keyboard axes with smoothing so taps give gentle inputs
    const tgtPitch = (down('pitchUp') ? 1 : 0) - (down('pitchDown') ? 1 : 0);
    const tgtRoll = (down('rollRight') ? 1 : 0) - (down('rollLeft') ? 1 : 0);
    const tgtYaw = (down('yawRight') ? 1 : 0) - (down('yawLeft') ? 1 : 0);
    const kr = this.controls.keyRate || 1;
    const ramp = (cur, tgt, up, dn) => {
      const rate = (Math.abs(tgt) > Math.abs(cur) ? up : dn) * kr;
      const d = tgt - cur;
      return cur + Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    };
    this.kb.pitch = ramp(this.kb.pitch, tgtPitch, 3.2, 6);
    this.kb.roll = ramp(this.kb.roll, tgtRoll, 5, 8);
    this.kb.yaw = ramp(this.kb.yaw, tgtYaw, 3, 6);

    let pitch = this.kb.pitch, roll = this.kb.roll, yaw = this.kb.yaw;
    let throttleRate = (down('throttleUp') ? 1 : 0) - (down('throttleDown') ? 1 : 0);
    let throttleAbs = null;
    let gun = down('gun');
    let missile = hit('missile');
    let flare = hit('flare');
    let target = hit('target');
    let camera = hit('camera');
    let gear = hit('gear');
    let airbrake = down('brakes');
    let pause = hit('pause') || this.pressed.has('Escape');
    let view = hit('padlock');
    let lockView = hit('lockView');
    let autobrake = hit('autobrake');
    let reverser = hit('reverser');
    let radio = hit('radio');
    let lookX = 0, lookY = 0, look = false;
    if (down('lookLeft')) { lookX -= 1; look = true; }
    if (down('lookRight')) { lookX += 1; look = true; }
    if (down('lookUp')) { lookY -= 1; look = true; }
    if (down('lookDown')) { lookY += 1; look = true; }
    let menuPick = 0;
    const menuClose = this.menuMode && this.pressed.has('Backspace');
    if (this.menuMode) {
      for (let k = 1; k <= 6; k++) if (this.pressed.has('Digit' + k) || this.pressed.has('Numpad' + k)) menuPick = k;
    } else {
      const presets = [['thr0', 0], ['thr25', 0.25], ['thr50', 0.5], ['thr75', 0.75], ['thr90', 0.9], ['thr100', 1]];
      for (const [a, v] of presets) if (hit(a)) throttleAbs = v;
    }

    // Mouse flight: the mouse is a virtual stick, left fires the gun, right a missile
    const m = this.mouse;
    if (m.locked) {
      m.idle += dt;
      if (m.idle > 0.25) {
        const decay = Math.max(0, 1 - dt * 1.2);
        m.x *= decay;
        m.y *= decay;
      }
      if (Math.abs(m.x) > 0.02) roll = Math.abs(roll) > 0 ? roll : m.x;
      if (Math.abs(m.y) > 0.02) pitch = Math.abs(pitch) > 0 ? pitch : m.y;
      if (m.down[0]) gun = true;
      if (this.mouseClick.has(2)) missile = true;
    }
    if (m.wheel !== 0) {
      throttleRate -= m.wheel * 6;
      m.wheel = 0;
    }

    // Gamepad / joystick
    const gp = this.gamepad();
    if (gp) {
      const ctl = this.controls;
      const ax = gp.axes;
      const dead = ctl.deadzone;
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
      const gpPrev = this._gpPrev || [];
      const edge = (i) => b(i) && !gpPrev[i];
      const P = ctl.pad;
      const pDown = (a) => !!P[a] && P[a].some(b);
      const pHit = (a) => !!P[a] && P[a].some(edge);
      const axis = (name) => {
        const a = ctl.axes[name];
        if (!a || a.axis < 0 || a.axis >= ax.length) return 0;
        const v = dz(ax[a.axis] || 0, dead);
        return a.invert ? -v : v;
      };
      const rx = axis('roll'), py = axis('pitch'), yw = axis('yaw'), ly = axis('lookY');
      if (rx || py || yw || ly || gp.buttons.some((x) => x.pressed)) this.lastDevice = 'gamepad';
      if (rx) roll = curve(rx, Math.min(1, ctl.expo + 0.1));
      if (py) pitch = curve(py, ctl.expo);
      if (yw) yaw = yw;
      if (Math.abs(ly) > 0.3) { lookY = ly; look = true; }
      const ta = ctl.axes.throttle;
      if (ta && ta.axis >= 0 && ta.axis < ax.length) {
        // throttle lever: -1..1 mapped to 0..1 (inverted by default: forward = more)
        const raw = ax[ta.axis] || 0;
        const v = ((ta.invert ? -raw : raw) + 1) / 2;
        if (this._lastThrAxis === undefined || Math.abs(v - this._lastThrAxis) > 0.01) {
          throttleAbs = Math.max(0, Math.min(1, v));
          this._lastThrAxis = v;
        }
      }
      if (pDown('throttleUp')) throttleRate += 1;
      if (pDown('throttleDown')) throttleRate -= 1;
      if (pDown('gun')) gun = true;
      if (pHit('missile')) missile = true;
      if (pHit('flare')) flare = true;
      if (pDown('brakes')) airbrake = true;
      if (pHit('reverser')) reverser = true;
      if (pHit('autobrake')) autobrake = true;
      if (pHit('target')) target = true;
      if (pHit('camera')) camera = true;
      if (pHit('pause')) pause = true;
      if (pHit('gear')) gear = true;
      if (pHit('padlock')) view = true;
      if (pHit('lockView')) lockView = true;
      if (pHit('radio')) radio = true;
      for (const [a, v] of [['thr0', 0], ['thr25', 0.25], ['thr50', 0.5], ['thr75', 0.75], ['thr90', 0.9], ['thr100', 1]]) if (pHit(a)) throttleAbs = v;
      if (pDown('pitchUp')) pitch = 1;
      if (pDown('pitchDown')) pitch = -1;
      if (pDown('rollRight')) roll = 1;
      if (pDown('rollLeft')) roll = -1;
      if (pDown('yawRight')) yaw = 1;
      if (pDown('yawLeft')) yaw = -1;
      this._gpPrev = gp.buttons.map((x, i) => b(i));
    }

    // Device tilt (phones / tablets), then the touch stick on top of it
    const g = this.gyro;
    if (g.active) {
      if (Math.abs(g.x) > 0.01 && Math.abs(roll) < 0.05) roll = g.x;
      if (Math.abs(g.y) > 0.01 && Math.abs(pitch) < 0.05) pitch = g.y;
    }
    const t = this.touch;
    if (t.active) {
      if (Math.abs(t.x) > 0.02) roll = t.x;
      if (Math.abs(t.y) > 0.02) pitch = t.y;
    }
    if (t.throttle !== null) throttleAbs = t.throttle;
    if (t.gun) gun = true;
    const tb = t.buttons;

    if (this.settings.invertPitch) pitch = -pitch;

    s.pitch = Math.max(-1, Math.min(1, pitch));
    s.roll = Math.max(-1, Math.min(1, roll));
    s.yaw = Math.max(-1, Math.min(1, yaw));
    s.throttleRate = throttleRate;
    s.throttleAbs = throttleAbs;
    s.gun = gun;
    s.missile = missile || tb.has('missile');
    s.flare = flare || tb.has('flare');
    s.target = target || tb.has('target');
    s.camera = camera || tb.has('camera');
    s.gear = gear || tb.has('gear');
    s.airbrake = airbrake || tb.has('airbrake');
    s.brakes = s.airbrake;
    s.pause = pause || tb.has('pause');
    s.view = view;
    s.lockView = lockView || tb.has('lockview');
    s.autobrake = autobrake || tb.has('autobrake');
    s.reverser = reverser || tb.has('reverser');
    s.radio = radio;
    // the touch RADIO button has no number keys: it sends the top request directly
    s.radioQuick = tb.has('radio');
    s.menuPick = menuPick;
    s.menuClose = menuClose;
    s.lookX = look ? lookX : s.lookX;
    s.lookY = look ? lookY : s.lookY;
    s.look = look;
    s.mouseLook = m.down[2] && !m.locked;

    this.pressed.clear();
    this.mouseClick.clear();
    for (const k of ['missile', 'flare', 'target', 'camera', 'gear', 'pause', 'lockview', 'autobrake', 'reverser', 'radio']) tb.delete(k);
    return s;
  }
}

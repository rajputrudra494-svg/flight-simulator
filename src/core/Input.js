// Unified input: keyboard, mouse (virtual stick with pointer lock), gamepad
// and touch. Produces a normalised control state every frame.

const DEAD = 0.12;
function dz(v) {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * ((a - DEAD) / (1 - DEAD));
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.settings = { invertPitch: false, mouseFlight: false, sensitivity: 1 };
    this.mouse = { x: 0, y: 0, down: [false, false, false], wheel: 0, locked: false, active: false, idle: 0 };
    this.mouseClick = new Set();
    this.touch = { active: false, x: 0, y: 0, throttle: null, gun: false, buttons: new Set() };
    this.state = {
      pitch: 0, roll: 0, yaw: 0, throttleRate: 0, throttleAbs: null,
      gun: false, missile: false, flare: false, target: false, camera: false, gear: false,
      airbrake: false, brakes: false, pause: false, lookX: 0, lookY: 0, look: false, view: false, help: false,
      cycleWeapon: false, lockView: false, weaponCam: false,
      autobrake: false, reverser: false, radio: false,
    };
    this.kb = { pitch: 0, roll: 0, yaw: 0 };
    this.gamepadIndex = null;
    this.lastDevice = 'keyboard';
    this.enabled = true;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const code = e.code;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      this.lastDevice = 'keyboard';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = [false, false, false];
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
      this.mouse.down[e.button] = true;
      this.mouseClick.add(e.button);
      if (this.settings.mouseFlight && !this.mouse.locked && this.enabled && e.button === 0) {
        c.requestPointerLock?.();
      }
    });
    window.addEventListener('mouseup', (e) => { this.mouse.down[e.button] = false; });
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

  _gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (const p of pads) if (p && p.connected) { this.gamepadIndex = p.index; return p; }
    return null;
  }

  update(dt) {
    const s = this.state;
    const k = this.keys;
    const pr = this.pressed;
    const any = (...codes) => codes.some((c) => k.has(c));
    const hit = (...codes) => codes.some((c) => pr.has(c));

    // Keyboard axes with smoothing so taps give gentle inputs
    const tgtPitch = (any('KeyS', 'ArrowDown') ? 1 : 0) - (any('KeyW', 'ArrowUp') ? 1 : 0);
    const tgtRoll = (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0);
    const tgtYaw = (any('KeyE') ? 1 : 0) - (any('KeyQ') ? 1 : 0);
    const ramp = (cur, tgt, up, down) => {
      const rate = Math.abs(tgt) > Math.abs(cur) ? up : down;
      const d = tgt - cur;
      return cur + Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    };
    this.kb.pitch = ramp(this.kb.pitch, tgtPitch, 3.2, 6);
    this.kb.roll = ramp(this.kb.roll, tgtRoll, 5, 8);
    this.kb.yaw = ramp(this.kb.yaw, tgtYaw, 3, 6);

    let pitch = this.kb.pitch, roll = this.kb.roll, yaw = this.kb.yaw;
    let throttleRate = (any('ShiftLeft', 'ShiftRight', 'KeyR', 'Equal', 'NumpadAdd') ? 1 : 0) - (any('KeyF', 'Minus', 'NumpadSubtract') ? 1 : 0);
    let throttleAbs = null;
    let gun = any('Space');
    let missile = hit('Enter', 'KeyX', 'NumpadEnter');
    let flare = hit('KeyV', 'KeyZ');
    const target = hit('KeyT', 'Tab');
    const camera = hit('KeyC');
    const gear = hit('KeyG');
    let airbrake = any('KeyB');
    let brakes = any('KeyB');
    const pause = hit('Escape', 'KeyP');
    const help = hit('KeyH', 'F1');
    const view = hit('KeyL');
    const cycleWeapon = hit('KeyN');
    let lockView = hit('KeyY');
    const weaponCam = hit('KeyK');
    // deceleration devices and radio
    let autobrake = hit('KeyU');
    let reverser = hit('KeyJ');
    let radio = hit('KeyM');
    if (this.mouseClick.has(1)) lockView = true;
    let lookX = 0, lookY = 0, look = false;
    if (any('Numpad4')) { lookX -= 1; look = true; }
    if (any('Numpad6')) { lookX += 1; look = true; }
    if (any('Numpad8')) { lookY -= 1; look = true; }
    if (any('Numpad2')) { lookY += 1; look = true; }
    if (throttleAbs === null && hit('Digit1')) throttleAbs = 0.25;
    if (hit('Digit2')) throttleAbs = 0.5;
    if (hit('Digit3')) throttleAbs = 0.75;
    if (hit('Digit4')) throttleAbs = 0.9;
    if (hit('Digit5')) throttleAbs = 1.0;
    if (hit('Digit0')) throttleAbs = 0;

    // Mouse
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
    } else if (m.down[0] && this.settings.mouseFlight === false) {
      // plain click does nothing in flight without mouse flight (avoid accidental fire)
    }
    if (m.wheel !== 0) {
      throttleRate -= m.wheel * 6;
      m.wheel = 0;
    }

    // Gamepad
    const gp = this._gamepad();
    if (gp) {
      const ax = gp.axes;
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
      const bv = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
      if (lx || ly || rx || ry || gp.buttons.some((x) => x.pressed)) this.lastDevice = 'gamepad';
      if (Math.abs(lx) > 0) roll = lx * Math.abs(lx) * 0.6 + lx * 0.4;
      if (Math.abs(ly) > 0) pitch = ly * Math.abs(ly) * 0.5 + ly * 0.5;
      if (Math.abs(rx) > 0) yaw = rx;
      if (Math.abs(ry) > 0.3) { lookY = ry; look = true; }
      if (b(5) || b(12)) throttleRate += 1;
      if (b(4) || b(13)) throttleRate -= 1;
      if (bv(7) > 0.3) gun = true;
      const gpPrev = this._gpPrev || [];
      const edge = (i) => b(i) && !gpPrev[i];
      if (edge(6) || edge(0)) missile = true;
      if (edge(1)) flare = true;
      if (b(10)) airbrake = brakes = true;
      if (edge(14)) reverser = true;
      if (edge(15)) autobrake = true;
      this._gpEdges = {
        target: edge(2), camera: edge(3), pause: edge(9), gear: edge(8), look: edge(11),
      };
      this._gpPrev = gp.buttons.map((x, i) => b(i));
    } else this._gpEdges = null;

    // Touch
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
    const ge = this._gpEdges || {};
    s.target = target || tb.has('target') || !!ge.target;
    s.camera = camera || tb.has('camera') || !!ge.camera;
    s.gear = gear || tb.has('gear') || !!ge.gear;
    s.airbrake = airbrake || tb.has('airbrake');
    s.brakes = brakes || tb.has('airbrake');
    s.pause = pause || tb.has('pause') || !!ge.pause;
    s.help = help;
    s.view = view;
    s.cycleWeapon = cycleWeapon || tb.has('weapon');
    s.lockView = lockView || tb.has('lockview');
    s.weaponCam = weaponCam;
    s.autobrake = autobrake || tb.has('autobrake');
    s.reverser = reverser || tb.has('reverser');
    s.radio = radio || tb.has('radio');
    s.lookX = look ? lookX : s.lookX;
    s.lookY = look ? lookY : s.lookY;
    s.look = look;
    s.mouseLook = m.down[2] && !m.locked;

    this.pressed.clear();
    this.mouseClick.clear();
    tb.delete('missile'); tb.delete('flare'); tb.delete('target'); tb.delete('camera'); tb.delete('gear'); tb.delete('pause'); tb.delete('weapon'); tb.delete('lockview'); tb.delete('autobrake'); tb.delete('reverser'); tb.delete('radio');
    return s;
  }
}
